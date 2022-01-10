// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IVault.sol';
import './interfaces/IStrategy.sol';

contract Controller is Ownable {
    using SafeERC20 for IERC20;

    /* ----- State Variables ----- */

    address public governance;
    address public strategist;

    mapping(address => address) public vaults;
    mapping(address => address) public strategies;

    constructor() public {
        governance = owner();
        strategist = owner();
    }

    modifier onlyStrategist() {
        require(
            msg.sender == strategist || msg.sender == governance || msg.sender == owner(),
            'Controller: not_strategist'
        );
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance || msg.sender == owner(), 'Controller: not_governance');
        _;
    }

    /* ----- External Functions ----- */

    function earn(address want, uint256 amount) external {
        require(msg.sender == vaults[want], 'Controller: msg.sender_not_vault');

        address strategy = strategies[want];
        require(strategy != address(0), 'Controller: strategy_ZERO_ADDR');
        TransferHelper.safeTransfer(want, strategy, amount);
        IStrategy(strategy).deposit();
    }

    function withdraw(address want, uint256 amount) external {
        require(msg.sender == vaults[want], 'Controller: msg.sender_not_vault');
        IStrategy(strategies[want]).withdraw(amount);
    }

    function balanceOf(address want) external view returns (uint256) {
        return IStrategy(strategies[want]).balanceOf();
    }

    function rewardRecipient() external view returns (address) {
        return governance;
    }

    /* ----- Admin Functions ----- */

    function setVault(address want, address vault) external onlyStrategist {
        require(vaults[want] == address(0), 'Controller: exist_vault');
        require(IVault(vault).want() == want, 'Controller: want_not_equal');

        vaults[want] = vault;
    }

    function setStrategy(address want, address strategy) external onlyStrategist {
        require(IStrategy(strategy).want() == want, 'Controller: want_not_equal');

        address currentStrategy = strategies[want];
        if (currentStrategy != address(0)) {
            IStrategy(currentStrategy).withdrawAll();
        }
        strategies[want] = strategy;
    }

    function withdrawAll(address want) external onlyStrategist {
        require(want != address(0), 'Controller: want_ZERO_ADDR');

        IStrategy(strategies[want]).withdrawAll();
    }

    function inCaseTokensGetStuck(address token, uint256 amount) external onlyStrategist {
        TransferHelper.safeTransfer(token, msg.sender, amount);
    }

    function setStrategist(address newStrategist) external onlyGovernance {
        require(newStrategist != address(0), 'Controller: newStrategist_ZERO_ADDR');

        strategist = newStrategist;
    }

    function setGovernance(address newGovernance) external onlyOwner {
        require(newGovernance != address(0), 'Controller: newGovernance_ZERO_ADDR');

        governance = newGovernance;
    }
}
