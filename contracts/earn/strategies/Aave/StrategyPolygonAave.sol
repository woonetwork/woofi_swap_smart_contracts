// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../../../interfaces/BankerJoe/IJoeRouter.sol';
import '../../../interfaces/Aave/IAavePool.sol';
import '../../../interfaces/Aave/IAaveV3Incentives.sol';
import '../../../interfaces/Aave/IDataProvider.sol';

import '../BaseStrategy.sol';

contract StrategyPolygonAave is BaseStrategy {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    address public aToken;
    address[] public assets = new address[](1);
    address[] public rewardToWantRoute;
    uint256 public lastHarvest;

    /* ----- Constant Variables ----- */

    address public constant reward = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270); // WMATIC

    address public constant uniRouter = address(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff); // QuickSwap: Router
    address public constant aavePool = address(0x794a61358D6845594F94dc1DB02A252b5b4814aD); // Aave: Pool V3
    address public constant incentivesController = address(0x929EC64c34a17401F460460D4B9390518E5B473e); // Aave: Incentives V3
    address public constant dataProvider = address(0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654); // Aave: Pool Data Provider V3

    /* ----- Events ----- */

    event StratHarvest(address indexed harvester, uint256 wantHarvested, uint256 tvl);
    event Deposit(uint256 tvl);
    event Withdraw(uint256 tvl);

    constructor(
        address _vault,
        address _accessManager,
        address[] memory _rewardToWantRoute
    ) public BaseStrategy(_vault, _accessManager) {
        rewardToWantRoute = _rewardToWantRoute;

        (aToken, , ) = IDataProvider(dataProvider).getReserveTokensAddresses(want);
        assets[0] = aToken;

        _giveAllowances();
    }

    /* ----- External Functions ----- */

    function rewardToWant() external view returns (address[] memory) {
        return rewardToWantRoute;
    }

    /* ----- Public Functions ----- */

    function harvest() public override whenNotPaused {
        require(msg.sender == tx.origin || msg.sender == address(vault), 'StrategyPolygonAave: EOA_or_vault');

        uint256 beforeBal = balanceOfWant();

        _claimAndSwap();

        uint256 wantHarvested = balanceOfWant().sub(beforeBal);
        uint256 fee = chargePerformanceFee(wantHarvested);
        deposit();

        lastHarvest = block.timestamp;
        emit StratHarvest(msg.sender, wantHarvested.sub(fee), balanceOf());
    }

    function deposit() public override whenNotPaused nonReentrant {
        uint256 wantBal = balanceOfWant();

        if (wantBal > 0) {
            IAavePool(aavePool).deposit(want, wantBal, address(this), 0);
            emit Deposit(balanceOf());
        }
    }

    function withdraw(uint256 amount) public override nonReentrant {
        require(msg.sender == vault, 'StrategyPolygonAave: !vault');
        require(amount > 0, 'StrategyPolygonAave: !amount');

        uint256 wantBal = balanceOfWant();

        if (wantBal < amount) {
            IAavePool(aavePool).withdraw(want, amount.sub(wantBal), address(this));
            uint256 newWantBal = IERC20(want).balanceOf(address(this));
            require(newWantBal > wantBal, 'StrategyPolygonAave: !newWantBal');
            wantBal = newWantBal;
        }

        uint256 withdrawAmt = amount < wantBal ? amount : wantBal;

        uint256 fee = chargeWithdrawalFee(withdrawAmt);
        if (withdrawAmt > fee) {
            TransferHelper.safeTransfer(want, vault, withdrawAmt.sub(fee));
        }
        emit Withdraw(balanceOf());
    }

    function userReserves() public view returns (uint256, uint256) {
        (uint256 supplyBal, , uint256 borrowBal, , , , , , ) = IDataProvider(dataProvider).getUserReserveData(
            want,
            address(this)
        );
        return (supplyBal, borrowBal);
    }

    function balanceOfPool() public view override returns (uint256) {
        (uint256 supplyBal, uint256 borrowBal) = userReserves();
        return supplyBal.sub(borrowBal);
    }

    /* ----- Internal Functions ----- */

    function _claimAndSwap() internal {
        IAaveV3Incentives(incentivesController).claimRewards(assets, type(uint256).max, address(this), reward);

        if (reward != want) {
            uint256 rewardBal = IERC20(reward).balanceOf(address(this));
            if (rewardBal > 0) {
                require(rewardToWantRoute.length > 0, 'StrategyPolygonAave: SWAP_ROUTE_INVALID');
                IJoeRouter(uniRouter).swapExactTokensForTokens(rewardBal, 0, rewardToWantRoute, address(this), now);
            }
        }
    }

    function _giveAllowances() internal override {
        TransferHelper.safeApprove(want, aavePool, uint256(-1));
        if (reward != want) {
            TransferHelper.safeApprove(reward, uniRouter, uint256(-1));
        }
    }

    function _removeAllowances() internal override {
        TransferHelper.safeApprove(want, aavePool, 0);
        if (reward != want) {
            TransferHelper.safeApprove(reward, uniRouter, 0);
        }
    }

    function _withdrawAll() internal {
        if (balanceOfPool() > 0) {
            IAavePool(aavePool).withdraw(want, type(uint256).max, address(this));
        }
    }

    /* ----- Admin Functions ----- */

    function retireStrat() external override {
        require(msg.sender == vault, 'StrategyPolygonAave: !vault');
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
}
