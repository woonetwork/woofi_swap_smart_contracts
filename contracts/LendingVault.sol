// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/*

░██╗░░░░░░░██╗░█████╗░░█████╗░░░░░░░███████╗██╗
░██║░░██╗░░██║██╔══██╗██╔══██╗░░░░░░██╔════╝██║
░╚██╗████╗██╔╝██║░░██║██║░░██║█████╗█████╗░░██║
░░████╔═████║░██║░░██║██║░░██║╚════╝██╔══╝░░██║
░░╚██╔╝░╚██╔╝░╚█████╔╝╚█████╔╝░░░░░░██║░░░░░██║
░░░╚═╝░░░╚═╝░░░╚════╝░░╚════╝░░░░░░░╚═╝░░░░░╚═╝

*
* MIT License
* ===========
*
* Copyright (c) 2020 WooTrade
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IERC4626.sol';
import './interfaces/IWETH.sol';
import './interfaces/IStrategy.sol';
import './interfaces/IWooAccessManager.sol';

/// @title WOOFi LendingVault.
contract LendingVault is ERC20, Ownable, ReentrancyGuard, Pausable, IERC4626 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // ************** //
    // *** EVENTS *** //
    // ************** //

    event RequestWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event CancelRequestWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event InstantWithdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares,
        uint256 fees
    );

    event UpgradeStrategy(address strategy);
    event NewStrategyCandidate(address strategy);

    // *************** //
    // *** STRUCTS *** //
    // *************** //

    struct UserInfo {
        uint256 requestAssets; // ADD in `requestWithdraw` and SUBTRACT in `withdraw` && `cancelRequestWithdraw`
        uint256 requestShares; // ADD in `requestWithdraw` and SUBTRACT in `withdraw` && `cancelRequestWithdraw`
        uint256 costSharePrice; // Only for `strategy`
    }

    struct StrategyCandidate {
        address implementation;
        uint256 proposedTime;
    }

    // ******************************** //
    // *** CONSTANTS AND IMMUTABLES *** //
    // ******************************** //

    address public immutable weth;
    address public immutable override asset;

    uint256 public constant MAX_PERCENTAGE = 10000; // 100%

    // ***************** //
    // *** VARIABLES *** //
    // ***************** //

    // 3rd party protocol auto-compounding strategy
    address public strategy;
    // Treasury for `instantWithdraw`
    address public treasury;
    address public wooAccessManager;

    // For `instantWithdraw`, update to 0 each week
    uint256 public leftInstantWithdrawBal = 0;
    // For `instantWithdraw`, update each week
    uint256 public maxInstantWithdrawBal = 0;

    uint256 public woofiLendPercentage = 8000; // 80%
    uint256 public instantWithdrawFeePercentage = 30; // 0.3%
    uint256 public interestRatePercentage; // Set by market maker

    // User request the amount of `asset` to claim in the next epoch, no interest anymore
    uint256 public totalRequestAssets;
    // User request the amount of `share` to claim in the next epoch, still get interest
    uint256 public totalRequestShares;
    // WOOFi market maker borrow `asset` and pay interest
    uint256 public totalBorrowAssets;
    // WOOFi market maker borrow interest
    uint256 public totalInterestAssets;

    uint256 public approvalDelay = 48 hours;

    bool public allowRequestWithdraw = true;

    StrategyCandidate public strategyCandidate;

    mapping(address => UserInfo) public userInfo;

    // ******************* //
    // *** CONSTRUCTOR *** //
    // ******************* //

    constructor(address _weth, address _asset)
        public
        ERC20(
            string(abi.encodePacked('WOOFi ', ERC20(_asset).name())),
            string(abi.encodePacked('w ', ERC20(_asset).symbol()))
        )
    {
        weth = _weth;
        asset = _asset;
    }

    // ***************** //
    // *** MODIFIERS *** //
    // ***************** //

    modifier onlyAdmin() {
        require(
            owner() == msg.sender || IWooAccessManager(wooAccessManager).isVaultAdmin(msg.sender),
            'LendingVault: Not admin'
        );
        _;
    }

    // ************************** //
    // *** INTERNAL FUNCTIONS *** //
    // ************************** //

    function _convertToAssets(uint256 shares, bool roundUp) internal view returns (uint256 assets) {
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ == 0) {
            assets = shares;
        } else {
            uint256 totalAssets_ = totalAssets();
            assets = shares.mul(totalAssets_).div(totalSupply_);
            if (roundUp && assets.mul(totalSupply_).div(totalAssets_) < shares) {
                assets = assets.add(1);
            }
        }
    }

    function _convertToShares(uint256 assets, bool roundUp) internal view returns (uint256 shares) {
        uint256 totalSupply_ = totalSupply();
        if (totalSupply_ == 0) {
            shares = assets;
        } else {
            uint256 totalAssets_ = totalAssets();
            shares = assets.mul(totalSupply_).div(totalAssets_);
            if (roundUp && shares.mul(totalAssets_).div(totalSupply_) < assets) {
                shares = shares.add(1);
            }
        }
    }

    function _updateCostSharePrice(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal {
        uint256 sharesBefore = balanceOf(receiver);
        UserInfo storage userInfo_ = userInfo[receiver];
        uint256 costBefore = userInfo_.costSharePrice;

        userInfo_.costSharePrice = (sharesBefore.mul(costBefore).add(assets.mul(1e18))).div(sharesBefore.add(shares));
    }

    function _farmAtStrategy() internal {
        if (isStrategyActive()) {
            // uint256 localAssets = IERC20(asset).balanceOf(address(this));
            uint256 localAssets_ = localAssets();
            TransferHelper.safeTransfer(asset, strategy, localAssets_);
            IStrategy(strategy).deposit();
        }
    }

    // ************************ //
    // *** PUBLIC FUNCTIONS *** //
    // ************************ //

    function totalAssets() public view override returns (uint256 totalManagedAssets) {
        uint256 localAssets_ = localAssets();
        uint256 strategyAssets = IStrategy(strategy).balanceOf();

        totalManagedAssets = localAssets_.add(strategyAssets).add(totalBorrowAssets).add(totalInterestAssets);
    }

    function convertToShares(uint256 assets) public view override returns (uint256 shares) {
        shares = _convertToShares(assets, false);
    }

    function convertToAssets(uint256 shares) public view override returns (uint256 assets) {
        assets = _convertToAssets(shares, false);
    }

    function maxDeposit(address) public view override returns (uint256 maxAssets) {
        maxAssets = paused() ? 0 : uint256(-1);
    }

    function previewDeposit(uint256 assets) public view override returns (uint256 shares) {
        require(!paused(), 'LendingVault: Vault paused');
        shares = _convertToShares(assets, false);
    }

    function maxMint(address) public view override returns (uint256 maxShares) {
        maxShares = paused() ? 0 : uint256(-1);
    }

    function previewMint(uint256 shares) public view override returns (uint256 assets) {
        require(!paused(), 'LendingVault: Vault paused');
        assets = _convertToAssets(shares, true);
    }

    function maxWithdraw(address owner) public view override returns (uint256 maxAssets) {
        UserInfo memory userInfo_ = userInfo[owner];
        maxAssets = _convertToAssets(userInfo_.requestShares, false);
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function maxRedeem(address owner) public view override returns (uint256 maxShares) {
        uint256 shares = balanceOf(owner);
        uint256 ownerBal = _convertToAssets(shares, false);
        if (leftInstantWithdrawBal > ownerBal) maxShares = shares;
        else maxShares = _convertToShares(leftInstantWithdrawBal, true);
    }

    function previewRedeem(uint256 shares) public view override returns (uint256 assets) {
        assets = _convertToAssets(shares, false);
        require(assets <= leftInstantWithdrawBal, 'LendingVault: shares exceed');
    }

    function maxRequestWithdraw(address owner) public view returns (uint256 maxAssets) {
        maxAssets = _convertToAssets(balanceOf(owner), false);
    }

    function previewRequestWithdraw(uint256 assets) public view returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function maxInstantWithdraw(address owner) public view returns (uint256 maxAssets) {
        uint256 ownerBal = _convertToAssets(balanceOf(owner), false);
        maxAssets = leftInstantWithdrawBal > ownerBal ? ownerBal : leftInstantWithdrawBal;
    }

    function previewInstantWithdraw(uint256 assets) public view returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function localAssets() public view returns (uint256 assets) {
        // TODO
        // uint256 localBal = IERC20(asset).balanceOf(address(this));
        assets = 0; // For compile pass temporary
    }

    function getPricePerFullShare() public view returns (uint256 sharePrice) {
        sharePrice = _convertToAssets(1e18, false);
    }

    function isStrategyActive() public view returns (bool active) {
        active = strategy != address(0) && !IStrategy(strategy).paused();
    }

    // ************************** //
    // *** EXTERNAL FUNCTIONS *** //
    // ************************** //

    function deposit(uint256 assets, address receiver)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        require(receiver != address(0), 'LendingVault: receiver not set');
        require((shares = previewDeposit(assets)) != 0, 'LendingVault: Zero shares');

        // uint256 assetsBefore = IERC20(asset).balanceOf(address(this));
        uint256 assetsBefore = localAssets();
        if (asset == weth) {
            require(msg.value == assets, 'LendingVault: msg.value insufficient');
            IWETH(weth).deposit{value: msg.value}();
        } else {
            require(msg.value == 0, 'LendingVault: msg.value invalid');
            TransferHelper.safeTransferFrom(asset, msg.sender, address(this), assets);
        }
        // uint256 assetsAfter = IERC20(asset).balanceOf(address(this));
        uint256 assetsAfter = localAssets();
        require(assetsAfter.sub(assetsBefore) >= assets, 'LendingVault: assets not enough');

        _updateCostSharePrice(assets, shares, receiver);
        _mint(receiver, shares);
        _farmAtStrategy();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver)
        external
        payable
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        require(receiver != address(0), 'LendingVault: receiver not set');
        require((assets = previewMint(shares)) != 0, 'LendingVault: Zero assets');

        // uint256 assetsBefore = IERC20(asset).balanceOf(address(this));
        uint256 assetsBefore = localAssets();
        if (asset == weth) {
            require(msg.value == assets, 'LendingVault: msg.value insufficient');
            IWETH(weth).deposit{value: msg.value}();
        } else {
            require(msg.value == 0, 'LendingVault: msg.value invalid');
            TransferHelper.safeTransferFrom(asset, msg.sender, address(this), assets);
        }
        // uint256 assetsAfter = IERC20(asset).balanceOf(address(this));
        uint256 assetsAfter = localAssets();
        require(assetsAfter.sub(assetsBefore) >= assets, 'LendingVault: assets not enough');

        _updateCostSharePrice(assets, shares, receiver);
        _mint(receiver, shares);
        _farmAtStrategy();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external override nonReentrant returns (uint256 shares) {
        // TODO
        shares = 0; // For compile pass temporary
    }

    function requestWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 shares) {
        require(allowRequestWithdraw, 'LendingVault: Not allow yet, please wait');
        require(receiver != address(0), 'LendingVault: receiver not set');
        // For user assets safety consideration,
        // not allow msg.sender withdraw through msg.sender has ERC-20 approval over the shares of owner
        require(msg.sender == owner, 'LendingVault: msg.sender not owner');
        require(assets <= maxRequestWithdraw(owner), 'LendingVault: owner assets insufficient');
        require((shares = previewRequestWithdraw(assets)) != 0, 'LendingVault: Zero shares');

        // Get shares from owner to contract, burn these shares when user `withdraw`
        TransferHelper.safeTransferFrom(address(this), owner, address(this), shares);

        UserInfo storage userInfo_ = userInfo[receiver];
        userInfo_.requestShares = userInfo_.requestShares.add(shares);
        totalRequestShares = totalRequestShares.add(shares);

        // `assets` is not the final result, share price will increase until next epoch
        emit RequestWithdraw(msg.sender, receiver, owner, assets, shares);
    }

    function cancelRequestWithdraw(address receiver, address owner) external nonReentrant returns (uint256 shares) {
        require(allowRequestWithdraw, 'LendingVault: Not allow yet, please wait');
        require(owner != address(0), 'LendingVault: receiver not set');
        // For user assets safety consideration,
        // not allow msg.sender withdraw through msg.sender has ERC-20 approval over the shares of owner
        require(msg.sender == owner, 'LendingVault: msg.sender not owner');
        UserInfo storage userInfo_ = userInfo[owner];
        require((shares = userInfo_.requestShares) != 0, 'LendingVault: Zero shares');

        userInfo_.requestShares = 0;
        totalRequestShares = totalRequestShares.sub(shares);

        TransferHelper.safeTransfer(address(this), receiver, shares);

        uint256 assets = _convertToAssets(shares, false);
        // `assets` is not the final result, share price will increase until next epoch
        emit CancelRequestWithdraw(msg.sender, receiver, owner, assets, shares);
    }

    function instantWithdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external nonReentrant returns (uint256 shares) {
        require(receiver != address(0), 'LendingVault: receiver not set');
        require(assets <= maxInstantWithdraw(owner), 'LendingVault: owner assets insufficient');
        require((shares = previewInstantWithdraw(assets)) != 0, 'LendingVault: Zero shares');
        // For user assets safety consideration,
        // not allow msg.sender withdraw through msg.sender has ERC-20 approval over the shares of owner
        require(msg.sender == owner, 'LendingVault: msg.sender not owner');

        if (isStrategyActive()) IStrategy(strategy).beforeWithdraw();

        _burn(owner, shares);

        // uint256 localAssets_ = IERC20(asset).balanceOf(address(this));
        uint256 localAssets_ = localAssets();
        if (localAssets_ < assets) {
            uint256 withdrawAmount = assets.sub(localAssets_);
            require(isStrategyActive(), 'LendingVault: Strategy inactive');
            IStrategy(strategy).withdraw(withdrawAmount);
            // localAssets_ = IERC20(asset).balanceOf(address(this));
            localAssets_ = localAssets();
            if (assets > localAssets_) assets = localAssets_;
        }

        leftInstantWithdrawBal = leftInstantWithdrawBal.sub(assets);

        uint256 fees;
        if (IWooAccessManager(wooAccessManager).isZeroFeeVault(msg.sender)) fees = 0;
        else fees = assets.mul(instantWithdrawFeePercentage).div(MAX_PERCENTAGE);

        if (asset == weth) {
            IWETH(weth).withdraw(assets);
            TransferHelper.safeTransferETH(receiver, assets.sub(fees));
            if (fees > 0) TransferHelper.safeTransferETH(treasury, fees);
        } else {
            TransferHelper.safeTransfer(asset, receiver, assets.sub(fees));
            if (fees > 0) TransferHelper.safeTransfer(asset, treasury, fees);
        }

        emit InstantWithdraw(msg.sender, receiver, owner, assets, shares, fees);
    }

    // *********************** //
    // *** ADMIN FUNCTIONS *** //
    // *********************** //

    function setTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), 'LendingVault: _treasury not set');
        treasury = _treasury;
    }

    function setWooAccessManager(address _wooAccessManager) external onlyAdmin {
        require(_wooAccessManager != address(0), 'LendingVault: _wooAccessManager not set');
        wooAccessManager = _wooAccessManager;
    }

    /// @notice Controlled by backend script to daily update
    function setDailyMaxInstantWithdrawBal(uint256 maxBal) external onlyAdmin {
        if (maxBal > maxInstantWithdrawBal) {
            uint256 increaseBal = maxBal.sub(maxInstantWithdrawBal);
            leftInstantWithdrawBal = leftInstantWithdrawBal.add(increaseBal);
            maxInstantWithdrawBal = maxBal;
        }
    }

    /// @notice Controlled by backend script to weekly update
    function setWeeklyMaxInstantWithdrawBal(uint256 maxBal) external onlyAdmin {
        leftInstantWithdrawBal = maxBal;
        maxInstantWithdrawBal = maxBal;
    }

    function setWOOFiLendPercentage(uint256 percentage) external onlyAdmin {
        require(percentage <= MAX_PERCENTAGE, 'LendingVault: percentage exceed');
        woofiLendPercentage = percentage;
        // Payback the assets if percentage become lower? TODO
    }

    function setInstantWithdrawFeePercentage(uint256 percentage) external onlyAdmin {
        require(percentage <= MAX_PERCENTAGE, 'LendingVault: percentage exceed');
        instantWithdrawFeePercentage = percentage;
    }

    function setInterestRatePercentage(uint256 percentage) external onlyAdmin {
        require(percentage <= MAX_PERCENTAGE, 'LendingVault: percentage exceed');
        interestRatePercentage = percentage;
        // Settlement? TODO
    }

    function setApprovalDelay(uint256 delay) external onlyAdmin {
        approvalDelay = delay;
    }

    function setAllowRequestWithdraw(bool allow) external onlyAdmin {
        allowRequestWithdraw = allow;
    }

    function setupStrategy(address _strategy) external onlyAdmin {
        require(_strategy != address(0), 'LendingVault: _strategy not set');
        require(address(strategy) == address(0), 'LendingVault: strategy already set');
        require(address(this) == IStrategy(_strategy).vault(), 'LendingVault: _strategy vault invalid');
        require(asset == IStrategy(_strategy).want(), 'LendingVault: _strategy want invalid');
        strategy = _strategy;

        emit UpgradeStrategy(_strategy);
    }

    function proposeStrat(address _strategy) external onlyAdmin {
        require(address(this) == IStrategy(_strategy).vault(), 'LendingVault: _strategy vault invalid');
        require(asset == IStrategy(_strategy).want(), 'LendingVault: _strategy want invalid');
        // solhint-disable-next-line not-rely-on-time
        strategyCandidate = StrategyCandidate({implementation: _strategy, proposedTime: block.timestamp});

        emit NewStrategyCandidate(_strategy);
    }

    function upgradeStrat() external onlyAdmin {
        require(strategyCandidate.implementation != address(0), 'LendingVault: No candidate');
        // solhint-disable-next-line not-rely-on-time
        require(strategyCandidate.proposedTime.add(approvalDelay) < block.timestamp, 'LendingVault: Time invalid');

        IStrategy(strategy).retireStrat();
        strategy = strategyCandidate.implementation;
        strategyCandidate.implementation = address(0);
        strategyCandidate.proposedTime = 5000000000; // 100+ years to ensure proposedTime check

        _farmAtStrategy();

        emit UpgradeStrategy(strategyCandidate.implementation);
    }

    function inCaseTokensGetStuck(address token) external onlyAdmin {
        require(token != asset, 'LendingVault: token not allow');
        require(token != address(0), 'LendingVault: token not set');
        uint256 tokenBal = IERC20(token).balanceOf(address(this));
        if (tokenBal > 0) TransferHelper.safeTransfer(token, msg.sender, tokenBal);
    }

    function inCaseNativeTokensGetStuck() external onlyAdmin {
        // Vault never needs native tokens to do the yield farming,
        // this native token balance indicates a user's incorrect transfer.
        uint256 nativeBal = address(this).balance;
        if (nativeBal > 0) TransferHelper.safeTransferETH(msg.sender, nativeBal);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
