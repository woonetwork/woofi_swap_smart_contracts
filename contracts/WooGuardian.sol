// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

/*

░██╗░░░░░░░██╗░█████╗░░█████╗░░░░░░░███████╗██╗
░██║░░██╗░░██║██╔══██╗██╔══██╗░░░░░░██╔════╝██║
░╚██╗████╗██╔╝██║░░██║██║░░██║█████╗█████╗░░██║
░░████╔═████║░██║░░██║██║░░██║╚════╝██╔══╝░░██║
░░╚██╔╝░╚██╔╝░╚█████╔╝╚█████╔╝░░░░░░██║░░░░░██║
░░░╚═╝░░░╚═╝░░░╚════╝░░╚════╝░░░░░░░╚═╝░░░░░╚═╝

*
* MIT License
* ===========
*
* Copyright (c) 2020 WooTrade
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
*/

import './libraries/InitializableOwnable.sol';
import './libraries/DecimalMath.sol';
import './interfaces/IWooGuardian.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';

/// @title Woo guardian implementation.
contract WooGuardian is IWooGuardian, InitializableOwnable {
    using SafeMath for uint256;
    using DecimalMath for uint256;

    /* ----- Type declarations ----- */

    struct RefInfo {
        address chainlinkRefOracle; // chainlink oracle for price checking
        uint96 refPriceFixCoeff; // chainlink price fix coeff
    }

    /* ----- State variables ----- */

    mapping(address => RefInfo) public refInfo;
    uint256 public priceBound;

    constructor(uint256 newPriceBound) public {
        initOwner(msg.sender);
        require(priceBound <= 1e18, 'WooGuardian: priceBound out of range');
        priceBound = newPriceBound;
    }

    function checkSwapPrice(
        uint256 price,
        address fromToken,
        address toToken
    ) external view override {
        require(fromToken != address(0), 'WooGuardian: fromToken_ZERO_ADDR');
        require(toToken != address(0), 'WooGuardian: toToken_ZERO_ADDR');

        uint256 refPrice = _refPrice(fromToken, toToken);

        require(
            refPrice.mulFloor(1e18 - priceBound) <= price && price <= refPrice.mulCeil(1e18 + priceBound),
            'WooGuardian: PRICE_UNRELIABLE'
        );
    }

    function checkSwapAmount(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 toAmount
    ) external view override {
        require(fromToken != address(0), 'WooGuardian: fromToken_ZERO_ADDR');
        require(toToken != address(0), 'WooGuardian: toToken_ZERO_ADDR');

        uint256 refPrice = _refPrice(fromToken, toToken);
        uint256 refToAmount = fromAmount.mulFloor(refPrice);
        require(
            refToAmount.mulFloor(1e18 - priceBound) <= toAmount && toAmount <= refToAmount.mulCeil(1e18 + priceBound),
            'WooGuardian: TO_AMOUNT_UNRELIABLE'
        );
    }

    function setToken(address token, address chainlinkRefOracle) external onlyOwner {
        require(token != address(0), 'WooPP: token_ZERO_ADDR');
        RefInfo storage info = refInfo[token];
        info.chainlinkRefOracle = chainlinkRefOracle;
        info.refPriceFixCoeff = _refPriceFixCoeff(token, chainlinkRefOracle);
        emit ChainlinkRefOracleUpdated(token, chainlinkRefOracle);
    }

    function _refPriceFixCoeff(address token, address chainlink) private view returns (uint96) {
        if (chainlink == address(0)) {
            return 0;
        }

        // About decimals:
        // For a sell base trade, we have quoteSize = baseSize * price
        // For calculation convenience, the decimals of price is 18-base.decimals+quote.decimals
        // If we have price = basePrice / quotePrice, then decimals of tokenPrice should be 36-token.decimals()
        // We use chainlink oracle price as token reference price, which decimals is chainlinkPrice.decimals()
        // We should multiply it by 10e(36-(token.decimals+chainlinkPrice.decimals)), which is refPriceFixCoeff
        uint256 decimalsToFix = uint256(ERC20(token).decimals()).add(
            uint256(AggregatorV3Interface(chainlink).decimals())
        );
        uint256 refPriceFixCoeff = 10**(uint256(36).sub(decimalsToFix));
        require(refPriceFixCoeff <= type(uint96).max);
        return uint96(refPriceFixCoeff);
    }

    function _refPrice(address fromToken, address toToken) private view returns (uint256) {
        RefInfo storage baseInfo = refInfo[fromToken];
        RefInfo storage quoteInfo = refInfo[toToken];

        require(baseInfo.chainlinkRefOracle != address(0), 'WooGuardian: fromToken_RefOracle_INVALID');
        require(quoteInfo.chainlinkRefOracle != address(0), 'WooGuardian: toToken_RefOracle_INVALID');

        (, int256 rawBaseRefPrice, , , ) = AggregatorV3Interface(baseInfo.chainlinkRefOracle).latestRoundData();
        require(rawBaseRefPrice >= 0, 'WooGuardian: INVALID_CHAINLINK_PRICE');
        (, int256 rawQuoteRefPrice, , , ) = AggregatorV3Interface(quoteInfo.chainlinkRefOracle).latestRoundData();
        require(rawQuoteRefPrice >= 0, 'WooGuardian: INVALID_CHAINLINK_QUOTE_PRICE');
        uint256 baseRefPrice = uint256(rawBaseRefPrice).mul(uint256(baseInfo.refPriceFixCoeff));
        uint256 quoteRefPrice = uint256(rawQuoteRefPrice).mul(uint256(quoteInfo.refPriceFixCoeff));

        return baseRefPrice.divFloor(quoteRefPrice);
    }
}
