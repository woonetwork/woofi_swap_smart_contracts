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

contract StrategyCake is Ownable, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;

    address public controller;

    /* ----- Constant Variables ----- */

    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;
    address public constant masterChef = 0x73feaa1eE314F8c655E354234017bE2193C9E24E;
    address public constant want = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;

    constructor(address initialController) public {
        require(initialController != address(0), 'StrategyCake: initialController_ZERO_ADDR');

        controller = initialController;
        TransferHelper.safeApprove(want, masterChef, 0);
        TransferHelper.safeApprove(want, masterChef, uint256(-1));
    }

    /* ----- External Functions ----- */

    function beforeDeposit() external {
        harvest();
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == controller, 'StrategyCake: not_controller');

        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance < amount) {
            IMasterChef(masterChef).leaveStaking(amount.sub(wantBalance));
            wantBalance = IERC20(want).balanceOf(address(this));
        }

        if (wantBalance > amount) {
            wantBalance = amount;
        }

        uint256 fee = wantBalance.mul(withdrawalFee).div(WITHDRAWAL_MAX);

        if (fee > 0) {
            TransferHelper.safeTransfer(want, IController(controller).rewards(), fee);
        }
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyCake: vault_not_exist');
        if (wantBalance > fee) {
            IERC20(want).safeTransfer(vault, wantBalance.sub(fee));
        }
    }

    function balanceOf() external view returns (uint256) {
        return balanceOfWant().add(balanceOfPool());
    }

    /* ----- Public Functions ----- */

    function harvest() public whenNotPaused {
        require(
            msg.sender == tx.origin || msg.sender == IController(controller).vaults(want),
            'StrategyCake: not_contract_or_not_vault'
        );

        IMasterChef(masterChef).leaveStaking(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            chargeFees();
            deposit();
        }
    }

    function deposit() public whenNotPaused {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));

        if (wantBalance > 0) {
            IMasterChef(masterChef).enterStaking(wantBalance);
        }
    }

    function balanceOfWant() public view returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view returns (uint256) {
        (uint256 amount, ) = IMasterChef(masterChef).userInfo(0, address(this));

        return amount;
    }

    /* ----- Private Functions ----- */

    function chargeFees() private {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        uint256 fee = wantBalance.mul(strategistReward).div(REWARD_MAX);

        TransferHelper.safeTransfer(want, IController(controller).rewards(), fee);
    }

    /* ----- Admin Functions ----- */

    function emergencyExit() external onlyOwner {
        address vault = IController(controller).vaults(want);
        require(vault != address(0), 'StrategyCake: vault_not_exist');

        IMasterChef(masterChef).emergencyWithdraw(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        TransferHelper.safeTransfer(want, vault, wantBalance);
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyOwner {
        require(newWithdrawalFee < WITHDRAWAL_MAX, 'StrategyCake: newWithdrawalFee_exceed_WITHDRAWAL_MAX');

        withdrawalFee = newWithdrawalFee;
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyOwner {
        require(newStrategistReward < REWARD_MAX, 'StrategyCake: newStrategistReward_exceed_FEE_MAX');

        strategistReward = newStrategistReward;
    }

    function setController(address newController) external onlyOwner {
        require(newController != address(0), 'StrategyCake: newController_ZERO_ADDR');

        controller = newController;
    }
}
