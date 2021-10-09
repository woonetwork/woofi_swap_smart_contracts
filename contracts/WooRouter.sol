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

import './interfaces/IWooPP.sol';
import './interfaces/IWETH.sol';

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract WooRouter is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Erc20 placeholder address for native tokens (e.g. eth, bnb, matic, etc)
    address constant ETH_PLACEHOLDER_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Wrapper for native tokens (e.g. eth, bnb, matic, etc)
    address constant WETH_ADDRESS = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    address public quoteToken;
    mapping(address => bool) public isWhitelisted;
    IWooPP public wooPool;

    enum SwapType {
        WooSwap,
        DodoSwap
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

    event WooPoolChanged(address newPool);

    receive() external payable {}

    constructor(address newPool) public {
        setPool(newPool);
    }

    function setPool(address newPool) public nonReentrant onlyOwner {
        require(newPool != address(0), 'WooRouter: pool_ADDR_ZERO');
        wooPool = IWooPP(newPool);
        quoteToken = wooPool.quoteToken();
        require(quoteToken != address(0), 'WooRouter: quoteToken_ADDR_ZERO');
        emit WooPoolChanged(newPool);
    }

    /* Swap functions */

    function swap(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        address payable to,
        address rebateTo
    ) external payable nonReentrant returns (uint256 realToAmount) {
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');

        bool isFromETH = fromToken == ETH_PLACEHOLDER_ADDR;
        bool isToETH = toToken == ETH_PLACEHOLDER_ADDR;
        fromToken = isFromETH ? WETH_ADDRESS : fromToken;
        toToken = isToETH ? WETH_ADDRESS : toToken;

        if (isFromETH) {
            require(fromAmount == msg.value, 'WooRouter: fromAmount_INVALID');
            IWETH(WETH_ADDRESS).deposit{value: msg.value}();
        } else {
            IERC20(fromToken).safeTransferFrom(msg.sender, address(this), fromAmount);
        }
        IERC20(fromToken).safeApprove(address(wooPool), fromAmount);

        if (fromToken == quoteToken) {
            if (isToETH) {
                realToAmount = wooPool.sellQuote(
                    toToken,
                    fromAmount,
                    minToAmount,
                    address(this),
                    address(this),
                    rebateTo
                );
                IWETH(WETH_ADDRESS).withdraw(realToAmount);
                require(to != address(0), 'WooRouter: INVALID_TO_ADDRESS');
                to.transfer(realToAmount);
            } else {
                realToAmount = wooPool.sellQuote(toToken, fromAmount, minToAmount, address(this), to, rebateTo);
            }
        } else if (toToken == quoteToken) {
            realToAmount = wooPool.sellBase(fromToken, fromAmount, minToAmount, address(this), to, rebateTo);
        } else {
            uint256 quoteAmount = wooPool.sellBase(fromToken, fromAmount, 0, address(this), address(this), rebateTo);
            IERC20(quoteToken).safeApprove(address(wooPool), quoteAmount);
            if (isToETH) {
                realToAmount = wooPool.sellQuote(
                    toToken,
                    quoteAmount,
                    minToAmount,
                    address(this),
                    address(this),
                    rebateTo
                );
                IWETH(WETH_ADDRESS).withdraw(realToAmount);
                require(to != address(0), 'WooRouter: INVALID_TO_ADDRESS');
                to.transfer(realToAmount);
            } else {
                realToAmount = wooPool.sellQuote(toToken, quoteAmount, minToAmount, address(this), to, rebateTo);
            }
        }
        emit WooRouterSwap(
            SwapType.WooSwap,
            isFromETH ? ETH_PLACEHOLDER_ADDR : fromToken,
            isToETH ? ETH_PLACEHOLDER_ADDR : toToken,
            fromAmount,
            realToAmount,
            msg.sender,
            to
        );
    }

    function sellBase(
        address baseToken,
        uint256 baseAmount,
        uint256 minQuoteAmount,
        address to,
        address rebateTo
    ) external nonReentrant returns (uint256 realQuoteAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), baseAmount);
        IERC20(baseToken).safeApprove(address(wooPool), baseAmount);
        realQuoteAmount = wooPool.sellBase(baseToken, baseAmount, minQuoteAmount, address(this), to, rebateTo);
        emit WooRouterSwap(SwapType.WooSwap, baseToken, quoteToken, baseAmount, realQuoteAmount, msg.sender, to);
    }

    function sellQuote(
        address baseToken,
        uint256 quoteAmount,
        uint256 minBaseAmount,
        address to,
        address rebateTo
    ) external nonReentrant returns (uint256 realBaseAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        IERC20(quoteToken).safeTransferFrom(msg.sender, address(this), quoteAmount);
        IERC20(quoteToken).safeApprove(address(wooPool), quoteAmount);
        realBaseAmount = wooPool.sellQuote(baseToken, quoteAmount, minBaseAmount, address(this), to, rebateTo);
        emit WooRouterSwap(SwapType.WooSwap, quoteToken, baseToken, quoteAmount, realBaseAmount, msg.sender, to);
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
        require(approveTarget != address(0), 'WooRouter: approveTarget_ADDR_ZERO');
        require(swapTarget != address(0), 'WooRouter: swapTarget_ADDR_ZERO');
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        require(isWhitelisted[approveTarget], 'WooRouter: APPROVE_TARGET_NOT_ALLOWED');
        require(isWhitelisted[swapTarget], 'WooRouter: SWAP_TARGET_NOT_ALLOWED');

        uint256 preBalance = _generalBalanceOf(toToken, address(this));
        internalFallbackSwap(approveTarget, swapTarget, fromToken, fromAmount, data);
        uint256 postBalance = _generalBalanceOf(toToken, address(this));

        if (postBalance > preBalance) {
            _generalTransfer(toToken, to, postBalance.sub(preBalance));
        }

        emit WooRouterSwap(
            SwapType.DodoSwap,
            fromToken,
            toToken,
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
    ) private {
        require(isWhitelisted[approveTarget], 'WooRouter: APPROVE_TARGET_NOT_ALLOWED');
        require(isWhitelisted[swapTarget], 'WooRouter: SWAP_TARGET_NOT_ALLOWED');

        if (fromToken != ETH_PLACEHOLDER_ADDR) {
            IERC20(fromToken).safeTransferFrom(msg.sender, address(this), fromAmount);
            IERC20(fromToken).safeApprove(approveTarget, fromAmount);
        } else {
            require(fromAmount == msg.value, 'WooRouter: fromAmount_INVALID');
        }

        (bool success, ) = swapTarget.call{value: fromToken == ETH_PLACEHOLDER_ADDR ? fromAmount : 0}(data);
        require(success, 'WooRouter: FALLBACK_SWAP_FAILED');
    }

    function _generalTransfer(
        address token,
        address payable to,
        uint256 amount
    ) private {
        require(token != address(0), 'WooRouter: token_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        if (amount > 0) {
            if (token == ETH_PLACEHOLDER_ADDR) {
                to.transfer(amount);
            } else {
                IERC20(token).safeTransfer(to, amount);
            }
        }
    }

    function _generalBalanceOf(address token, address who) private view returns (uint256) {
        require(token != address(0), 'WooRouter: token_ADDR_ZERO');
        require(who != address(0), 'WooRouter: who_ADDR_ZERO');
        return token == ETH_PLACEHOLDER_ADDR ? who.balance : IERC20(token).balanceOf(who);
    }

    function setWhitelisted(address target, bool whitelisted) external nonReentrant onlyOwner {
        require(target != address(0), 'WooRouter: target_ADDR_ZERO');
        isWhitelisted[target] = whitelisted;
    }

    /* Misc functions */

    function rescueFunds(address token, uint256 amount) external nonReentrant onlyOwner {
        require(token != address(0), 'WooRouter: token_ADDR_ZERO');
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function destroy() external nonReentrant onlyOwner {
        selfdestruct(msg.sender);
    }

    /* Query functions */

    function querySwap(
        address fromToken,
        address toToken,
        uint256 fromAmount
    ) external view returns (uint256 toAmount) {
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        fromToken = (fromToken == ETH_PLACEHOLDER_ADDR) ? WETH_ADDRESS : fromToken;
        toToken = (toToken == ETH_PLACEHOLDER_ADDR) ? WETH_ADDRESS : toToken;
        if (fromToken == quoteToken) {
            toAmount = wooPool.querySellQuote(toToken, fromAmount);
        } else if (toToken == quoteToken) {
            toAmount = wooPool.querySellBase(fromToken, fromAmount);
        } else {
            uint256 quoteAmount = wooPool.querySellBase(fromToken, fromAmount);
            toAmount = wooPool.querySellQuote(toToken, quoteAmount);
        }
    }

    function querySellBase(address baseToken, uint256 baseAmount) external view returns (uint256 quoteAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        baseToken = (baseToken == ETH_PLACEHOLDER_ADDR) ? WETH_ADDRESS : baseToken;
        quoteAmount = wooPool.querySellBase(baseToken, baseAmount);
    }

    function querySellQuote(address baseToken, uint256 quoteAmount) external view returns (uint256 baseAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        baseToken = (baseToken == ETH_PLACEHOLDER_ADDR) ? WETH_ADDRESS : baseToken;
        baseAmount = wooPool.querySellQuote(baseToken, quoteAmount);
    }
}
