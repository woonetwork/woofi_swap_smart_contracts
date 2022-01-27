// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import '../interfaces/IStrategy.sol';
import '../interfaces/IWETH.sol';
import '../interfaces/IWooAccessManager.sol';

contract Vault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct StratCandidate {
        address implementation;
        uint256 proposedTime;
    }

    /* ----- State Variables ----- */

    IERC20 public immutable want;
    IWooAccessManager public immutable accessManager;

    IStrategy public strategy;
    StratCandidate public stratCandidate;

    mapping(address => uint256) public costSharePrice;

    event NewStratCandidate(address implementation);
    event UpgradeStrat(address implementation);

    /* ----- Constant Variables ----- */

    address public constant wrapperEther = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    constructor(address initWant, address initAccessManager)
        public
        ERC20(
            string(abi.encodePacked('WOOFi Earn ', ERC20(initWant).name())),
            string(abi.encodePacked('we', ERC20(initWant).symbol()))
        )
    {
        require(initWant != address(0), 'Vault: initWant_ZERO_ADDR');
        require(initAccessManager != address(0), 'Vault: initAccessManager_ZERO_ADDR');

        want = IERC20(initWant);
        accessManager = IWooAccessManager(initAccessManager);
    }

    modifier onlyAdmin() {
        require(owner() == _msgSender() || accessManager.isVaultAdmin(msg.sender), 'Vault: NOT_ADMIN');
        _;
    }

    /* ----- External Functions ----- */

    function depositAll() external {
        deposit(want.balanceOf(msg.sender));
    }

    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    function deposit(uint256 amount) public payable nonReentrant {
        require(amount > 0, 'Vault: amount_CAN_NOT_BE_ZERO');

        if (address(want) == wrapperEther) {
            require(msg.value == amount, 'Vault: msg.value_INSUFFICIENT');
        } else {
            require(msg.value == 0, 'Vault: msg.value_INVALID');
        }

        if (_isStratActive()) {
            strategy.beforeDeposit();
        }

        uint256 balanceBefore = balance();
        if (address(want) == wrapperEther) {
            IWETH(wrapperEther).deposit{value: msg.value}();
        } else {
            TransferHelper.safeTransferFrom(address(want), msg.sender, address(this), amount);
        }
        uint256 balanceAfter = balance();
        require(amount <= balanceAfter.sub(balanceBefore), 'Vault: amount_NOT_ENOUGH');

        uint256 shares = totalSupply() == 0 ? amount : amount.mul(totalSupply()).div(balanceBefore);
        uint256 sharesBefore = balanceOf(msg.sender);
        uint256 costBefore = costSharePrice[msg.sender];
        uint256 costAfter = (sharesBefore.mul(costBefore).add(amount.mul(1e18))).div(sharesBefore.add(shares));
        costSharePrice[msg.sender] = costAfter;

        _mint(msg.sender, shares);

        earn();
    }

    function withdraw(uint256 shares) public nonReentrant {
        require(shares > 0, 'Vault: shares_ZERO');
        require(shares <= balanceOf(msg.sender), 'Vault: shares_NOT_ENOUGH');

        uint256 withdrawAmount = shares.mul(balance()).div(totalSupply());
        _burn(msg.sender, shares);

        uint256 balanceBefore = want.balanceOf(address(this));
        if (balanceBefore < withdrawAmount) {
            uint256 balanceToWithdraw = withdrawAmount.sub(balanceBefore);
            require(_isStratActive(), 'Vault: STRAT_INACTIVE');
            strategy.withdraw(balanceToWithdraw);
            uint256 balanceAfter = want.balanceOf(address(this));
            if (withdrawAmount > balanceAfter) {
                // NOTE: in case a small amount not counted in, due to the decimal precision.
                withdrawAmount = balanceAfter;
            }
        }

        if (address(want) == wrapperEther) {
            IWETH(wrapperEther).withdraw(withdrawAmount);
            TransferHelper.safeTransferETH(msg.sender, withdrawAmount);
        } else {
            TransferHelper.safeTransfer(address(want), msg.sender, withdrawAmount);
        }
    }

    function earn() public {
        if (_isStratActive()) {
            uint256 balanceAvail = available();
            TransferHelper.safeTransfer(address(want), address(strategy), balanceAvail);
            strategy.deposit();
        }
    }

    function available() public view returns (uint256) {
        return want.balanceOf(address(this));
    }

    function balance() public view returns (uint256) {
        return _isStratActive() ? available().add(strategy.balanceOf()) : available();
    }

    function getPricePerFullShare() public view returns (uint256) {
        return totalSupply() == 0 ? 1e18 : balance().mul(1e18).div(totalSupply());
    }

    function _isStratActive() internal view returns (bool) {
        return address(strategy) != address(0) && !strategy.paused();
    }

    /* ----- Admin Functions ----- */
    function setupStrat(address _strat) public onlyAdmin {
        require(_strat != address(0), 'Vault: STRAT_ALREADY_SET');
        require(address(this) == IStrategy(_strat).vault(), 'Vault: STRAT_VAULT_INVALID');
        strategy = IStrategy(_strat);
    }

    function proposeStrat(address _implementation) public onlyAdmin {
        require(address(this) == IStrategy(_implementation).vault(), 'Vault: STRAT_VAULT_INVALID');
        stratCandidate = StratCandidate({implementation: _implementation, proposedTime: block.timestamp});

        emit NewStratCandidate(_implementation);
    }

    function upgradeStrat() public onlyAdmin {
        require(stratCandidate.implementation != address(0), 'Vault: NO_CANDIDATE');
        require(stratCandidate.proposedTime.add(48 hours) < block.timestamp, 'Vault: TIME_INVALID');

        emit UpgradeStrat(stratCandidate.implementation);

        strategy.retireStrat();
        strategy = IStrategy(stratCandidate.implementation);
        stratCandidate.implementation = address(0);
        stratCandidate.proposedTime = 5000000000;

        earn();
    }

    function inCaseTokensGetStuck(address stuckToken) external onlyAdmin {
        require(stuckToken != address(0), 'Vault: stuckToken_ZERO_ADDR');
        require(stuckToken != address(want), 'Vault: stuckToken_NOT_WANT');

        uint256 amount = IERC20(stuckToken).balanceOf(address(this));
        if (amount > 0) {
            TransferHelper.safeTransfer(stuckToken, msg.sender, amount);
        }
    }

    receive() external payable {}
}
