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
import './interfaces/IWooPP.sol';
import './interfaces/IWooRebateManager.sol';
import './interfaces/IWooFeeManager.sol';
import './interfaces/IWooVaultManager.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

/// @title Contract to collect transaction fee of Woo private pool.
contract WooFeeManager is InitializableOwnable, ReentrancyGuard, IWooFeeManager {
    /* ----- Type declarations ----- */

    using SafeMath for uint256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    /* ----- State variables ----- */

    mapping(address => uint256) public override feeRate; // decimal: 18; 1e16 = 1%, 1e15 = 0.1%, 1e14 = 0.01%
    uint256 private vaultRewardRate; // decimal: 18; 1e16 = 1%, 1e15 = 0.1%, 1e14 = 0.01%

    address immutable public quoteToken;
    IWooRebateManager public rebateManager;
    IWooVaultManager public vaultManager;

    constructor(
        address newQuoteToken,
        address newRebateManager,
        address newVaultManager
    ) public {
        require(newQuoteToken != address(0), 'WooFeeManager: quoteToken_ZERO_ADDR');
        initOwner(msg.sender);
        quoteToken = newQuoteToken;
        rebateManager = IWooRebateManager(newRebateManager);
        vaultManager = IWooVaultManager(newVaultManager);
        vaultRewardRate = 1e18;
    }

    /* ----- Public Functions ----- */

    function collectFee(uint256 amount, address brokerAddr) external override {
        TransferHelper.safeTransferFrom(quoteToken, msg.sender, address(this), amount);

        // Step 1: distribute rebate if needed
        uint256 rebateRate = rebateManager.rebateRate(brokerAddr);
        uint256 rebateAmount = amount.mulFloor(rebateRate);
        if (rebateAmount > 0) {
            TransferHelper.safeApprove(quoteToken, address(rebateManager), rebateAmount);
            rebateManager.addRebate(brokerAddr, rebateAmount);
        }
        uint256 feeAfterRebate = amount.sub(rebateAmount);

        // Step 2: distribute to vault treasury
        uint256 vaultRewardAmount = feeAfterRebate.mulFloor(vaultRewardRate);
        if (vaultRewardAmount > 0) {
            TransferHelper.safeApprove(quoteToken, address(vaultManager), vaultRewardAmount);
            vaultManager.addReward(vaultRewardAmount);
        }
    }

    /* ----- Admin Functions ----- */

    function setFeeRate(address token, uint256 newFeeRate) external override onlyOwner {
        require(newFeeRate <= 1e16, 'WooFeeManager: FEE_RATE>1%');
        feeRate[token] = newFeeRate;
        emit FeeRateUpdated(token, newFeeRate);
    }

    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(token != address(0), 'WooFeeManager: token_ZERO_ADDR');
        require(to != address(0), 'WooFeeManager: to_ZERO_ADDR');
        uint256 amount = IERC20(token).balanceOf(address(this));
        TransferHelper.safeTransfer(token, to, amount);
        emit Withdraw(token, to, amount);
    }

    function setRebateManager(address newRebateManager) external onlyOwner {
        require(newRebateManager != address(0), 'WooFeeManager: rebateManager_ZERO_ADDR');
        rebateManager = IWooRebateManager(newRebateManager);
    }

    function setVaultManager(address newVaultManager) external onlyOwner {
        require(newVaultManager != address(0), 'WooFeeManager: newVaultManager_ZERO_ADDR');
        vaultManager = IWooVaultManager(newVaultManager);
    }

    function setVaultRewardRate(uint256 newVaultRewardRate) external onlyOwner {
        require(newVaultRewardRate <= 1e18, 'WooFeeManager: vaultRewardRate_INVALID');
        vaultRewardRate = newVaultRewardRate;
    }
}
