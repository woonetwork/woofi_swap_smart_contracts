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
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import './interfaces/IWooCoolDownVault.sol';

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import '@openzeppelin/contracts/access/Ownable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

contract WooStakingVault is ERC20, Ownable {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    /* ----- State variables ----- */

    IERC20 public stakedToken;
    IWooCoolDownVault public wooCoolDownVault;
    mapping (address => uint256) public costSharePrice;

    bool public allowContract = false;

    constructor(address _stakedToken, address _wooCoolDownVault)
        public
        ERC20(
            string(abi.encodePacked("Interest bearing", ERC20(_stakedToken).name())),
            string(abi.encodePacked("x", ERC20(_stakedToken).symbol()))
        )
    {
        stakedToken = IERC20(_stakedToken);
        wooCoolDownVault = IWooCoolDownVault(_wooCoolDownVault);
        require(wooCoolDownVault.coolDownToken() == address(stakedToken));
    }

    /* ----- Modifier ----- */

    modifier onlyHuman {
        if (!allowContract) {
            require(tx.origin == msg.sender);
            _;
        } else {
            _;
        }
    }

    /* ----- External Functions ----- */

    function deposit(uint256 _amount) external onlyHuman {
        uint256 poolBalance = balance();
        uint256 balanceBefore = stakedToken.balanceOf(address(this));
        TransferHelper.safeTransferFrom(address(stakedToken), msg.sender, address(this), _amount);
        uint256 balanceAfter = stakedToken.balanceOf(address(this));
        _amount = balanceAfter.sub(balanceBefore);

        uint256 xTotalSupply = totalSupply();
        uint256 shares = xTotalSupply == 0 ? _amount : _amount.mul(xTotalSupply).div(poolBalance);

        _updateCostSharePrice(_amount, shares);

        _mint(msg.sender, shares);
    }

    function withdraw(uint256 _shares) external onlyHuman {
        uint256 withdrawBalance = (balance().mul(_shares)).div(totalSupply());
        uint256 poolBalance = balance();
        if (poolBalance < withdrawBalance) {
            withdrawBalance = poolBalance;
        }

        _burn(msg.sender, _shares);
        wooCoolDownVault.deposit(withdrawBalance);
    }

    function getPricePerFullShare() external view returns (uint256) {
        return balance().mul(1e18).div(totalSupply());
    }

    /* ----- Public Functions ----- */

    function balance() public view returns (uint256) {
        return stakedToken.balanceOf(address(this));
    }

    /* ----- Private Functions ----- */

    function _updateCostSharePrice(uint256 _amount, uint256 _shares) private {
        uint256 beforeShares = balanceOf(msg.sender);
        uint beforeCost = costSharePrice[msg.sender];
        uint afterCost = (
            beforeShares.mul(beforeCost).add(_amount.mul(1e18))
        ).div(beforeShares.add(_shares));

        costSharePrice[msg.sender] = afterCost;
    }

    /* ----- Admin Functions ----- */

    function toggleAllowContract(bool _allowContract) public onlyOwner {
        allowContract = _allowContract;
    }
}
