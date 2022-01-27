// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../interfaces/PancakeSwap/IMasterChef.sol';
import '../../interfaces/IWooAccessManager.sol';
import '../../interfaces/IStrategy.sol';

/**
 * Base strategy abstract contract for:
 *  - vault and access manager setup
 *  - fees management
 *  - pause / unpause
 */
abstract contract BaseStrategy is Ownable, Pausable, IStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */
    address public override want;
    address public immutable override vault;
    bool public harvestOnDeposit = true;

    /* ----- Constant Variables ----- */

    uint256 public constant FEE_MAX = 10000;
    uint256 public performanceFee = 300; // 1 in 10000th: 100: 1%, 300: 3%
    uint256 public withdrawalFee = 0; // 1 in 10000th: 1: 0.01%, 10: 0.1%
    address public performanceTreasury;
    address public withdrawalTreasury;

    IWooAccessManager public accessManager;

    constructor(address initVault, address initAccessManager) public {
        require(initVault != address(0), 'BaseStrategy: initVault_ZERO_ADDR');
        vault = initVault;
        accessManager = IWooAccessManager(initAccessManager);
    }

    modifier onlyAdmin() {
        require(owner() == _msgSender() || accessManager.isVaultAdmin(msg.sender), 'BaseStrategy: NOT_ADMIN');
        _;
    }

    /* ----- External Functions ----- */

    function beforeDeposit() external override {
        require(msg.sender == address(vault), 'BaseStrategy: NOT_VAULT');
        if (harvestOnDeposit) {
            harvest();
        }
    }

    function balanceOf() external view override returns (uint256) {
        return balanceOfWant().add(balanceOfPool());
    }

    function balanceOfWant() public view override returns (uint256) {
        return IERC20(want).balanceOf(address(this));
    }

    function chargePerformanceFee(uint256 amount) internal returns (uint256) {
        uint256 fee = amount.mul(performanceFee).div(FEE_MAX);
        if (fee > 0) {
            TransferHelper.safeTransfer(want, performanceTreasury, fee);
        }
        return fee;
    }

    function chargeWithdrawalFee(uint256 amount) internal returns (uint256) {
        uint256 fee = amount.mul(withdrawalFee).div(FEE_MAX);
        if (fee > 0) {
            TransferHelper.safeTransfer(want, withdrawalTreasury, fee);
        }
        return fee;
    }

    /* ----- Abstract Method ----- */

    function balanceOfPool() public view virtual override returns (uint256);

    function deposit() public virtual override;

    function withdraw(uint256 amount) external virtual override;

    function harvest() public virtual override;

    function retireStrat() external virtual override;

    function emergencyExit() external virtual override;

    function _giveAllowances() internal virtual;

    function _removeAllowances() internal virtual;

    /* ----- Admin Functions ----- */

    function setPerformanceFee(uint256 fee) external onlyAdmin {
        require(fee <= FEE_MAX, 'BaseStrategy: fee_EXCCEEDS_MAX');
        performanceFee = fee;
    }

    function setWithdrawalFee(uint256 fee) external onlyAdmin {
        require(fee <= FEE_MAX, 'BaseStrategy: fee_EXCCEEDS_MAX');
        withdrawalFee = fee;
    }

    function setPerformanceTreasury(address treasury) external onlyAdmin {
        performanceTreasury = treasury;
    }

    function setWithdrawalTreasury(address treasury) external onlyAdmin {
        withdrawalTreasury = treasury;
    }

    function setHarvestOnDeposit(bool newHarvestOnDeposit) external onlyAdmin {
        harvestOnDeposit = newHarvestOnDeposit;
    }

    function pause() public onlyAdmin {
        _pause();
        _removeAllowances();
    }

    function unpause() external onlyAdmin {
        _unpause();
        _giveAllowances();
        deposit();
    }

    function paused() public view override(IStrategy, Pausable) returns (bool) {
        return Pausable.paused();
    }
}
