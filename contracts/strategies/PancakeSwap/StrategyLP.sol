// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../interfaces/IController.sol';
import '../../interfaces/PancakeSwap/IMasterChef.sol';
import '../../interfaces/PancakeSwap/IPancakePair.sol';
import '../../interfaces/PancakeSwap/IPancakeRouter.sol';

contract StrategyLP is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;

    address public want;
    uint256 public pid;
    address public controller;

    address[] public rewardToLP0Route;
    address[] public rewardToLP1Route;

    address public lpToken0;
    address public lpToken1;

    bool public harvestOnDeposit = false;

    /* ----- Constant Variables ----- */

    address public constant reward = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;
    address public constant uniRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public constant masterChef = 0x73feaa1eE314F8c655E354234017bE2193C9E24E;

    constructor(
        address initialController,
        address initialWant,
        uint256 initialPid,
        address[] memory initialRewardToLP0Route,
        address[] memory initialRewardToLP1Route
    ) public {
        controller = initialController;
        want = initialWant;
        pid = initialPid;
        rewardToLP0Route = initialRewardToLP0Route;
        rewardToLP1Route = initialRewardToLP1Route;

        if (initialRewardToLP0Route.length == 0) {
            lpToken0 = reward;
        } else {
            require(initialRewardToLP0Route[0] == reward);
            lpToken0 = initialRewardToLP0Route[initialRewardToLP0Route.length - 1];
        }
        if (initialRewardToLP1Route.length == 0) {
            lpToken1 = reward;
        } else {
            require(initialRewardToLP1Route[0] == reward);
            lpToken1 = initialRewardToLP1Route[initialRewardToLP1Route.length - 1];
        }

        require(IPancakePair(initialWant).token0() == lpToken0 || IPancakePair(initialWant).token0() == lpToken1);
        require(IPancakePair(initialWant).token1() == lpToken0 || IPancakePair(initialWant).token1() == lpToken1);

        (address lpToken, , , ) = IMasterChef(masterChef).poolInfo(initialPid);
        require(lpToken == want, 'StrategyLP: wrong_initialPid');

        _giveAllowances();
    }

    /* ----- External Functions ----- */

    function beforeDeposit() external {
        if (harvestOnDeposit) {
            harvest();
        }
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == controller, 'StrategyLP: not_controller');

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
            TransferHelper.safeTransfer(want, IController(controller).rewardRecipient(), fee);
        }
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyLP: vault_not_exist');
        if (wantBalance > fee) {
            TransferHelper.safeTransfer(want, vault, wantBalance.sub(fee));
        }
    }

    function withdrawAll() external returns (uint256) {
        require(msg.sender == controller, 'StrategyLP: not_controller');
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyLP: vault_not_exist');

        IMasterChef(masterChef).withdraw(pid, balanceOfPool());

        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }

        return wantBalance;
    }

    function balanceOf() external view returns (uint256) {
        return balanceOfWant().add(balanceOfPool());
    }

    /* ----- Public Functions ----- */

    function harvest() public whenNotPaused {
        IMasterChef(masterChef).deposit(pid, 0);
        uint256 rewardBalance = IERC20(reward).balanceOf(address(this));

        if (rewardBalance > 0) {
            _chargeFees();
            _addLiquidity();
            deposit();
        }
    }

    function deposit() public whenNotPaused {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));

        if (wantBalance > 0) {
            IMasterChef(masterChef).deposit(pid, wantBalance);
        }
    }

    function balanceOfWant() public view returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view returns (uint256) {
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

    function _chargeFees() private {
        uint256 fee = IERC20(reward).balanceOf(address(this)).mul(strategistReward).div(REWARD_MAX);

        TransferHelper.safeTransfer(reward, IController(controller).rewardRecipient(), fee);
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

    function emergencyExit() external onlyOwner {
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyLP: vault_not_exist');

        IMasterChef(masterChef).emergencyWithdraw(pid);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        TransferHelper.safeTransfer(want, vault, wantBalance);
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyOwner {
        require(newStrategistReward < REWARD_MAX, 'StrategyLP: newStrategistReward_exceed_FEE_MAX');

        strategistReward = newStrategistReward;
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyOwner {
        require(newWithdrawalFee < WITHDRAWAL_MAX, 'StrategyLP: newWithdrawalFee_exceed_WITHDRAWAL_MAX');

        withdrawalFee = newWithdrawalFee;
    }

    function setHarvestOnDeposit(bool newHarvestOnDeposit) external onlyOwner {
        harvestOnDeposit = newHarvestOnDeposit;
    }

    function setController(address newController) external onlyOwner {
        require(newController != address(0), 'StrategyLP: newController_ZERO_ADDR');

        controller = newController;
    }
}
