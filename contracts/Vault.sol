// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IController.sol';
import './interfaces/IStrategy.sol';
import './interfaces/IWETH.sol';

contract Vault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /* ----- State Variables ----- */

    IERC20 public immutable want;
    IController public controller;

    mapping(address => uint256) public costSharePrice;

    /* ----- Constant Variables ----- */

    address public constant wrapped = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    constructor(address initialWant, address initialController)
        public
        ERC20(
            string(abi.encodePacked('Interest Bearing ', ERC20(initialWant).name())),
            string(abi.encodePacked('x', ERC20(initialWant).symbol()))
        )
    {
        require(initialWant != address(0), 'Vault: initialWant_ZERO_ADDR');
        require(initialController != address(0), 'Vault: initialController_ZERO_ADDR');

        want = IERC20(initialWant);
        controller = IController(initialController);
    }

    /* ----- External Functions ----- */

    function depositAll() external {
        deposit(want.balanceOf(msg.sender));
    }

    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    /* ----- Public Functions ----- */

    function deposit(uint256 amount) public payable nonReentrant {
        require(amount > 0, 'Vault: amount_CAN_NOT_BE_ZERO');

        if (msg.value > 0) {
            require(address(want) == wrapped, 'Vault: not_BNB');
            require(amount == msg.value, 'Vault: msg.value_not_equal_to_amount');
        } else {
            require(msg.value == 0, 'Vault: msg.value_not_equal_to_zero');
        }

        IStrategy(controller.strategies(want)).beforeDeposit();

        uint256 balanceBefore = want.balanceOf(address(this));
        if (msg.value > 0) {
            IWETH(wrapped).deposit{value: msg.value}();
        } else {
            TransferHelper.safeTransferFrom(address(want), msg.sender, address(this), amount);
        }
        uint256 balanceAfter = want.balanceOf(address(this));
        amount = balanceAfter.sub(balanceBefore);

        uint256 xTotalSupply = totalSupply();
        uint256 shares = xTotalSupply == 0 ? amount : amount.mul(xTotalSupply).div(balanceBefore);

        _updateCostSharePrice(amount, shares);

        _mint(msg.sender, shares);

        earn();
    }

    function withdraw(uint256 shares) public nonReentrant {
        require(shares > 0, 'Vault: shares_CAN_NOT_BE_ZERO');
        require(shares <= balanceOf(msg.sender), 'Vault: shares exceed balance');

        uint256 withdrawAmount = shares.mul(balance()).div(totalSupply());
        _burn(msg.sender, shares);

        uint256 balanceBefore = want.balanceOf(address(this));
        if (balanceBefore < withdrawAmount) {
            uint256 needWithdraw = withdrawAmount.sub(balanceBefore);
            controller.withdraw(address(want), needWithdraw);
            uint256 balanceAfter = want.balanceOf(address(this));
            uint256 diff = balanceAfter.sub(balanceBefore);
            if (diff < needWithdraw) {
                withdrawAmount = balanceBefore.add(diff);
            }
        }

        if (address(want) == wrapped) {
            IWETH(wrapped).withdraw(withdrawAmount);
            msg.sender.transfer(withdrawAmount);
        } else {
            TransferHelper.safeTransfer(address(want), msg.sender, withdrawAmount);
        }
    }

    function earn() public {
        uint256 balanceAvail = available();
        TransferHelper.safeTransfer(address(want), address(controller), balanceAvail);
        controller.earn(address(want), balanceAvail);
    }

    function available() public view returns (uint256) {
        return want.balanceOf(address(this));
    }

    function balance() public view returns (uint256) {
        return want.balanceOf(address(this)).add(controller.balanceOf(address(want)));
    }

    function getPricePerFullShare() public view returns (uint256) {
        return totalSupply() == 0 ? 1e18 : balance().mul(1e18).div(totalSupply());
    }

    /* ----- Private Functions ----- */

    function _updateCostSharePrice(uint256 amount, uint256 shares) private {
        uint256 sharesBefore = balanceOf(msg.sender);
        uint256 costBefore = costSharePrice[msg.sender];
        uint256 costAfter = (sharesBefore.mul(costBefore).add(amount.mul(1e18))).div(sharesBefore.add(shares));

        costSharePrice[msg.sender] = costAfter;
    }

    /* ----- Admin Functions ----- */

    function setController(address newController) public onlyOwner {
        require(newController != address(0), 'Vault: newController_ZERO_ADDR');

        controller = IController(newController);
    }

    function inCaseTokensGetStuck(address stuckToken) external onlyOwner {
        require(stuckToken != address(0), 'Vault: stuckToken_ZERO_ADDR');
        require(stuckToken != address(want), 'Vault: stuckToken_CAN_NOT_BE_want');

        uint256 amount = IERC20(stuckToken).balanceOf(address(this));
        TransferHelper.safeTransfer(stuckToken, msg.sender, amount);
    }

    receive() external payable {}
}
