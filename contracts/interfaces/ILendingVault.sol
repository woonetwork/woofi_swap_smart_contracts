// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

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
* SOFTWARE.
*/

/// @title WOOFi LendingVault interface.
interface ILendingVault {
    // ************** //
    // *** EVENTS *** //
    // ************** //

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);

    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event RequestWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event CancelRequestWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event InstantWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares,
        uint256 fees
    );

    event ClaimReward(address indexed user, uint256 rewards, uint256 xWOORewards);

    event SettleInterest(
        address indexed caller,
        uint256 diff,
        uint256 rate,
        uint256 interestAssets,
        uint256 weeklyInterestAssets
    );

    event Settle(address indexed caller, address indexed user, uint256 assets, uint256 shares);

    event SetDailyMaxInstantWithdrawAssets(
        uint256 maxInstantWithdrawAssets,
        uint256 leftInstantWithdrawAssets,
        uint256 maxAssets
    );

    event SetWeeklyMaxInstantWithdrawAssets(uint256 maxAssets);

    event Borrow(uint256 assets);

    event Repay(uint256 assets, bool repaySettle);

    event UpgradeStrategy(address strategy);

    event NewStrategyCandidate(address strategy);

    // ***************** //
    // *** FUNCTIONS *** //
    // ***************** //

    function asset() external view returns (address assetTokenAddress);

    function totalAssets() external view returns (uint256 totalManagedAssets);

    function convertToShares(uint256 assets) external view returns (uint256 shares);

    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    function maxDeposit(address receiver) external view returns (uint256 maxAssets);

    function previewDeposit(uint256 assets) external view returns (uint256 shares);

    function maxMint(address receiver) external view returns (uint256 maxShares);

    function previewMint(uint256 shares) external view returns (uint256 assets);

    function maxWithdraw(address owner) external view returns (uint256 maxAssets);

    function previewWithdraw(uint256 assets) external view returns (uint256 shares);

    function maxRequestWithdraw(address owner) external view returns (uint256 maxAssets);

    function previewRequestWithdraw(uint256 assets) external view returns (uint256 shares);

    function maxInstantWithdraw(address owner) external view returns (uint256 maxAssets);

    function previewInstantWithdraw(uint256 assets) external view returns (uint256 shares);

    function localAssets() external view returns (uint256 assets);

    function getPricePerFullShare() external view returns (uint256 sharePrice);

    function pendingRewards(address user) external view returns (uint256 rewards);

    function isStrategyActive() external view returns (bool active);

    function deposit(uint256 assets, address receiver) external payable returns (uint256 shares);

    function withdraw(address receiver, address owner) external returns (uint256 shares);

    function requestWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    function cancelRequestWithdraw(address receiver, address owner) external returns (uint256 shares);

    function instantWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    function claimReward() external;
}
