// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../interfaces/IController.sol';
import '../../interfaces/IWETH.sol';
import '../../interfaces/venus/IVBNB.sol';
import '../../interfaces/venus/IUnitroller.sol';
import '../../interfaces/PancakeSwap/IPancakeRouter.sol';

contract StrategyBNB is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;
    bool public autoLeverage = false;
    bool public harvestOnDeposit = false;
    address[] public xvsToWbnbRoute = [xvs, wbnb];

    uint256 public borrowRate;
    uint256 public borrowDepth;

    uint256 public depositedBalance;

    address public controller;

    /* ----- Constant Variables ----- */

    address public constant wbnb = address(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);
    address public constant xvs = address(0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63);
    address public constant vbnb = address(0xA07c5b74C9B40447a954e1466938b865b6BBea36);

    address public constant want = wbnb;

    address public constant uniRouter = address(0x10ED43C718714eb63d5aA57B78B54704E256024E);
    address public constant unitroller = address(0xfD36E2c2a6789Db23113685031d7F16329158384);

    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;

    uint256 public constant BORROW_RATE_MAX = 58;
    uint256 public constant BORROW_DEPTH_MAX = 10;
    uint256 public constant MIN_LEVERAGE_AMOUNT = 1e12;

    constructor(
        address initialController,
        uint256 initialBorrowRate,
        uint256 initialBorrowDepth
    ) public {
        controller = initialController;
        borrowRate = initialBorrowRate;
        borrowDepth = initialBorrowDepth;

        _giveAllowances();
    }

    /* ----- External Functions ----- */

    function beforeDeposit() external {
        if (harvestOnDeposit) {
            harvest();
        }
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == controller, 'StrategyBNB: not controller');

        uint256 wbnbBal = IERC20(wbnb).balanceOf(address(this));

        if (wbnbBal < amount) {
            _deleverage();
            IWETH(wbnb).deposit{value: amount.sub(wbnbBal)}();
            wbnbBal = IERC20(wbnb).balanceOf(address(this));
        }

        if (wbnbBal > amount) {
            wbnbBal = amount;
        }

        uint256 fee = wbnbBal.mul(withdrawalFee).div(WITHDRAWAL_MAX);
        if (fee > 0) {
            TransferHelper.safeTransfer(wbnb, IController(controller).rewardRecipient(), fee);
        }
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyBNB: vault_not_exist');

        if (wbnbBal > fee) {
            TransferHelper.safeTransfer(wbnb, vault, wbnbBal.sub(fee));
        }

        if (!paused()) {
            deposit();
        }

        updateBalance();
    }

    function withdrawAll() external {
        require(msg.sender == controller, 'StrategyBNB: not_controller');
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyBNB: vault_not_exist');

        _deleverage();
        IWETH(wbnb).deposit{value: address(this).balance}();
        uint256 wbnbBal = IERC20(wbnb).balanceOf(address(this));
        if (wbnbBal > 0) {
            TransferHelper.safeTransfer(wbnb, vault, wbnbBal);
        }
    }

    function balanceOf() external view returns (uint256) {
        return balanceOfWant().add(balanceOfPool());
    }

    /* ----- Public Functions ----- */

    function deposit() public whenNotPaused {
        uint256 wbnbBal = IERC20(wbnb).balanceOf(address(this));

        if (wbnbBal > 0) {
            IWETH(wbnb).withdraw(wbnbBal);
            if (autoLeverage) {
                _leverage(wbnbBal);
            } else {
                IVBNB(vbnb).mint{value: wbnbBal}();
            }
        }

        updateBalance();
    }

    function harvest() public whenNotPaused {
        require(!Address.isContract(msg.sender), 'StrategyBNB: not_allow_contract');

        IUnitroller(unitroller).claimVenus(address(this));
        _chargeFees();
        _swapRewards();
        deposit();
    }

    function updateBalance() public {
        uint256 supplyBal = IVBNB(vbnb).balanceOfUnderlying(address(this));
        uint256 borrowBal = IVBNB(vbnb).borrowBalanceCurrent(address(this));
        depositedBalance = supplyBal.sub(borrowBal);
    }

    function balanceOfWant() public view returns (uint256) {
        uint256 bnbBal = address(this).balance;
        uint256 wbnbBal = IERC20(wbnb).balanceOf(address(this));
        return bnbBal.add(wbnbBal);
    }

    function balanceOfPool() public view returns (uint256) {
        return depositedBalance;
    }

    /* ----- Private Functions ----- */

    function _giveAllowances() private {
        TransferHelper.safeApprove(xvs, uniRouter, 0);
        TransferHelper.safeApprove(xvs, uniRouter, uint256(-1));
    }

    function _removeAllowances() private {
        TransferHelper.safeApprove(xvs, uniRouter, 0);
    }

    function _leverage(uint256 amount) private {
        if (amount < MIN_LEVERAGE_AMOUNT) {
            return;
        }

        for (uint256 i = 0; i < borrowDepth; i++) {
            IVBNB(vbnb).mint{value: amount}();
            amount = amount.mul(borrowRate).div(100);
            IVBNB(vbnb).borrow(amount);
        }
    }

    function _deleverage() private {
        uint256 bnbBal = address(this).balance;
        uint256 borrowBal = IVBNB(vbnb).borrowBalanceCurrent(address(this));

        while (bnbBal < borrowBal) {
            IVBNB(vbnb).repayBorrow{value: bnbBal}();

            borrowBal = IVBNB(vbnb).borrowBalanceCurrent(address(this));
            uint256 targetUnderlying = borrowBal.mul(100).div(borrowRate);
            uint256 balanceOfUnderlying = IVBNB(vbnb).balanceOfUnderlying(address(this));

            IVBNB(vbnb).redeemUnderlying(balanceOfUnderlying.sub(targetUnderlying));
            bnbBal = address(this).balance;
        }

        IVBNB(vbnb).repayBorrow{value: borrowBal}();

        uint256 vbnbBal = IERC20(vbnb).balanceOf(address(this));
        IVBNB(vbnb).redeem(vbnbBal);
    }

    function _chargeFees() private {
        uint256 fee = IERC20(xvs).balanceOf(address(this)).mul(strategistReward).div(REWARD_MAX);

        TransferHelper.safeTransfer(want, IController(controller).rewardRecipient(), fee);
    }

    function _swapRewards() private {
        uint256 xvsBal = IERC20(xvs).balanceOf(address(this));

        IPancakeRouter(uniRouter).swapExactTokensForTokens(xvsBal, 0, xvsToWbnbRoute, address(this), now.add(600));
    }

    /* ----- Admin Functions ----- */

    function deleverageOnce(uint256 borrowRateOnce) external onlyOwner {
        require(borrowRateOnce <= BORROW_RATE_MAX, 'StrategyBNB: not_safe');

        uint256 bnbBal = address(this).balance;
        IVBNB(vbnb).repayBorrow{value: bnbBal}();

        uint256 borrowBal = IVBNB(vbnb).borrowBalanceCurrent(address(this));
        uint256 targetUnderlying = borrowBal.mul(100).div(borrowRateOnce);
        uint256 balanceOfUnderlying = IVBNB(vbnb).balanceOfUnderlying(address(this));

        IVBNB(vbnb).redeemUnderlying(balanceOfUnderlying.sub(targetUnderlying));

        updateBalance();
    }

    function rebalance(uint256 newBorrowRate, uint256 newBorrowDepth) external onlyOwner {
        require(newBorrowRate <= BORROW_RATE_MAX, 'StrategyBNB: newBorrowRate_exceed_BORROW_RATE_MAX');
        require(newBorrowDepth <= BORROW_DEPTH_MAX, 'StrategyBNB: newBorrowDepth_exceed_BORROW_DEPTH_MAX');

        _deleverage();
        borrowRate = newBorrowRate;
        borrowDepth = newBorrowDepth;
        _leverage(address(this).balance);
    }

    function emergencyExit() external onlyOwner {
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyBNB: vault_not_exist');

        _deleverage();
        IWETH(wbnb).deposit{value: address(this).balance}();
        uint256 wbnbBalance = IERC20(wbnb).balanceOf(address(this));
        TransferHelper.safeTransfer(wbnb, vault, wbnbBalance);
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyOwner {
        require(newStrategistReward <= REWARD_MAX, 'StrategyBNB: newStrategistReward_exceed_FEE_MAX');

        strategistReward = newStrategistReward;
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyOwner {
        require(newWithdrawalFee <= WITHDRAWAL_MAX, 'StrategyBNB: newWithdrawalFee_exceed_WITHDRAWAL_MAX');

        withdrawalFee = newWithdrawalFee;
    }

    function setHarvestOnDeposit(bool newHarvestOnDeposit) external onlyOwner {
        harvestOnDeposit = newHarvestOnDeposit;
    }

    function setController(address newController) external onlyOwner {
        require(newController != address(0), 'StrategyBNB: newController_ZERO_ADDR');

        controller = newController;
    }

    function pause() public onlyOwner {
        _pause();

        _removeAllowances();
    }

    function unpause() external onlyOwner {
        _unpause();

        _giveAllowances();

        deposit();
    }

    function enterMarkets(address[] memory markets) external onlyOwner {
        IUnitroller(unitroller).enterMarkets(markets);
    }

    receive() external payable {}
}
