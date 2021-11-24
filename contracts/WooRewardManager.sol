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
import './interfaces/IWooracle.sol';
import './interfaces/IWooRewardManager.sol';
import './interfaces/IWooGuardian.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract WooRewardManager is InitializableOwnable, IWooRewardManager {
    using SafeMath for uint256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    struct RewardInfo {
        uint128 userRewardRate;
        uint128 brokerRewardRate;
    }

    mapping(address => bool) public isApproved;

    modifier onlyApproved() {
        require(msg.sender == _OWNER_ || isApproved[msg.sender], 'RewardManager: NOT_APPROVED');
        _;
    }

    event PriceOracleUpdated(address indexed newPriceOracle);
    event Withdraw(address indexed token, address indexed to, uint256 amount);
    event Approve(address indexed user, bool approved);
    event ClaimReward(address indexed user, uint256 amount);

    mapping(address => RewardInfo) public rewardInfoByBroker;
    // uint256 public rewardRate;
    address public quoteToken; // USDT
    address public rewardToken; // WOO

    address public priceOracle; // WooOracle
    address wooGuardian; // WooGuardian

    mapping(address => uint256) public pendingReward;

    constructor(
        address owner,
        address newQuoteToken,
        address newRewardToken,
        address newPriceOracle,
        address newWooGuardian
    ) public {
        require(owner != address(0), 'WooRewardManager: INVALID_OWNER');
        require(newQuoteToken != address(0), 'WooRewardManager: INVALID_QUOTE');
        require(newRewardToken != address(0), 'WooRewardManager: INVALID_RAWARD_TOKEN');
        require(newPriceOracle != address(0), 'WooRewardManager: INVALID_ORACLE');
        require(newWooGuardian != address(0), 'WooRewardManager: INVALID_GUARDIAN');
        initOwner(owner);
        quoteToken = newQuoteToken;
        rewardToken = newRewardToken;
        priceOracle = newPriceOracle;
        wooGuardian = newWooGuardian;
        emit PriceOracleUpdated(newPriceOracle);
    }

    function getRewardInfo(address broker)
        external
        view
        override
        returns (uint256 userRewardRate, uint256 brokerRewardRate)
    {
        if (broker != address(0)) {
            userRewardRate = rewardInfoByBroker[broker].userRewardRate;
            brokerRewardRate = rewardInfoByBroker[broker].userRewardRate;
        } else {
            // TODO reward rate without broker
            userRewardRate = 0;
            brokerRewardRate = 0;
        }
    }

    function addReward(address user, uint256 amount) external override onlyApproved {
        // amount of reward in USDT
        if (user == address(0)) {
            return;
        }
        (uint256 price, bool isFeasible) = IWooracle(priceOracle).price(rewardToken);
        require(isFeasible, 'WooRewardManager: PRICE_NOT_FEASIBLE');
        IWooGuardian(wooGuardian).checkSwapPrice(price, quoteToken, rewardToken);
        uint256 rewardAmount = amount.divFloor(price);
        pendingReward[user] = pendingReward[user].add(rewardAmount);
    }

    function claimReward(address user) external override {
        uint256 amount = pendingReward[user];
        uint256 balance = IERC20(rewardToken).balanceOf(address(this));
        uint256 amountToTransfer = amount < balance ? amount : balance;
        pendingReward[user] = amount.sub(amountToTransfer);
        IERC20(rewardToken).safeTransfer(user, amountToTransfer);
        emit ClaimReward(user, amountToTransfer);
    }

    function setRewardInfoByBroker(
        address broker,
        uint256 userRewardRate,
        uint256 brokerRewardRate
    ) external onlyOwner {
        require(broker != address(0), 'WooRewardManager: INVALID_BROKER');
        require(userRewardRate <= 1e18, 'WooRewardManager: INVALID_USER_REWARD_RATE');
        require(brokerRewardRate <= 1e18, 'WooRewardManager: INVALID_BROKER_REWARD_RATE');
        require(userRewardRate + brokerRewardRate <= 1e18, 'WooRewardManager: INVALID_TOTAL_REWARD_RATE');
        rewardInfoByBroker[broker].userRewardRate = uint128(userRewardRate);
        rewardInfoByBroker[broker].brokerRewardRate = uint128(brokerRewardRate);
    }

    function withdraw(
        address token,
        address to,
        uint256 amount
    ) public onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawAll(address token, address to) external onlyOwner {
        withdraw(token, to, IERC20(token).balanceOf(address(this)));
    }

    function approve(address user) external onlyOwner {
        isApproved[user] = true;
        emit Approve(user, true);
    }

    function revoke(address user) external onlyOwner {
        isApproved[user] = false;
        emit Approve(user, false);
    }
}
