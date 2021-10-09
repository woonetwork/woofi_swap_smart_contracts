// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

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
*/

import "./interfaces/IWooPP.sol";
import "./interfaces/IWETH.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


contract WooRouter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Erc20 placeholder address for native tokens (e.g. eth, bnb, matic, etc)
    address constant _ETH_ADDRESS_ = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Wrapper for native tokens (e.g. eth, bnb, matic, etc)
    address constant _WETH_ADDRESS_ = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    address public immutable quoteToken;
    mapping (address => bool) public isWhitelisted;
    IWooPP public pool;

    enum SwapType {
        WooSwap, DodoSwap
    }

    event WooRouterSwap(
        SwapType swapType,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 toAmount,
        address from,
        address to
    );

    event PoolChanged(address newPool);

    receive() external payable {}

    constructor (address _quoteToken, address _pool) public {
        require(_quoteToken != address(0), "INVALID_QUOTE");
        require(address(_pool) != address(0), "Pool address cannot be 0");
        quoteToken = _quoteToken;
        pool = IWooPP(_pool);
        emit PoolChanged(_pool);
    }

    function setPool(address _pool) onlyOwner external {
        require(address(_pool) != address(0), "Pool address cannot be 0");
        pool = IWooPP(_pool);
        emit PoolChanged(_pool);
    }

    /* Swap functions */

    function swap(address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address payable to, address rebateTo)
        external
        payable
        returns (uint256 realToAmount)
    {
        bool isFromETH = fromToken == _ETH_ADDRESS_;
        bool isToETH = toToken == _ETH_ADDRESS_;
        fromToken = isFromETH ? _WETH_ADDRESS_ : fromToken;
        toToken = isToETH ? _WETH_ADDRESS_ : toToken;

        if (isFromETH) {
            require(fromAmount == msg.value);
            IWETH(_WETH_ADDRESS_).deposit{value: msg.value}();
        } else {
            IERC20(fromToken).safeTransferFrom(msg.sender, address(this), fromAmount);
        }
        IERC20(fromToken).safeApprove(address(pool), fromAmount);

        if (fromToken == quoteToken) {
            if (isToETH) {
                realToAmount = pool.sellQuote(toToken, fromAmount, minToAmount, address(this), address(this), rebateTo);
                IWETH(_WETH_ADDRESS_).withdraw(realToAmount);
                to.transfer(realToAmount);
            } else {
                realToAmount = pool.sellQuote(toToken, fromAmount, minToAmount, address(this), to, rebateTo);
            }
        } else if (toToken == quoteToken) {
            realToAmount = pool.sellBase(fromToken, fromAmount, minToAmount, address(this), to, rebateTo);
        } else {
            uint256 quoteAmount = pool.sellBase(fromToken, fromAmount, 0, address(this), address(this), rebateTo);
            IERC20(quoteToken).safeApprove(address(pool), quoteAmount);
            if (isToETH) {
                realToAmount = pool.sellQuote(toToken, quoteAmount, minToAmount, address(this), address(this), rebateTo);
                IWETH(_WETH_ADDRESS_).withdraw(realToAmount);
                to.transfer(realToAmount);
            } else {
                realToAmount = pool.sellQuote(toToken, quoteAmount, minToAmount, address(this), to, rebateTo);
            }
        }
        emit WooRouterSwap(
            SwapType.WooSwap,
            isFromETH ? _ETH_ADDRESS_ : address(fromToken),
            isToETH ? _ETH_ADDRESS_ : address(toToken),
            fromAmount,
            realToAmount,
            msg.sender,
            to
        );
    }

    function sellBase(address baseToken, uint256 baseAmount, uint256 minQuoteAmount, address to, address rebateTo)
        external
        returns (uint256 realQuoteAmount)
    {
        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), baseAmount);
        IERC20(baseToken).safeApprove(address(pool), baseAmount);
        realQuoteAmount = pool.sellBase(baseToken, baseAmount, minQuoteAmount, address(this), to, rebateTo);
        emit WooRouterSwap(
            SwapType.WooSwap,
            address(baseToken),
            address(quoteToken),
            baseAmount,
            realQuoteAmount,
            msg.sender,
            to
        );
    }

    function sellQuote(address baseToken, uint256 quoteAmount, uint256 minBaseAmount, address to, address rebateTo)
        external
        returns (uint256 realBaseAmount)
    {
        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), quoteAmount);
        IERC20(quoteToken).safeApprove(address(pool), quoteAmount);
        realBaseAmount = pool.sellQuote(baseToken, quoteAmount, minBaseAmount, address(this), to, rebateTo);
        emit WooRouterSwap(
            SwapType.WooSwap,
            address(quoteToken),
            address(baseToken),
            quoteAmount,
            realBaseAmount,
            msg.sender,
            to
        );
    }

    /* Fallback swap function */

    function externalSwap(
        address approveTarget,
        address swapTarget,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        address payable to,
        bytes calldata data
    ) external payable nonReentrant {
        uint256 preBalance = _generalBalanceOf(toToken, address(this));
        internalFallbackSwap(approveTarget, swapTarget, fromToken, fromAmount, data);
        uint256 postBalance = _generalBalanceOf(toToken, address(this));

        if (postBalance > preBalance) {
            _generalTransfer(toToken, to, postBalance.sub(preBalance));
        }

        emit WooRouterSwap(
            SwapType.DodoSwap,
            address(fromToken),
            address(toToken),
            fromAmount,
            postBalance.sub(preBalance),
            msg.sender,
            to
        );
    }

    function internalFallbackSwap(
        address approveTarget,
        address swapTarget,
        address fromToken,
        uint256 fromAmount,
        bytes calldata data
    ) internal {
        require(isWhitelisted[approveTarget], "APPROVE_TARGET_NOT_ALLOWED");
        if (approveTarget != swapTarget) {
            require(isWhitelisted[swapTarget], "SWAP_TARGET_NOT_ALLOWED");
        }

        if (fromToken != _ETH_ADDRESS_) {
            IERC20(fromToken).transferFrom(msg.sender, address(this), fromAmount);
            IERC20(fromToken).approve(approveTarget, fromAmount);
        } else {
            require(fromAmount == msg.value);
        }

        (bool success, ) = swapTarget.call{
            value: fromToken == _ETH_ADDRESS_ ? fromAmount : 0
        }(data);
        require(success, "FALLBACK_SWAP_FAILED");
    }

    function _generalTransfer(
        address token,
        address payable to,
        uint256 amount
    ) internal {
        if (amount > 0) {
            if (token == _ETH_ADDRESS_) {
                to.transfer(amount);
            } else {
                IERC20(token).safeTransfer(to, amount);
            }
        }
    }

    function _generalBalanceOf(
        address token,
        address who
    ) internal view returns (uint256) {
        if (token == _ETH_ADDRESS_ ) {
            return who.balance;
        } else {
            return IERC20(token).balanceOf(who);
        }
    }

    function setWhitelisted(address target, bool whitelisted) external onlyOwner {
        isWhitelisted[target] = whitelisted;
    }

    /* Misc functions */

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.safeTransfer(msg.sender, amount);
    }

    function destroy() external onlyOwner {
        selfdestruct(msg.sender);
    }

    /* Query functions */

    function querySwap(address fromToken, address toToken, uint256 fromAmount)
        external
        view
        returns (uint256 toAmount)
    {
        fromToken = (fromToken == _ETH_ADDRESS_) ? _WETH_ADDRESS_ : fromToken;
        toToken = (toToken == _ETH_ADDRESS_) ? _WETH_ADDRESS_ : toToken;
        if (fromToken == quoteToken) {
            toAmount = pool.querySellQuote(toToken, fromAmount);
        } else if (toToken == quoteToken) {
            toAmount = pool.querySellBase(fromToken, fromAmount);
        } else {
            uint256 quoteAmount = pool.querySellBase(fromToken, fromAmount);
            toAmount = pool.querySellQuote(toToken, quoteAmount);
        }
    }

    function querySellBase(address baseToken, uint256 baseAmount)
        external
        view
        returns (uint256 quoteAmount)
    {
        baseToken = (baseToken == _ETH_ADDRESS_) ? _WETH_ADDRESS_ : baseToken;
        quoteAmount = pool.querySellBase(baseToken, baseAmount);
    }

    function querySellQuote(address baseToken, uint256 quoteAmount)
        external
        view
        returns (uint256 baseAmount)
    {
        baseToken = (baseToken == _ETH_ADDRESS_) ? _WETH_ADDRESS_ : baseToken;
        baseAmount = pool.querySellQuote(baseToken, quoteAmount);
    }
}
