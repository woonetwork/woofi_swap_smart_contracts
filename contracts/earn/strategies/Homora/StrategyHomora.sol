// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../../interfaces/IWETH.sol';
import '../../../interfaces/Homora/IBank.sol';
import '../../../interfaces/Homora/IIBToken.sol';
import '../BaseStrategy.sol';

contract StrategyHomora is BaseStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    address public ibToken;
    address public bank;

    /* ----- Constant Variables ----- */

    address public constant wrappedEther = address(0x4200000000000000000000000000000000000006);

    constructor(
        address _vault,
        address _accessManager,
        address _ibToken,
        address _bank
    ) public BaseStrategy(_vault, _accessManager) {
        ibToken = _ibToken;
        bank = _bank;

        _giveAllowances();
    }

    /* ----- Public Functions ----- */

    function harvest() public override whenNotPaused {}

    function deposit() public override whenNotPaused nonReentrant {
        uint256 wantBal = IERC20(want).balanceOf(address(this));

        if (wantBal > 0) {
            if (want == wrappedEther) {
                IWETH(wrappedEther).withdraw(wantBal);
                IIBToken(ibToken).deposit{value: wantBal}();
            } else {
                IIBToken(ibToken).deposit(wantBal);
            }
        }
    }

    function withdraw(uint256 amount) public override nonReentrant {
        require(msg.sender == vault, 'StrategyHomora: !vault');
        require(amount > 0, 'StrategyHomora: !amount');

        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal < amount) {
            uint256 exchangeRate = IBank(bank).exchangeRateStored();
            uint256 ibAmount = amount.mul(1e18).div(exchangeRate);
            IIBToken(ibToken).withdraw(ibAmount);
            if (want == wrappedEther) {
                _wrapEther();
            }
            wantBal = IERC20(want).balanceOf(address(this));
        }

        require(wantBal >= amount.mul(9999).div(10000), 'StrategyHomora: !withdraw');
        // In case the decimal precision for the very left staking amount
        uint256 withdrawAmt = amount < wantBal ? amount : wantBal;

        uint256 fee = chargeWithdrawalFee(withdrawAmt);
        if (withdrawAmt > fee) {
            TransferHelper.safeTransfer(want, vault, withdrawAmt.sub(fee));
        }
    }

    function balanceOfPool() public view override returns (uint256) {
        uint256 exchangeRate = IBank(bank).exchangeRateStored();
        return IIBToken(ibToken).balanceOf(address(this)).mul(exchangeRate).div(1e18);
    }

    /* ----- Private Functions ----- */

    function _giveAllowances() internal override {
        TransferHelper.safeApprove(want, ibToken, uint256(-1));
    }

    function _removeAllowances() internal override {
        TransferHelper.safeApprove(want, ibToken, 0);
    }

    function _withdrawAll() private {
        uint256 totalShares = IIBToken(ibToken).balanceOf(address(this));
        IIBToken(ibToken).withdraw(totalShares);
        if (want == wrappedEther) {
            _wrapEther();
        }
    }

    function _wrapEther() private {
        // Homora withdrawal return the Ether token, so _wrapEther is required.
        uint256 etherBal = address(this).balance;
        if (etherBal > 0) {
            IWETH(wrappedEther).deposit{value: etherBal}();
        }
    }

    /* ----- Admin Functions ----- */

    function retireStrat() external override {
        require(msg.sender == vault, 'StrategyHomora: !vault');
        _withdrawAll();
        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal > 0) {
            TransferHelper.safeTransfer(want, vault, wantBal);
        }
    }

    function emergencyExit() external override onlyAdmin {
        _withdrawAll();
        uint256 wantBal = IERC20(want).balanceOf(address(this));
        if (wantBal > 0) {
            TransferHelper.safeTransfer(want, vault, wantBal);
        }
    }

    receive() external payable {}
}
