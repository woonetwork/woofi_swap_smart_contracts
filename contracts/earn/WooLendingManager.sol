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

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './WooSuperChargerVault.sol';
import '../interfaces/IWETH.sol';
import '../interfaces/IWooAccessManager.sol';

contract WooLendingManager is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public weth;
    address public want;
    address public accessManager;

    WooSuperChargerVault public superChargerVault;

    uint256 public weeklyRepayAmount; // Repay amount required, per week
    uint256 public borrowedPrincipal;
    uint256 public borrowedInterest;
    uint256 public interestRate; // 1 in 10000th. 1 = 0.01% (1 bp), 10 = 0.1% (10 bps)
    uint256 public lastAccuredTs; // Timestamp of last accured interests

    mapping(address => bool) public isLender;

    address constant ETH_PLACEHOLDER_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor() public {}

    function init(
        address _weth,
        address _want,
        address _accessManager,
        address payable _superChargerVault
    ) external onlyOwner {
        weth = _weth;
        want = _want;
        accessManager = _accessManager;
        superChargerVault = WooSuperChargerVault(_superChargerVault);
        lastAccuredTs = block.timestamp;
    }

    modifier onlyAdmin() {
        require(
            owner() == msg.sender || IWooAccessManager(accessManager).isVaultAdmin(msg.sender),
            'LendingVault: Not admin'
        );
        _;
    }

    modifier onlyLender() {
        require(isLender[msg.sender], 'WooLendingManager: !lender');
        _;
    }

    modifier onlySuperChargerVault() {
        require(msg.sender == address(superChargerVault), 'WooLendingManager: !superChargerVault');
        _;
    }

    function setSuperChargerVault(address payable _wooSuperCharger) external onlyOwner {
        superChargerVault = WooSuperChargerVault(_wooSuperCharger);
    }

    function setLender(address _lender, bool _isLender) external onlyOwner {
        isLender[_lender] = _isLender;
    }

    function debt() public view returns (uint256 assets) {
        return borrowedPrincipal.add(borrowedInterest);
    }

    function debtState()
        external
        view
        returns (
            uint256 total,
            uint256 principal,
            uint256 interest
        )
    {
        total = debt();
        principal = borrowedPrincipal;
        interest = borrowedInterest;
    }

    function accureInterest() public {
        uint256 ts = block.timestamp;

        // CAUTION: block.timestamp may be out of order
        if (ts <= lastAccuredTs) {
            return;
        }

        uint256 duration = ts.sub(lastAccuredTs);

        // interestRate is in 10000th.
        // 31536000 = 365 * 24 * 3600 (1 year of seconds)
        uint256 interest = borrowedPrincipal.mul(interestRate).div(10000).mul(duration).div(31536000);

        borrowedInterest = borrowedInterest.add(interest);
        lastAccuredTs = block.timestamp;
    }

    function setInterestRate(uint256 _rate) external onlyLender {
        accureInterest();
        interestRate = _rate;
    }

    function borrow(uint256 amount) external onlyLender {
        require(amount > 0);

        accureInterest();
        borrowedPrincipal = borrowedPrincipal.add(amount);

        uint256 preBalance = IERC20(want).balanceOf(msg.sender);
        superChargerVault.borrowFromLender(amount, msg.sender);
        uint256 afterBalance = IERC20(want).balanceOf(msg.sender);
        require(afterBalance.sub(preBalance) == amount, 'WooLendingManager: BORROW_AMOUNT_ERROR');
    }

    function setRepayAmount(uint256 _amount) external onlySuperChargerVault {
        weeklyRepayAmount = _amount;
    }

    function repayWeekly() external onlyLender returns (uint256 repaidAmount) {
        if (weeklyRepayAmount > 0) repay(weeklyRepayAmount);
        return weeklyRepayAmount;
    }

    function repayAll() external onlyLender returns (uint256 repaidAmount) {
        accureInterest();
        uint256 allDebt = debt();
        repay(allDebt);
        return allDebt;
    }

    function repay(uint256 amount) public onlyLender {
        require(amount > 0);

        accureInterest();

        TransferHelper.safeTransferFrom(want, msg.sender, address(this), amount);

        require(IERC20(want).balanceOf(address(this)) >= amount);

        if (borrowedInterest >= amount) {
            borrowedInterest = borrowedInterest.sub(amount);
        } else {
            borrowedPrincipal = borrowedPrincipal.sub(amount.sub(borrowedInterest));
            borrowedInterest = 0;
        }

        TransferHelper.safeApprove(want, address(superChargerVault), amount);
        uint256 beforeBalance = IERC20(want).balanceOf(address(this));
        superChargerVault.repayFromLender(amount);
        uint256 afterBalance = IERC20(want).balanceOf(address(this));
        require(beforeBalance.sub(afterBalance) == amount, 'WooLendingManager: REPAY_AMOUNT_ERROR');

        weeklyRepayAmount = (weeklyRepayAmount >= amount) ? weeklyRepayAmount.sub(amount) : 0;
    }

    function inCaseTokenGotStuck(address stuckToken) external onlyOwner {
        require(stuckToken != want);
        if (stuckToken == ETH_PLACEHOLDER_ADDR) {
            TransferHelper.safeTransferETH(msg.sender, address(this).balance);
        } else {
            uint256 amount = IERC20(stuckToken).balanceOf(address(this));
            TransferHelper.safeTransfer(stuckToken, msg.sender, amount);
        }
    }
}
