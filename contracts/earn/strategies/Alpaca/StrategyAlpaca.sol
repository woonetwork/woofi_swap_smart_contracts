// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../../interfaces/Alpaca/IAlpacaVault.sol';
import '../../../interfaces/Alpaca/IFairLaunch.sol';
import '../../../../interfaces/IWooAccessManager.sol';
import '../../../../interfaces/IStrategy.sol';
import '../../../../interfaces/IWETH.sol';

contract StrategyAlpaca is Ownable, Pausable, IStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;

    address public immutable override vault;
    address public immutable override want;
    address public immutable alpacaVault;
    address public immutable fairLaunch;
    uint256 public immutable poolId;

    bool public isWrapped;
    address[] public rewardToWantRoute;

    bool public harvestOnDeposit = true;

    /* ----- Constant Variables ----- */

    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;
    address public constant wrapped = address(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);
    address public constant reward = address(0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F);
    address public constant uniRouter = address(0x10ED43C718714eb63d5aA57B78B54704E256024E);

    address public treasury;
    IWooAccessManager public accessManager;

    constructor(
        address initVault,
        address initAccessManager,
        address initWant,
        address initAlpacaVault,
        address initFairLaunch,
        uint256 initPoolId,
        address[] memory initRewardToWantRoute
    ) public {
        require(initVault != address(0), 'StrategyAlpaca: initVault_ZERO_ADDR');
        vault = initVault;
        accessManager = IWooAccessManager(initAccessManager);
        want = initWant;
        alpacaVault = initAlpacaVault;
        fairLaunch = initFairLaunch;
        poolId = initPoolId;
        isWrapped = initWant == wrapped;
        rewardToWantRoute = initRewardToWantRoute;

        _giveAllowances();
    }

    modifier onlyAdmin() {
        require(owner() == _msgSender() || accessManager.isVaultAdmin(msg.sender), 'StrategyLP: NOT_ADMIN');
        _;
    }

    /* ----- External Functions ----- */

    function beforeDeposit() external override {
        if (harvestOnDeposit) {
            harvest();
        }
    }

    function withdraw(uint256 amount) external override {
        require(msg.sender == address(vault), 'StrategyAlpaca: not_vault');

        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance < amount) {
            uint256 ibAmount = amount.mul(IAlpacaVault(alpacaVault).totalSupply()).div(IAlpacaVault(alpacaVault).totalToken());
            IFairLaunch(fairLaunch).withdraw(address(this), poolId, ibAmount);
            IAlpacaVault(alpacaVault).withdraw(IERC20(alpacaVault).balanceOf(address(this)));
            wantBalance = IERC20(want).balanceOf(address(this));
        }

        if (wantBalance > amount) {
            wantBalance = amount;
        }

        uint256 fee = wantBalance.mul(withdrawalFee).div(WITHDRAWAL_MAX);
        if (fee > 0) {
            TransferHelper.safeTransfer(want, treasury, fee);
        }

        if (wantBalance > fee) {
            TransferHelper.safeTransfer(want, vault, wantBalance.sub(fee));
        }
    }

    function balanceOf() external view override returns (uint256) {
        return balanceOfWant().add(balanceOfPool());
    }

    /* ----- Public Functions ----- */

    function harvest() public override whenNotPaused {
        require(msg.sender == tx.origin || msg.sender == address(vault), 'StrategyAlpaca: EOA_or_vault');

        IFairLaunch(fairLaunch).harvest(poolId);
        uint256 rewardBalance = IERC20(reward).balanceOf(address(this));

        if (rewardBalance > 0) {
            _chargeFees();
            _swapRewards();
            deposit();
        }
    }

    function deposit() public override whenNotPaused {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));

        if (wantBalance > 0) {
            if (isWrapped) {
                IWETH(wrapped).withdraw(wantBalance);
                IAlpacaVault(alpacaVault).deposit{value: wantBalance}(wantBalance);
            } else {
                IAlpacaVault(alpacaVault).deposit(wantBalance);
            }
            IFairLaunch(fairLaunch).deposit(address(this), poolId, IAlpacaVault(alpacaVault).balanceOf(address(this)));
        }
    }

    function balanceOfWant() public view override returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint256) {
        (uint256 amount, , , ) = IFairLaunch(fairLaunch).userInfo(poolId, address(this));

        return amount.mul(IAlpacaVault(alpacaVault).totalToken()).div(IAlpacaVault(alpacaVault).totalSupply());
    }

    /* ----- Private Functions ----- */

    function _giveAllowances() private {
        TransferHelper.safeApprove(reward, uniRouter, 0);
        TransferHelper.safeApprove(reward, uniRouter, uint256(-1));

        TransferHelper.safeApprove(want, alpacaVault, 0);
        TransferHelper.safeApprove(want, alpacaVault, uint256(-1));

        TransferHelper.safeApprove(alpacaVault, fairLaunch, 0);
        TransferHelper.safeApprove(alpacaVault, fairLaunch, uint256(-1));
    }

    function _removeAllowances() private {
        TransferHelper.safeApprove(reward, uniRouter, 0);
        TransferHelper.safeApprove(want, alpacaVault, 0);
        TransferHelper.safeApprove(alpacaVault, fairLaunch, 0);
    }

    function _chargeFees() private {
        uint256 fee = IERC20(reward).balanceOf(address(this)).mul(strategistReward).div(REWARD_MAX);

        if (fee > 0) {
            TransferHelper.safeTransfer(reward, treasury, fee);
        }
    }

    function _swapRewards() private {
        uint256 rewardBalance = IERC20(reward).balanceOf(address(this));

        IPancakeRouter(uniRouter).swapExactTokensForTokens(
            rewardBalance,
            0,
            rewardToWantRoute,
            address(this),
            now.add(600)
        );
    }

    /* ----- Admin Functions ----- */

    function retireStrat() external override {
        require(msg.sender == vault, '!vault');
        IMasterChef(masterChef).emergencyWithdraw(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function emergencyExit() external override onlyAdmin {
        withdraw(balanceOfPool());
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyAdmin {
        require(newStrategistReward <= REWARD_MAX, 'StrategyAlpaca: newStrategistReward_exceed_FEE_MAX');
        strategistReward = newStrategistReward;
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyAdmin {
        require(newWithdrawalFee <= WITHDRAWAL_MAX, 'StrategyAlpaca: newWithdrawalFee_exceed_WITHDRAWAL_MAX');
        withdrawalFee = newWithdrawalFee;
    }

    function setHarvestOnDeposit(bool newHarvestOnDeposit) external onlyAdmin {
        harvestOnDeposit = newHarvestOnDeposit;
    }

    function pause() public override onlyAdmin {
        _pause();
        _removeAllowances();
    }

    function unpause() external override onlyAdmin {
        _unpause();
        _giveAllowances();
        deposit();
    }

    function paused() public view override(IStrategy, Pausable) returns (bool) {
        return Pausable.paused();
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        require(newTreasury != address(0), 'StrategyAlpaca: newTreasury_ZERO_ADDR');
        treasury = newTreasury;
    }
}
