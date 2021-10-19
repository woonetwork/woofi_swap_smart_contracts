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
import './interfaces/IWooRouter.sol';

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

/// @title TODO
/// @notice TODO
contract WooRouter is IWooRouter, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ----- Constant variables ----- */

    // Erc20 placeholder address for native tokens (e.g. eth, bnb, matic, etc)
    address constant ETH_PLACEHOLDER_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /* ----- State variables ----- */

    // Wrapper for native tokens (e.g. eth, bnb, matic, etc)
    // BSC WBNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
    address public immutable override WETH;

    address public override quoteToken;
    mapping(address => bool) public isWhitelisted;
    IWooPP public wooPool;

    /* ----- Callback Function ----- */

    receive() external payable {
        // only accept ETH from WETH or whitelisted external swaps.
        assert(msg.sender == WETH || isWhitelisted[msg.sender]);
    }

    /* ----- External Function ----- */

    constructor(address weth, address newPool) public {
        require(weth != address(0), 'WooRouter: weth_ZERO_ADDR');
        WETH = weth;
        setPool(newPool);
    }

    /// @dev Query toToken amount
    /// @param fromToken TODO
    /// @param toToken TODO
    /// @param fromAmount fromToken amount that user want to send
    /// @return toAmount toToken amount that user will be receive
    function querySwap(
        address fromToken,
        address toToken,
        uint256 fromAmount
    ) external view override returns (uint256 toAmount) {
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        fromToken = (fromToken == ETH_PLACEHOLDER_ADDR) ? WETH : fromToken;
        toToken = (toToken == ETH_PLACEHOLDER_ADDR) ? WETH : toToken;
        if (fromToken == quoteToken) {
            toAmount = wooPool.querySellQuote(toToken, fromAmount);
        } else if (toToken == quoteToken) {
            toAmount = wooPool.querySellBase(fromToken, fromAmount);
        } else {
            uint256 quoteAmount = wooPool.querySellBase(fromToken, fromAmount);
            toAmount = wooPool.querySellQuote(toToken, quoteAmount);
        }
    }

    /// @dev Query quoteAmount when selling baseToken
    /// @param baseToken TODO
    /// @param baseAmount baseToken amount that user want to send
    /// @return quoteAmount quoteToken amount that user will be receive
    function querySellBase(address baseToken, uint256 baseAmount) external view override returns (uint256 quoteAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        baseToken = (baseToken == ETH_PLACEHOLDER_ADDR) ? WETH : baseToken;
        quoteAmount = wooPool.querySellBase(baseToken, baseAmount);
    }

    /// @dev Query baseAmount when selling quoteToken
    /// @param baseToken TODO
    /// @param quoteAmount quoteToken amount that user want to send
    /// @return baseAmount baseToken amount that user will be receive
    function querySellQuote(address baseToken, uint256 quoteAmount)
        external
        view
        override
        returns (uint256 baseAmount)
    {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        baseToken = (baseToken == ETH_PLACEHOLDER_ADDR) ? WETH : baseToken;
        baseAmount = wooPool.querySellQuote(baseToken, quoteAmount);
    }

    /// @dev TODO
    /// @param fromToken TODO
    /// @param toToken TODO
    /// @param fromAmount TODO
    /// @param minToAmount TODO
    /// @param to TODO
    /// @param rebateTo TODO
    /// @return realToAmount TODO
    function swap(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        address payable to,
        address rebateTo
    ) external payable override nonReentrant returns (uint256 realToAmount) {
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');

        bool isFromETH = fromToken == ETH_PLACEHOLDER_ADDR;
        bool isToETH = toToken == ETH_PLACEHOLDER_ADDR;
        fromToken = isFromETH ? WETH : fromToken;
        toToken = isToETH ? WETH : toToken;

        // Step 1: transfer the source tokens to WooRouter
        if (isFromETH) {
            require(fromAmount == msg.value, 'WooRouter: fromAmount_INVALID');
            IWETH(WETH).deposit{value: msg.value}();
        } else {
            TransferHelper.safeTransferFrom(fromToken, msg.sender, address(this), fromAmount);
        }

        // Step 2: swap and transfer
        TransferHelper.safeApprove(fromToken, address(wooPool), fromAmount);
        if (fromToken == quoteToken) {
            // case 1: quoteToken --> baseToken
            realToAmount = _sellQuoteAndTransfer(isToETH, toToken, fromAmount, minToAmount, to, rebateTo);
        } else if (toToken == quoteToken) {
            // case 2: fromToken --> quoteToken
            realToAmount = wooPool.sellBase(fromToken, fromAmount, minToAmount, address(this), to, rebateTo);
        } else {
            // case 3: fromToken --> quoteToken --> toToken
            uint256 quoteAmount = wooPool.sellBase(fromToken, fromAmount, 0, address(this), address(this), rebateTo);
            TransferHelper.safeApprove(quoteToken, address(wooPool), quoteAmount);
            realToAmount = _sellQuoteAndTransfer(isToETH, toToken, quoteAmount, minToAmount, to, rebateTo);
        }

        // Step 3: firing event
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

    /// @dev TODO
    /// @param baseToken TODO
    /// @param baseAmount TODO
    /// @param minQuoteAmount TODO
    /// @param to TODO
    /// @param rebateTo TODO
    /// @return realQuoteAmount TODO
    function sellBase(
        address baseToken,
        uint256 baseAmount,
        uint256 minQuoteAmount,
        address to,
        address rebateTo
    ) external override nonReentrant returns (uint256 realQuoteAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        TransferHelper.safeTransferFrom(baseToken, msg.sender, address(this), baseAmount);
        TransferHelper.safeApprove(baseToken, address(wooPool), baseAmount);
        realQuoteAmount = wooPool.sellBase(baseToken, baseAmount, minQuoteAmount, address(this), to, rebateTo);
        emit WooRouterSwap(SwapType.WooSwap, baseToken, quoteToken, baseAmount, realQuoteAmount, msg.sender, to);
    }

    /// @dev TODO
    /// @param baseToken TODO
    /// @param quoteAmount TODO
    /// @param minBaseAmount TODO
    /// @param to TODO
    /// @param rebateTo TODO
    /// @return realBaseAmount TODO
    function sellQuote(
        address baseToken,
        uint256 quoteAmount,
        uint256 minBaseAmount,
        address to,
        address rebateTo
    ) external override nonReentrant returns (uint256 realBaseAmount) {
        require(baseToken != address(0), 'WooRouter: baseToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        TransferHelper.safeTransferFrom(quoteToken, msg.sender, address(this), quoteAmount);
        TransferHelper.safeApprove(quoteToken, address(wooPool), quoteAmount);
        realBaseAmount = wooPool.sellQuote(baseToken, quoteAmount, minBaseAmount, address(this), to, rebateTo);
        emit WooRouterSwap(SwapType.WooSwap, quoteToken, baseToken, quoteAmount, realBaseAmount, msg.sender, to);
    }

    /// @dev swap by DODO
    /// @param approveTarget address that need to approve
    /// @param swapTarget dodo proxy address
    /// @param fromToken TODO
    /// @param toToken TODO
    /// @param fromAmount TODO
    /// @param to TODO
    /// @param data calldata which for swap by dodo
    function externalSwap(
        address approveTarget,
        address swapTarget,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        address payable to,
        bytes calldata data
    ) external payable override nonReentrant {
        require(approveTarget != address(0), 'WooRouter: approveTarget_ADDR_ZERO');
        require(swapTarget != address(0), 'WooRouter: swapTarget_ADDR_ZERO');
        require(fromToken != address(0), 'WooRouter: fromToken_ADDR_ZERO');
        require(toToken != address(0), 'WooRouter: toToken_ADDR_ZERO');
        require(to != address(0), 'WooRouter: to_ADDR_ZERO');
        require(isWhitelisted[approveTarget], 'WooRouter: APPROVE_TARGET_NOT_ALLOWED');
        require(isWhitelisted[swapTarget], 'WooRouter: SWAP_TARGET_NOT_ALLOWED');

        uint256 preBalance = _generalBalanceOf(toToken, address(this));
        _internalFallbackSwap(approveTarget, swapTarget, fromToken, fromAmount, data);
        uint256 postBalance = _generalBalanceOf(toToken, address(this));

        require(preBalance <= postBalance, 'WooRouter: balance_ERROR');
        uint256 swapBalance = postBalance.sub(preBalance);
        if (postBalance > preBalance) {
            _generalTransfer(toToken, to, swapBalance);
        }

        emit WooRouterSwap(SwapType.DodoSwap, fromToken, toToken, fromAmount, swapBalance, msg.sender, to);
    }

    /* ----- Admin functions ----- */

    /// @dev Get funds when stuck happen
    /// @param token token address
    /// @param amount amount of token need to get
    function rescueFunds(address token, uint256 amount) external nonReentrant onlyOwner {
        require(token != address(0), 'WooRouter: token_ADDR_ZERO');
        TransferHelper.safeTransfer(token, msg.sender, amount);
    }

    /// @dev Set wooPool from newPool
    /// @param newPool Wooracle address
    function setPool(address newPool) public nonReentrant onlyOwner {
        require(newPool != address(0), 'WooRouter: newPool_ADDR_ZERO');
        wooPool = IWooPP(newPool);
        quoteToken = wooPool.quoteToken();
        require(quoteToken != address(0), 'WooRouter: quoteToken_ADDR_ZERO');
        emit WooPoolChanged(newPool);
    }

    /// @dev Add target address into whitelist
    /// @param target address that approved by WooRouter
    /// @param whitelisted approve to using WooRouter or not
    function setWhitelisted(address target, bool whitelisted) external nonReentrant onlyOwner {
        require(target != address(0), 'WooRouter: target_ADDR_ZERO');
        isWhitelisted[target] = whitelisted;
    }

    /* ----- Private Function ----- */

    function _sellQuoteAndTransfer(
        bool isToETH,
        address toToken,
        uint256 quoteAmount,
        uint256 minToAmount,
        address payable to,
        address rebateTo
    ) private returns (uint256 realToAmount) {
        if (isToETH) {
            realToAmount = wooPool.sellQuote(toToken, quoteAmount, minToAmount, address(this), address(this), rebateTo);
            IWETH(WETH).withdraw(realToAmount);
            require(to != address(0), 'WooRouter: to_ZERO_ADDR');
            TransferHelper.safeTransferETH(to, realToAmount);
        } else {
            realToAmount = wooPool.sellQuote(toToken, quoteAmount, minToAmount, address(this), to, rebateTo);
        }
    }

    function _internalFallbackSwap(
        address approveTarget,
        address swapTarget,
        address fromToken,
        uint256 fromAmount,
        bytes calldata data
    ) private {
        require(isWhitelisted[approveTarget], 'WooRouter: APPROVE_TARGET_NOT_ALLOWED');
        require(isWhitelisted[swapTarget], 'WooRouter: SWAP_TARGET_NOT_ALLOWED');

        if (fromToken != ETH_PLACEHOLDER_ADDR) {
            TransferHelper.safeTransferFrom(fromToken, msg.sender, address(this), fromAmount);
            TransferHelper.safeApprove(fromToken, approveTarget, fromAmount);
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
        if (amount > 0) {
            if (token == ETH_PLACEHOLDER_ADDR) {
                TransferHelper.safeTransferETH(to, amount);
            } else {
                TransferHelper.safeTransfer(token, to, amount);
            }
        }
    }

    function _generalBalanceOf(address token, address who) private view returns (uint256) {
        return token == ETH_PLACEHOLDER_ADDR ? who.balance : IERC20(token).balanceOf(who);
    }
}
