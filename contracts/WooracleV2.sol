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
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import './libraries/InitializableOwnable.sol';
import './libraries/DecimalMath.sol';
import './interfaces/IWooracleV2.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import 'hardhat/console.sol';

/// @title Wooracle V2 contract
contract WooracleV2 is InitializableOwnable, IWooracleV2 {
    using SafeMath for uint256;
    using DecimalMath for uint256;
    /* ----- State variables ----- */

    // 128 + 64 + 64 = 256 bits (slot size)
    struct TokenInfo {
        uint128 price; // as chainlink oracle (e.g. decimal = 8)
        uint64 coeff; // 18.
        uint64 spread; // 18. spread <= 2e18   (2^64 = 1.84e19)
    }

    struct CLOracle {
        address oracle;
        uint8 decimal;
    }

    mapping(address => TokenInfo) public infos;

    mapping(address => CLOracle) public clOracles; // token to chainlink oracle.

    address public override quoteToken;
    uint256 public override timestamp;

    uint256 public staleDuration;
    uint64 public bound;

    mapping(address => bool) public wooFeasible;
    mapping(address => bool) public clFeasible;

    constructor() public {
        initOwner(msg.sender);
        staleDuration = uint256(300);
        bound = uint64(1e16); // 1%
    }

    /* ----- External Functions ----- */

    // TODO for wooracle V2

    /// @dev Set the quote token address.
    /// @param _oracle the token address
    function setQuoteToken(address _quote, address _oracle) external onlyOwner {
        quoteToken = _quote;
        clOracles[_quote].oracle = _oracle;
        clOracles[_quote].decimal = AggregatorV3Interface(_oracle).decimals();
    }

    function setBound(uint64 _bound) external onlyOwner {
        bound = _bound;
    }

    function setCLOracle(address token, address _oracle) external onlyOwner {
        clOracles[token].oracle = _oracle;
        clOracles[token].decimal = AggregatorV3Interface(_oracle).decimals();
    }

    /// @dev Set the staleDuration.
    /// @param newStaleDuration the new stale duration
    function setStaleDuration(uint256 newStaleDuration) external onlyOwner {
        staleDuration = newStaleDuration;
    }

    /// @dev Update the base token prices.
    /// @param base the baseToken address
    /// @param newPrice the new prices for the base token
    function postPrice(address base, uint128 newPrice) external onlyOwner {
        infos[base].price = newPrice;
        timestamp = block.timestamp;
    }

    /// @dev batch update baseTokens prices
    /// @param bases list of baseToken address
    /// @param newPrices the updated prices list
    function postPriceList(address[] calldata bases, uint128[] calldata newPrices) external onlyOwner {
        uint256 length = bases.length;
        require(length == newPrices.length, 'Wooracle: length_INVALID');

        for (uint256 i = 0; i < length; i++) {
            infos[bases[i]].price = newPrices[i];
        }

        timestamp = block.timestamp;
    }

    /// @dev update the spreads info.
    /// @param base baseToken address
    /// @param newSpread the new spreads
    function postSpread(address base, uint64 newSpread) external onlyOwner {
        infos[base].spread = newSpread;
        timestamp = block.timestamp;
    }

    /// @dev batch update the spreads info.
    /// @param bases list of baseToken address
    /// @param newSpreads list of spreads info
    function postSpreadList(address[] calldata bases, uint64[] calldata newSpreads) external onlyOwner {
        uint256 length = bases.length;
        require(length == newSpreads.length, 'Wooracle: length_INVALID');

        for (uint256 i = 0; i < length; i++) {
            infos[bases[i]].spread = newSpreads[i];
        }

        timestamp = block.timestamp;
    }

    /// @dev update the state of the given base token.
    /// @param base baseToken address
    /// @param newPrice the new prices
    /// @param newSpread the new spreads
    /// @param newCoeff the new slippage coefficent
    function postState(
        address base,
        uint128 newPrice,
        uint64 newSpread,
        uint64 newCoeff
    ) external onlyOwner {
        _setState(base, newPrice, newSpread, newCoeff);
        timestamp = block.timestamp;
    }

    /// @dev batch update the prices, spreads and slipagge coeffs info.
    /// @param bases list of baseToken address
    /// @param newPrices the prices list
    /// @param newSpreads the spreads list
    /// @param newCoeffs the slippage coefficent list
    function postStateList(
        address[] calldata bases,
        uint128[] calldata newPrices,
        uint64[] calldata newSpreads,
        uint64[] calldata newCoeffs
    ) external onlyOwner {
        uint256 length = bases.length;
        for (uint256 i = 0; i < length; i++) {
            _setState(bases[i], newPrices[i], newSpreads[i], newCoeffs[i]);
        }
        timestamp = block.timestamp;
    }

    function price(address base) external view override returns (uint256 priceOut, uint256 priceTimestamp) {
        uint256 woPrice = uint256(infos[base].price);
        uint256 woPriceTimestamp = timestamp;

        (uint256 cloPrice, uint256 cloPriceTimestamp) = _refPrice(base, quoteToken);

        bool checkWoFeasible = woPrice != 0 && block.timestamp <= (woPriceTimestamp + staleDuration);
        bool checkWoBound = cloPrice == 0 ||
            (cloPrice.mulFloor(1e18 - bound) <= woPrice && woPrice <= cloPrice.mulCeil(1e18 + bound));

        // console.log('checkWoFeasible: %s checkWoBound: %s', checkWoFeasible, checkWoBound);

        if (checkWoFeasible && checkWoBound) {
            priceOut = woPrice;
            priceTimestamp = woPriceTimestamp;
        } else {
            priceOut = cloPrice;
            priceTimestamp = cloPriceTimestamp;
        }
    }

    function decimals(address base) external view override returns (uint8) {
        return clOracles[base].decimal;
    }

    function setWooFeasible(address base, bool feasible) external onlyOwner {
        wooFeasible[base] = feasible;
    }

    function setCLFeasible(address base, bool feasible) external onlyOwner {
        clFeasible[base] = feasible;
    }

    function cloPrice(address base) external view override returns (uint256, uint256) {
        return _refPrice(base, quoteToken);
    }

    function isWoFeasible(address base) external view override returns (bool) {
        return infos[base].price != 0 && block.timestamp <= (timestamp + staleDuration);
    }

    function woSpread(address base) external view override returns (uint64) {
        return infos[base].spread;
    }

    function woCoeff(address base) external view override returns (uint64) {
        return infos[base].coeff;
    }

    // Wooracle price of the base token
    function woPrice(address base) external view override returns (uint128 priceOut, uint256 priceTimestamp) {
        priceOut = infos[base].price;
        priceTimestamp = timestamp;
    }

    function woState(address base)
        external
        view
        override
        returns (
            uint128 priceNow,
            uint64 spreadNow,
            uint64 coeffNow,
            uint256 priceTimestamp
        )
    {
        TokenInfo storage info = infos[base];
        priceNow = info.price;
        spreadNow = info.spread;
        coeffNow = info.coeff;
        priceTimestamp = timestamp;
    }

    function cloAddress(address base) external view override returns (address clo) {
        clo = clOracles[base].oracle;
    }

    /* ----- Private Functions ----- */
    function _setState(
        address base,
        uint128 newPrice,
        uint64 newSpread,
        uint64 newCoeff
    ) private {
        TokenInfo storage info = infos[base];
        info.price = newPrice;
        info.spread = newSpread;
        info.coeff = newCoeff;
    }

    function _refPrice(address fromToken, address toToken)
        private
        view
        returns (uint256 refPrice, uint256 refTimestamp)
    {
        address baseOracle = clOracles[fromToken].oracle;
        if (baseOracle == address(0)) {
            return (0, 0);
        }
        address quoteOracle = clOracles[toToken].oracle;
        uint8 quoteDecimal = clOracles[toToken].decimal;

        (, int256 rawBaseRefPrice, , uint256 baseUpdatedAt, ) = AggregatorV3Interface(baseOracle).latestRoundData();
        (, int256 rawQuoteRefPrice, , uint256 quoteUpdatedAt, ) = AggregatorV3Interface(quoteOracle).latestRoundData();
        uint256 baseRefPrice = uint256(rawBaseRefPrice);
        uint256 quoteRefPrice = uint256(rawQuoteRefPrice);

        // NOTE: Assume wooracle token decimal is same as chainlink token decimal.
        uint256 ceoff = uint256(10)**uint256(quoteDecimal);
        refPrice = baseRefPrice.mul(ceoff).div(quoteRefPrice);
        refTimestamp = baseUpdatedAt >= quoteUpdatedAt ? quoteUpdatedAt : baseUpdatedAt;
    }
}
