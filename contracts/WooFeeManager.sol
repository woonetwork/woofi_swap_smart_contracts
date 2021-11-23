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
import './interfaces/IWooRewardManager.sol';
import './interfaces/IWooFeeManager.sol';

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

    mapping(address => uint256) public override feeRate;
    address public wooPP;
    address public quoteToken;
    address public rewardToken;
    IWooRewardManager public rewardManager;

    constructor(address newQuoteToken, address newRewardManager) public {
        initOwner(msg.sender);
        require(newQuoteToken != address(0), 'WooFeeManager: quoteToken_ZERO_ADDR');
        require(newRewardManager != address(0), 'WooFeeManager: rewardManager_ZERO_ADDR');
        quoteToken = newQuoteToken;
        rewardManager = IWooRewardManager(newRewardManager);
    }

    /* ----- Public Functions ----- */

    function collectFee(uint256 amount, address rebateTo) external override {
        TransferHelper.safeTransferFrom(quoteToken, msg.sender, address(this), amount);
        rewardManager.addReward(tx.origin, amount.mulFloor(rewardManager.rewardRatio()));
        rewardManager.addReward(rebateTo, amount.mulFloor(rewardManager.brokerRewardRatio()));
    }

    /* ----- Admin Functions ----- */

    /// @dev Set fee rate.
    function setFeeRate(address token, uint256 newFeeRate) external onlyOwner {
        require(newFeeRate <= 1e16, 'WooFeeManager: FEE_RATE>1%');
        feeRate[token] = newFeeRate;
        emit FeeRateUpdated(token, newFeeRate);
    }

    /// @dev Set WooPP.
    function setWooPP(address newWooPP) external onlyOwner {
        wooPP = newWooPP;
    }

    /// @dev Set reward token.
    function setRewardToken(address newRewardToken) external onlyOwner {
        rewardToken = newRewardToken;
    }

    /// @dev Swap quote token to reward token.
    /// @param amount the amount of quote token to swap
    function swap(uint256 amount) external onlyOwner {
        _swap(amount);
    }

    /// @dev Withdraw the token.
    /// @param token the token to withdraw
    /// @param to the destination address
    /// @param amount the amount to withdraw
    function withdraw(
        address token,
        address to,
        uint256 amount
    ) public nonReentrant onlyOwner {
        require(token != address(0), 'WooFeeManager: token_ZERO_ADDR');
        require(to != address(0), 'WooFeeManager: to_ZERO_ADDR');
        TransferHelper.safeTransfer(token, to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawAll(address token, address to) external onlyOwner {
        withdraw(token, to, IERC20(token).balanceOf(address(this)));
    }

    /// @dev Withdraw the token to the OWNER address
    /// @param token the token
    function withdrawAllToOwner(address token) external nonReentrant onlyOwner {
        require(token != address(0), 'WooFeeManager: token_ZERO_ADDR');
        uint256 amount = IERC20(token).balanceOf(address(this));
        TransferHelper.safeTransfer(token, _OWNER_, amount);
        emit Withdraw(token, _OWNER_, amount);
    }

    /* ----- Internal Functions ----- */

    function _swap(uint256 amount) internal {
        require(wooPP != address(0), 'WooFeeManager: wooPP_ZERO_ADDR');
        TransferHelper.safeApprove(quoteToken, wooPP, amount);
        IWooPP(wooPP).sellQuote(rewardToken, amount, 0, address(rewardManager), address(this));
    }
}
