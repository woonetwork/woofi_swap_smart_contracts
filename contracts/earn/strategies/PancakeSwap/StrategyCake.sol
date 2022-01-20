// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../../interfaces/PancakeSwap/IMasterChef.sol';
import '../../../interfaces/IWooAccessManager.sol';
import '../../../interfaces/IStrategy.sol';

contract StrategyCake is Ownable, Pausable, IStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    uint256 public strategistReward = 0;
    uint256 public withdrawalFee = 0;

    address public immutable override vault;

    bool public harvestOnDeposit = true;

    /* ----- Constant Variables ----- */

    uint256 public constant REWARD_MAX = 10000;
    uint256 public constant WITHDRAWAL_MAX = 10000;
    address public constant masterChef = address(0x73feaa1eE314F8c655E354234017bE2193C9E24E);
    address public constant override want = address(0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82);

    address public treasury;
    IWooAccessManager public accessManager;

    constructor(
        address initVault,
        address initAccessManager
    ) public {
        require(initVault != address(0), 'StrategyCake: initVault_ZERO_ADDR');
        vault = initVault;
        accessManager = IWooAccessManager(initAccessManager);
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
        require(msg.sender == address(vault), 'StrategyCake: not_vault');

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
        require(
            msg.sender == tx.origin || msg.sender == address(vault),
            'StrategyCake: EOA_or_vault'
        );

        IMasterChef(masterChef).leaveStaking(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            _chargeFees();
            deposit();
        }
    }

    function deposit() public override whenNotPaused {
        uint256 wantBalance = IERC20(want).balanceOf(address(this));

        if (wantBalance > 0) {
            IMasterChef(masterChef).enterStaking(wantBalance);
        }
    }

    function balanceOfWant() public view override returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function balanceOfPool() public view override returns (uint256) {
        (uint256 amount, ) = IMasterChef(masterChef).userInfo(0, address(this));

        return amount;
    }

    /* ----- Private Functions ----- */

    function _giveAllowances() private {
        TransferHelper.safeApprove(want, masterChef, 0);
        TransferHelper.safeApprove(want, masterChef, uint256(-1));
    }

    function _removeAllowances() private {
        TransferHelper.safeApprove(want, masterChef, 0);
    }

    function _chargeFees() private {
        uint256 fee = IERC20(want).balanceOf(address(this)).mul(strategistReward).div(REWARD_MAX);
        if (fee > 0) {
            TransferHelper.safeTransfer(want, treasury, fee);
        }
    }

    /* ----- Admin Functions ----- */

    function retireStrat() external override {
        require(msg.sender == vault, "!vault");
        IMasterChef(masterChef).emergencyWithdraw(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function emergencyExit() external override onlyAdmin {
        IMasterChef(masterChef).emergencyWithdraw(0);
        uint256 wantBalance = IERC20(want).balanceOf(address(this));
        if (wantBalance > 0) {
            TransferHelper.safeTransfer(want, vault, wantBalance);
        }
    }

    function setStrategistReward(uint256 newStrategistReward) external onlyAdmin {
        require(newStrategistReward <= REWARD_MAX, 'StrategyCake: newStrategistReward_exceed_FEE_MAX');
        strategistReward = newStrategistReward;
    }

    function setWithdrawalFee(uint256 newWithdrawalFee) external onlyAdmin {
        require(newWithdrawalFee <= WITHDRAWAL_MAX, 'StrategyCake: newWithdrawalFee_exceed_WITHDRAWAL_MAX');
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
