// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
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

import './library/InitializableOwnable.sol';
import './library/DecimalMath.sol';
import './interfaces/IOracle.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * The manager class for WooDex's trading fee discount and rewards.
 */
contract RewardManager is InitializableOwnable {
    using SafeMath for uint256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    mapping(address => bool) public isApproved;

    modifier onlyApproved() {
        require(msg.sender == _OWNER_ || isApproved[msg.sender], 'NOT_APPROVED');
        _;
    }

    uint256 public rewardRatio;
    address public rewardToken; // WOO

    address public priceOracle; // WooOracle
    address public rewardChainlinkRefOracle; // Reference
    address public quoteChainlinkRefOracle; // Reference
    uint8 internal quoteDecimals;
    uint256 internal refPriceFixCoeff;

    mapping(address => uint256) public pendingReward;

    function init(
        address owner,
        uint256 _rewardRatio,
        address _rewardToken,
        address _priceOracle,
        address _rewardChainlinkRefOracle,
        address _quoteChainlinkRefOracle,
        address quoteToken
    ) external {
        require(owner != address(0), 'INVALID_OWNER');
        require(_rewardRatio <= 1e18, 'INVALID_REWARD_RATIO');
        require(_rewardToken != address(0), 'INVALID_RAWARD_TOKEN');
        require(_priceOracle != address(0), 'INVALID_ORACLE');
        require(quoteToken != address(0), 'INVALID_QUOTE');

        initOwner(owner);
        rewardRatio = _rewardRatio;
        rewardToken = _rewardToken;
        priceOracle = _priceOracle;
        rewardChainlinkRefOracle = _rewardChainlinkRefOracle;
        quoteChainlinkRefOracle = _quoteChainlinkRefOracle;
        quoteDecimals = IERC20(quoteToken).decimals();
        if (rewardChainlinkRefOracle != address(0) && quoteChainlinkRefOracle != address(0)) {
            uint256 rewardDecimalsToFix = uint256(IERC20(rewardToken).decimals()).add(
                uint256(AggregatorV3Interface(rewardChainlinkRefOracle).decimals())
            );
            uint256 rewardRefPriceFixCoeff = 10**(uint256(36).sub(rewardDecimalsToFix));
            require(rewardRefPriceFixCoeff < type(uint96).max);
            uint256 quoteDecimalsToFix = uint256(quoteDecimals).add(
                uint256(AggregatorV3Interface(quoteChainlinkRefOracle).decimals())
            );
            uint256 quoteRefPriceFixCoeff = 10**(uint256(36).sub(quoteDecimalsToFix));
            require(quoteRefPriceFixCoeff < type(uint96).max);
            refPriceFixCoeff = rewardRefPriceFixCoeff.divFloor(quoteRefPriceFixCoeff);
        }
    }

    function addReward(address user, uint256 amount) external onlyApproved {
        // amount in USDT
        require(user != address(0), 'INVALID_OWNER');
        (uint256 price, bool isFeasible) = IOracle(priceOracle).getPrice(rewardToken);
        if (!isFeasible || !isPriceReliable(price)) {
            return;
        }
        uint256 rewardAmount = amount.mulFloor(rewardRatio).divFloor(price);
        pendingReward[user] = pendingReward[user].add(rewardAmount);
    }

    function claimReward(address user) external {
        uint256 amount = pendingReward[user];
        uint256 balance = IERC20(rewardToken).balanceOf(address(this));
        uint256 amountToTransfer = amount < balance ? amount : balance;
        pendingReward[user] = amount.sub(amountToTransfer);
        IERC20(rewardToken).safeTransfer(user, amountToTransfer);
    }

    function withdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function withdrawAll(address token, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }

    function approve(address user) external onlyOwner {
        isApproved[user] = true;
    }

    function revoke(address user) external onlyOwner {
        isApproved[user] = false;
    }

    function setPriceOracle(address newPriceOracle) external onlyApproved {
        require(newPriceOracle != address(0), 'INVALID_ORACLE');
        priceOracle = newPriceOracle;
    }

    function setChainlinkRefOracle(address newRewardChainlinkRefOracle, address newQuoteChainlinkRefOracle)
        external
        onlyApproved
    {
        rewardChainlinkRefOracle = newRewardChainlinkRefOracle;
        quoteChainlinkRefOracle = newQuoteChainlinkRefOracle;
        if (rewardChainlinkRefOracle != address(0) && quoteChainlinkRefOracle != address(0)) {
            uint256 rewardDecimalsToFix = uint256(IERC20(rewardToken).decimals()).add(
                uint256(AggregatorV3Interface(rewardChainlinkRefOracle).decimals())
            );
            uint256 rewardRefPriceFixCoeff = 10**(uint256(36).sub(rewardDecimalsToFix));
            require(rewardRefPriceFixCoeff < type(uint96).max);
            uint256 quoteDecimalsToFix = uint256(quoteDecimals).add(
                uint256(AggregatorV3Interface(quoteChainlinkRefOracle).decimals())
            );
            uint256 quoteRefPriceFixCoeff = 10**(uint256(36).sub(quoteDecimalsToFix));
            require(quoteRefPriceFixCoeff < type(uint96).max);
            refPriceFixCoeff = rewardRefPriceFixCoeff.divFloor(quoteRefPriceFixCoeff);
        }
    }

    function isPriceReliable(uint256 price) internal view returns (bool) {
        if (rewardChainlinkRefOracle == address(0) || quoteChainlinkRefOracle == address(0))
            // price checking disabled
            return true;
        // check Chainlink
        (, int256 rawRewardRefPrice, , , ) = AggregatorV3Interface(rewardChainlinkRefOracle).latestRoundData();
        require(rawRewardRefPrice >= 0, 'INVALID_CHAINLINK_PRICE');
        (, int256 rawQuoteRefPrice, , , ) = AggregatorV3Interface(quoteChainlinkRefOracle).latestRoundData();
        require(rawQuoteRefPrice >= 0, 'INVALID_CHAINLINK_QUOTE_PRICE');
        uint256 refPrice = uint256(rawRewardRefPrice).divFloor(uint256(rawQuoteRefPrice));
        refPrice = refPrice.mul(refPriceFixCoeff);
        return uint256(refPrice).mulFloor(1e18 - 1e16) <= price && price <= uint256(refPrice).mulCeil(1e18 + 1e16);
    }
}
