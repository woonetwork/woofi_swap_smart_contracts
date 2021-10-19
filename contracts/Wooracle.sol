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
import './interfaces/IWooracle.sol';


/// @title Wooracle implementation
/// @notice Will be maintained and updated periodically by Woo.network in multichains.
contract Wooracle is InitializableOwnable, IWooracle {

    /* ----- State variables ----- */

    mapping(address => uint256) public prices;
    mapping(address => uint256) public coeffs;
    mapping(address => uint256) public spreads;
    mapping(address => bool) public isValid;

    address public override quoteToken;
    uint256 public override timestamp;

    uint256 public staleDuration;

    constructor() public {
        initOwner(msg.sender);
        staleDuration = uint256(300);
    }

    /* ----- External Functions ----- */

    /// @dev Set the quote token address.
    /// @param newQuoteToken token address
    function setQuoteToken(address newQuoteToken) external onlyOwner {
        quoteToken = newQuoteToken;
    }

    /// @dev Set the staleDuration.
    /// @param newStaleDuration the new stale duration
    function setStaleDuration(uint256 newStaleDuration) external onlyOwner {
        staleDuration = newStaleDuration;
    }

    /// @dev Update the base token prices.
    /// @param base the baseToken address
    /// @param newPrice the new prices for the base token
    function postPrice(address base, uint256 newPrice) external onlyOwner {
        if (newPrice == uint256(0)) {
            isValid[base] = false;
        } else {
            prices[base] = newPrice;
            isValid[base] = true;
        }
        timestamp = block.timestamp;
    }

    /// @dev batch update baseTokens prices
    /// @param bases list of baseToken address
    /// @param newPrices the updated prices list
    function postPriceList(address[] calldata bases, uint256[] calldata newPrices) external onlyOwner {
        uint256 length = bases.length;
        require(length == newPrices.length, 'Wooracle: length_INVALID');

        for (uint256 i = 0; i < length; i++) {
            if (newPrices[i] == uint256(0)) {
                isValid[bases[i]] = false;
            } else {
                prices[bases[i]] = newPrices[i];
                isValid[bases[i]] = true;
            }
        }

        timestamp = block.timestamp;
    }

    /// @dev update the spreads info.
    /// @param base baseToken address
    /// @param newSpread the new spreads
    function postSpread(address base, uint256 newSpread) external onlyOwner {
        spreads[base] = newSpread;
        timestamp = block.timestamp;
    }

    /// @dev batch update the spreads info.
    /// @param bases list of baseToken address
    /// @param newSpreads list of spreads info
    function postSpreadList(address[] calldata bases, uint256[] calldata newSpreads) external onlyOwner {
        uint256 length = bases.length;
        require(length == newSpreads.length, 'Wooracle: length_INVALID');

        for (uint256 i = 0; i < length; i++) {
            spreads[bases[i]] = newSpreads[i];
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
        uint256 newPrice,
        uint256 newSpread,
        uint256 newCoeff
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
        uint256[] calldata newPrices,
        uint256[] calldata newSpreads,
        uint256[] calldata newCoeffs
    ) external onlyOwner {
        uint256 length = bases.length;
        require(
            length == newPrices.length && length == newSpreads.length && length == newCoeffs.length,
            'Wooracle: length_INVALID'
        );

        for (uint256 i = 0; i < length; i++) {
            _setState(bases[i], newPrices[i], newSpreads[i], newCoeffs[i]);
        }
        timestamp = block.timestamp;
    }

    /// @inheritdoc IWooracle
    function price(address base) external view override returns (uint256 priceNow, bool feasible) {
        priceNow = prices[base];
        feasible = isFeasible(base);
    }

    /// @inheritdoc IWooracle
    function state(address base)
        external
        view
        override
        returns (
            uint256 priceNow,
            uint256 spreadNow,
            uint256 coeffNow,
            bool feasible
        )
    {
        priceNow = prices[base];
        spreadNow = spreads[base];
        coeffNow = coeffs[base];
        feasible = isFeasible(base);
    }

    function isFeasible(address base) public view override returns (bool) {
        return isValid[base] && (block.timestamp <= timestamp + staleDuration * 1 seconds);
    }

    /* ----- Private Functions ----- */

    function _setState(
        address base,
        uint256 newPrice,
        uint256 newSpread,
        uint256 newCoeff
    ) private {
        if (newPrice == uint256(0)) {
            isValid[base] = false;
        } else {
            prices[base] = newPrice;
            spreads[base] = newSpread;
            coeffs[base] = newCoeff;
            isValid[base] = true;
        }
    }
}
