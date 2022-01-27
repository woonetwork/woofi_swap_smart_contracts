// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../../interfaces/PancakeSwap/IMasterChef.sol';
import '../../../interfaces/PancakeSwap/IPancakePair.sol';
import '../../../interfaces/PancakeSwap/IPancakeRouter.sol';
import '../../../interfaces/IWooAccessManager.sol';
import '../../../interfaces/IStrategy.sol';

contract StrategyLP is Ownable, Pausable, IStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;

    address public override want;
    uint256 public immutable pid;
    address public immutable override vault;

    address[] public rewardToLP0Route;
    address[] public rewardToLP1Route;

    address public lpToken0;
    address public lpToken1;

    bool public harvestOnDeposit = false;

    /* ----- Constant Variables ----- */

    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;
    address public constant reward = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);
    address public constant uniRouter = address(0x10ED43C718714eb63d5aA57B78B54704E256024E);
    address public constant masterChef = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);

    address public treasury;
    IWooAccessManager public accessManager;

    constructor(
        address initVault,
        address initAccessManager,
        address initWant,
        uint256 initPid,
        address[] memory initRewardToLP0Route,
        address[] memory initRewardToLP1Route
    ) public {
        vault = initVault;
        accessManager = IWooAccessManager(initAccessManager);
        want = initWant;
        pid = initPid;
        rewardToLP0Route = initRewardToLP0Route;
        rewardToLP1Route = initRewardToLP1Route;

        if (initRewardToLP0Route.length == 0) {
            lpToken0 = reward;
        } else {
            require(initRewardToLP0Route[0] == reward);
            lpToken0 = initRewardToLP0Route[initRewardToLP0Route.length - 1];
        }
        if (initRewardToLP1Route.length == 0) {
            lpToken1 = reward;
        } else {
            require(initRewardToLP1Route[0] == reward);
            lpToken1 = initRewardToLP1Route[initRewardToLP1Route.length - 1];
        }

        require(IPancakePair(initWant).token0() == lpToken0 || IPancakePair(initWant).token0() == lpToken1);
        require(IPancakePair(initWant).token1() == lpToken0 || IPancakePair(initWant).token1() == lpToken1);

        (address lpToken, , , ) = IMasterChef(masterChef).poolInfo(initPid);
        require(lpToken == initWant, 'StrategyLP: wrong_initPid');

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
        require(msg.sender == vault, 'StrategyLP: NOT_VAULT');

        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance < amount) {
            IMasterChef(masterChef).withdraw(pid, amount.sub(wantBalance));
            wantBalance = IERC20(want).balanceOf(address(this));
        }

        if (wantBalance > amount) {
            wantBalance = amount;
        }

        uint256 fee = amount.mul(withdrawalFee).div(WITHDRAWAL_MAX);

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
        require(msg.sender == tx.origin || msg.sender == vault, 'StrategyLP: EOA_OR_VAULT');

        IMasterChef(masterChef).deposit(pid, 0);
        uint256 rewardBalance = IERC20(reward).balanceOf(address(this));

        if (rewardBalance > 0) {
            _chargeFees();
            _addLiquidity();
            deposit();
        }
    }

    function deposit() public override whenNotPaused {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));

        if (wantBalance > 0) {
            IMasterChef(masterChef).deposit(pid, wantBalance);
        }
    }

    function balanceOfWant() public view override returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint256) {
        (uint256 amount, ) = IMasterChef(masterChef).userInfo(pid, address(this));

        return amount;
    }

    /* ----- Private Functions ----- */

    function _giveAllowances() private {
        TransferHelper.safeApprove(want, masterChef, 0);
        TransferHelper.safeApprove(want, masterChef, uint256(-1));

        TransferHelper.safeApprove(reward, uniRouter, 0);
        TransferHelper.safeApprove(reward, uniRouter, uint256(-1));

        TransferHelper.safeApprove(lpToken0, uniRouter, 0);
        TransferHelper.safeApprove(lpToken0, uniRouter, uint256(-1));

        TransferHelper.safeApprove(lpToken1, uniRouter, 0);
        TransferHelper.safeApprove(lpToken1, uniRouter, uint256(-1));
    }

    function _removeAllowances() private {
        TransferHelper.safeApprove(want, masterChef, 0);
        TransferHelper.safeApprove(reward, uniRouter, 0);
        TransferHelper.safeApprove(lpToken0, uniRouter, 0);
        TransferHelper.safeApprove(lpToken1, uniRouter, 0);
    }

    function _chargeFees() private {
        uint256 fee = IERC20(reward).balanceOf(address(this)).mul(strategistReward).div(REWARD_MAX);

        if (fee > 0) {
            TransferHelper.safeTransfer(reward, treasury, fee);
        }
    }

    function _addLiquidity() private {
        uint256 rewardHalf = IERC20(reward).balanceOf(address(this)).div(2);

        if (lpToken0 != reward) {
            IPancakeRouter(uniRouter).swapExactTokensForTokens(rewardHalf, 0, rewardToLP0Route, address(this), now);
        }

        if (lpToken1 != reward) {
            IPancakeRouter(uniRouter).swapExactTokensForTokens(rewardHalf, 0, rewardToLP0Route, address(this), now);
        }

        uint256 lp0Balance = IERC20(lpToken0).balanceOf(address(this));
        uint256 lp1Balance = IERC20(lpToken1).balanceOf(address(this));
        IPancakeRouter(uniRouter).addLiquidity(lpToken0, lpToken1, lp0Balance, lp1Balance, 0, 0, address(this), now);
    }

    /* ----- Admin Functions ----- */

    function retireStrat() external override {
        require(msg.sender == vault, '!vault');
        IMasterChef(masterChef).emergencyWithdraw(pid);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function emergencyExit() external override onlyAdmin {
        IMasterChef(masterChef).emergencyWithdraw(pid);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyAdmin {
        require(newStrategistReward <= REWARD_MAX, 'StrategyLP: newStrategistReward_exceed_FEE_MAX');
        strategistReward = newStrategistReward;
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyAdmin {
        require(newWithdrawalFee <= WITHDRAWAL_MAX, 'StrategyLP: newWithdrawalFee_exceed_WITHDRAWAL_MAX');
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
}
