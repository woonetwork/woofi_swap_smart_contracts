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
import '@openzeppelin/contracts/utils/EnumerableSet.sol';
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
    using EnumerableSet for EnumerableSet.AddressSet;

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

    event SettleInterest(
        address indexed caller,
        uint256 diff,
        uint256 rate,
        uint256 interestAssets,
        uint256 totalInterestAssets
    );

    event Settle(address indexed caller, address indexed user, uint256 assets, uint256 shares);

    event SetDailyMaxInstantWithdrawAssets(
        uint256 maxInstantWithdrawAssets,
        uint256 leftInstantWithdrawAssets,
        uint256 maxAssets
    );

    event SetWeeklyMaxInstantWithdrawAssets(uint256 maxAssets);

    event Borrow(uint256 assets);

    event Repay(uint256 assets, bool repaySettle);

    event UpgradeStrategy(address strategy);

    event NewStrategyCandidate(address strategy);

    // *************** //
    // *** STRUCTS *** //
    // *************** //

    struct UserInfo {
        uint256 requestShares; // ADD in `requestWithdraw` and SUBTRACT in `withdraw` && `cancelRequestWithdraw`
        uint256 settleAssets; // ADD in `requestWithdraw` and SUBTRACT in `withdraw` && `cancelRequestWithdraw`
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

    uint256 private constant INTEREST_RATE_COEFF = 31536000; // 365 * 24 * 3600
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
    uint256 public leftInstantWithdrawAssets;
    // For `instantWithdraw`, update each week
    uint256 public maxInstantWithdrawAssets;

    uint256 public allowBorrowPercentage = 9000; // 90%
    uint256 public instantWithdrawFeePercentage = 30; // 0.3%
    uint256 public interestRatePercentage; // Set by market maker

    // User request the amount of `asset` to claim in the next epoch, no interest anymore
    uint256 public totalSettleAssets;
    // Market maker borrow `asset` and pay interest, set to 0 when `settle`
    uint256 public totalBorrowAssets;
    // Market maker borrow interest, set to 0 when `settle`
    uint256 public totalInterestAssets;
    // Market maker repay the `assets` and store in contract locally, waiting for user to withdraw
    uint256 public totalRepaySettleAssets;
    // Market maker debt after `settle`, will subtract when `repay`
    uint256 public totalDebtSettleAssets;
    // Record last `settleInterest` timestamp for calculating interest
    uint256 public lastSettleInterest;

    uint256 public approvalDelay = 48 hours;

    bool public allowRequestWithdraw = true;

    StrategyCandidate public strategyCandidate;

    EnumerableSet.AddressSet private requestUsers;
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
        // solhint-disable-next-line not-rely-on-time
        lastSettleInterest = block.timestamp;
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
            uint256 localAssets_ = localAssets();
            TransferHelper.safeTransfer(asset, strategy, localAssets_);
            IStrategy(strategy).deposit();
        }
    }

    function _withdrawStrategyIfNeed(uint256 assets) internal {
        uint256 localAssets_ = localAssets();
        if (localAssets_ < assets) {
            uint256 withdrawAmount = assets.sub(localAssets_);
            require(isStrategyActive(), 'LendingVault: Strategy inactive');
            IStrategy(strategy).withdraw(withdrawAmount);
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
        maxAssets = userInfo_.settleAssets;
    }

    function previewWithdraw(uint256 assets) public view override returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function maxRequestWithdraw(address owner) public view returns (uint256 maxAssets) {
        maxAssets = _convertToAssets(balanceOf(owner), false);
    }

    function previewRequestWithdraw(uint256 assets) public view returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function maxInstantWithdraw(address owner) public view returns (uint256 maxAssets) {
        uint256 assets = _convertToAssets(balanceOf(owner), false);
        maxAssets = leftInstantWithdrawAssets > assets ? assets : leftInstantWithdrawAssets;
    }

    function previewInstantWithdraw(uint256 assets) public view returns (uint256 shares) {
        shares = _convertToShares(assets, true);
    }

    function localAssets() public view returns (uint256 assets) {
        assets = IERC20(asset).balanceOf(address(this)).sub(totalRepaySettleAssets);
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

        uint256 assetsBefore = localAssets();
        if (asset == weth) {
            require(msg.value == assets, 'LendingVault: msg.value insufficient');
            IWETH(weth).deposit{value: msg.value}();
        } else {
            require(msg.value == 0, 'LendingVault: msg.value invalid');
            TransferHelper.safeTransferFrom(asset, msg.sender, address(this), assets);
        }
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

        uint256 assetsBefore = localAssets();
        if (asset == weth) {
            require(msg.value == assets, 'LendingVault: msg.value insufficient');
            IWETH(weth).deposit{value: msg.value}();
        } else {
            require(msg.value == 0, 'LendingVault: msg.value invalid');
            TransferHelper.safeTransferFrom(asset, msg.sender, address(this), assets);
        }
        uint256 assetsAfter = localAssets();
        require(assetsAfter.sub(assetsBefore) >= assets, 'LendingVault: assets not enough');

        _updateCostSharePrice(assets, shares, receiver);
        _mint(receiver, shares);
        _farmAtStrategy();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(address receiver, address owner) external override nonReentrant returns (uint256 shares) {
        require(receiver != address(0), 'LendingVault: receiver not set');
        // For user assets safety consideration,
        // not allow msg.sender withdraw through msg.sender has ERC-20 approval over the shares of owner
        require(msg.sender == owner, 'LendingVault: msg.sender not owner');

        UserInfo storage userInfo_ = userInfo[owner];
        uint256 assets = userInfo_.settleAssets;
        require(totalSettleAssets >= assets, 'LendingVault: Not settle, please wait');
        require(totalRepaySettleAssets >= assets, 'LendingVault: Not repay, please wait');
        userInfo_.settleAssets = 0;
        totalSettleAssets = totalSettleAssets.sub(assets);
        totalRepaySettleAssets = totalRepaySettleAssets.sub(assets);

        if (asset == weth) {
            IWETH(weth).withdraw(assets);
            TransferHelper.safeTransferETH(receiver, assets);
        } else {
            TransferHelper.safeTransfer(asset, receiver, assets);
        }

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
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
        requestUsers.add(receiver);

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
        requestUsers.remove(owner);

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

        _withdrawStrategyIfNeed(assets);
        uint256 localAssets_ = localAssets();
        if (assets > localAssets_) assets = localAssets_;

        leftInstantWithdrawAssets = leftInstantWithdrawAssets.sub(assets);

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

    function settleInterest() public onlyAdmin {
        // solhint-disable-next-line not-rely-on-time
        uint256 currentSettleInterest = block.timestamp;
        require(currentSettleInterest >= lastSettleInterest, 'LendingVault: Timestamp exceed');

        uint256 diff = currentSettleInterest.sub(lastSettleInterest);
        uint256 rate = diff.mul(1e18).mul(interestRatePercentage).div(INTEREST_RATE_COEFF).div(MAX_PERCENTAGE);
        uint256 interestAssets = totalBorrowAssets.mul(rate).div(1e18);

        totalInterestAssets = totalInterestAssets.add(interestAssets);
        lastSettleInterest = currentSettleInterest;

        emit SettleInterest(msg.sender, diff, rate, interestAssets, totalInterestAssets);
    }

    /// @notice Controlled by backend script to weekly/settle update
    function setWeeklyMaxInstantWithdrawAssets() public onlyAdmin returns (uint256 maxAssets) {
        maxAssets = totalAssets().mul(MAX_PERCENTAGE.sub(allowBorrowPercentage)).div(MAX_PERCENTAGE);
        leftInstantWithdrawAssets = maxAssets;
        maxInstantWithdrawAssets = maxAssets;

        emit SetWeeklyMaxInstantWithdrawAssets(maxAssets);
    }

    function setInterestRatePercentage(uint256 _interestRatePercentage) public onlyAdmin {
        require(_interestRatePercentage <= MAX_PERCENTAGE, 'LendingVault: _interestRatePercentage exceed');
        settleInterest();
        interestRatePercentage = _interestRatePercentage;
    }

    /// @notice Trigger in the next epoch
    function settle() external onlyAdmin {
        if (isStrategyActive()) IStrategy(strategy).beforeWithdraw();
        settleInterest();

        uint256 totalBurnShares = 0;
        uint256 length = requestUsers.length();
        for (uint256 i = 0; i < length; i++) {
            address user = requestUsers.at(0);
            UserInfo storage userInfo_ = userInfo[user];
            uint256 shares = userInfo_.requestShares;
            totalBurnShares = totalBurnShares.add(shares);
            uint256 assets = _convertToAssets(shares, false);
            userInfo_.requestShares = 0;
            userInfo_.settleAssets = userInfo_.settleAssets.add(assets);
            totalSettleAssets = totalSettleAssets.add(assets);
            requestUsers.remove(user);
            emit Settle(msg.sender, user, assets, shares);
        }
        _burn(address(this), totalBurnShares);
        // Move this week interests(totalInterestAssets) to `totalSettleAssets` as settlement
        totalSettleAssets = totalSettleAssets.add(totalInterestAssets);

        // e.g. totalAssets_ = totalAssets() * 90%, totalAssets_ still has `totalBorrowAssets` and `totalInterestAssets`
        uint256 totalAssets_ = totalAssets().mul(allowBorrowPercentage).div(MAX_PERCENTAGE);
        // Set `totalBorrowAssets` as 0 means the new epoch is ready to borrow
        totalBorrowAssets = 0;
        // Set `totalInterstAssets` as 0 means the new epoch is ready to accumulate the interest
        totalInterestAssets = 0;

        if (totalSettleAssets > totalAssets_) {
            // Don't update instant withdraw limit when debt exist
            totalDebtSettleAssets = totalDebtSettleAssets.add(totalSettleAssets.sub(totalAssets_));
        } else {
            // Automatic update instant withdraw limit when debt not exist in this settlement
            setWeeklyMaxInstantWithdrawAssets();
        }
    }

    function borrow(uint256 assets) external onlyAdmin {
        if (isStrategyActive()) IStrategy(strategy).beforeWithdraw();

        uint256 allowBorrowAssets = totalAssets().mul(allowBorrowPercentage).div(MAX_PERCENTAGE);
        require(totalBorrowAssets.add(assets) <= allowBorrowAssets, 'LendingVault: assets exceed');

        _withdrawStrategyIfNeed(assets);
        uint256 localAssets_ = localAssets();
        if (assets > localAssets_) assets = localAssets_;

        settleInterest();
        totalBorrowAssets = totalBorrowAssets.add(assets);
        TransferHelper.safeTransfer(asset, msg.sender, assets);

        emit Borrow(assets);
    }

    function repay(uint256 assets, bool repaySettle) external onlyAdmin {
        if (assets > 0) {
            require(
                (!repaySettle && totalBorrowAssets >= assets) || (repaySettle && totalDebtSettleAssets >= assets),
                'LendingVault: repaySettle error or assets too much'
            );

            uint256 assetsBefore = localAssets();
            TransferHelper.safeTransferFrom(asset, msg.sender, address(this), assets);
            uint256 assetsAfter = localAssets();
            require(assetsAfter.sub(assetsBefore) >= assets, 'LendingVault: assets not enough');

            if (repaySettle) {
                totalRepaySettleAssets = totalRepaySettleAssets.add(assets);
                totalDebtSettleAssets = totalDebtSettleAssets.sub(assets);
                // When debt equal to 0, update instant withdraw limit
                if (totalDebtSettleAssets == 0) setWeeklyMaxInstantWithdrawAssets();
            } else {
                totalBorrowAssets = totalBorrowAssets.sub(assets);
                _farmAtStrategy();
            }

            emit Repay(assets, repaySettle);
        }
    }

    function setTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), 'LendingVault: _treasury not set');
        treasury = _treasury;
    }

    function setWooAccessManager(address _wooAccessManager) external onlyAdmin {
        require(_wooAccessManager != address(0), 'LendingVault: _wooAccessManager not set');
        wooAccessManager = _wooAccessManager;
    }

    /// @notice Controlled by backend script to daily update
    function setDailyMaxInstantWithdrawAssets() external onlyAdmin returns (uint256 maxAssets) {
        maxAssets = totalAssets().mul(MAX_PERCENTAGE.sub(allowBorrowPercentage)).div(MAX_PERCENTAGE);
        if (maxAssets > maxInstantWithdrawAssets) {
            uint256 increaseAssets = maxAssets.sub(maxInstantWithdrawAssets);
            leftInstantWithdrawAssets = leftInstantWithdrawAssets.add(increaseAssets);
            maxInstantWithdrawAssets = maxAssets;
        }

        emit SetDailyMaxInstantWithdrawAssets(maxInstantWithdrawAssets, leftInstantWithdrawAssets, maxAssets);
    }

    function setAllowBorrowPercentage(uint256 _allowBorrowPercentage) external onlyAdmin {
        require(_allowBorrowPercentage <= MAX_PERCENTAGE, 'LendingVault: _allowBorrowPercentage exceed');
        require(
            totalBorrowAssets <= localAssets().mul(_allowBorrowPercentage).div(MAX_PERCENTAGE),
            'LendingVault: _allowBorrowPercentage too small'
        );
        allowBorrowPercentage = _allowBorrowPercentage;
    }

    function setInstantWithdrawFeePercentage(uint256 _instantWithdrawFeePercentage) external onlyAdmin {
        require(_instantWithdrawFeePercentage <= MAX_PERCENTAGE, 'LendingVault: _instantWithdrawFeePercentage exceed');
        instantWithdrawFeePercentage = _instantWithdrawFeePercentage;
    }

    function setApprovalDelay(uint256 _approvalDelay) external onlyAdmin {
        approvalDelay = _approvalDelay;
    }

    function setAllowRequestWithdraw(bool _allowRequestWithdraw) external onlyAdmin {
        allowRequestWithdraw = _allowRequestWithdraw;
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
