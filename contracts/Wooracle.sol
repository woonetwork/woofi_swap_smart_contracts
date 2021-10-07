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

contract Wooracle is InitializableOwnable {
    mapping(address => uint256) public price;
    mapping(address => uint128) public coeff;
    mapping(address => uint64) public spread;
    mapping(address => bool) public isValid;

    uint256 public timestamp;
    uint256 public staleDuration;

    address public quoteAddr;

    constructor() public {
        initOwner(msg.sender);
        staleDuration = uint256(300);
    }

    function setQuoteAddr(address newQuoteAddr) external onlyOwner {
        quoteAddr = newQuoteAddr;
    }

    function setStaleDuration(uint256 newStaleDuration) external onlyOwner {
        staleDuration = newStaleDuration;
    }

    function postPrice(address base, uint256 newPrice) external onlyOwner {
        if (newPrice == uint256(0)) {
            isValid[base] = false;
        } else {
            price[base] = newPrice;
            isValid[base] = true;
        }
        timestamp = block.timestamp;
    }

    function postPriceList(address[] calldata bases, uint256[] calldata newPrices) external onlyOwner {
        uint256 length = bases.length;
        require(length == newPrices.length);

        for (uint256 i = 0; i < length; i++) {
            if (newPrices[i] == uint256(0)) {
                isValid[bases[i]] = false;
            } else {
                price[bases[i]] = newPrices[i];
                isValid[bases[i]] = true;
            }
        }

        timestamp = block.timestamp;
    }

    function postSpread(address base, uint64 newSpread) external onlyOwner {
        spread[base] = newSpread;
        timestamp = block.timestamp;
    }

    function postSpreadList(address[] calldata bases, uint64[] calldata newSpreads) external onlyOwner {
        uint256 length = bases.length;
        require(length == newSpreads.length);

        for (uint256 i = 0; i < length; i++) {
            spread[bases[i]] = newSpreads[i];
        }

        timestamp = block.timestamp;
    }

    function postState(
        address base,
        uint256 newPrice,
        uint64 newSpread,
        uint128 newCoeff
    ) external onlyOwner
    {
        _setState(base, newPrice, newSpread, newCoeff);
        timestamp = block.timestamp;
    }

    function postStateList(
        address[] calldata bases,
        uint256[] calldata newPrices,
        uint64[] calldata newSpreads,
        uint128[] calldata newCoeffs
    ) external onlyOwner
    {
        uint256 length = bases.length;
        require(length == newPrices.length && length == newSpreads.length && length == newCoeffs.length);

        for (uint256 i = 0; i < length; i++) {
            _setState(bases[i], newPrices[i], newSpreads[i], newCoeffs[i]);
        }
        timestamp = block.timestamp;
    }

    function getPrice(address base) external view returns (uint256 priceNow, bool feasible) {
        priceNow = price[base];
        feasible = isFeasible(base);
    }

    function getState(address base)
        external
        view
        returns (
            uint256 priceNow,
            uint64 spreadNow,
            uint128 coeffNow,
            bool feasible
        )
    {
        priceNow = price[base];
        spreadNow = spread[base];
        coeffNow = coeff[base];
        feasible = isFeasible(base);
    }

    function isStale() public view returns (bool) {
        return block.timestamp > timestamp + staleDuration * 1 seconds;
    }

    function isFeasible(address base) public view returns (bool) {
        return isValid[base] && !isStale();
    }

    function _setState(
        address base,
        uint256 newPrice,
        uint64 newSpread,
        uint128 newCoeff
    ) private
    {
        if (newPrice == uint256(0)) {
            isValid[base] = false;
        } else {
            price[base] = newPrice;
            spread[base] = newSpread;
            coeff[base] = newCoeff;
            isValid[base] = true;
        }
    }
}
