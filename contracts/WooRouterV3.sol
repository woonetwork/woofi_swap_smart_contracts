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
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import './interfaces/IWooPP.sol';
import './interfaces/IWETH.sol';
import './interfaces/IWooRouterV2.sol';

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

/// @title Woo Router V3 implementation.
/// @notice Router for stateless execution of swaps against Woo private pool.
contract WooRouterV3 is IWooRouterV2, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ----- Constant variables ----- */

    // Erc20 placeholder address for native tokens (e.g. eth, bnb, matic, etc)
    address constant ETH_PLACEHOLDER_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /* ----- State variables ----- */

    // Wrapper for native tokens (e.g. eth, bnb, matic, etc)
    // BSC WBNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
    address public immutable override WETH;

    IWooPP public override wooPool;

    mapping(address => bool) public isWhitelisted;

    address public quoteToken;

    /* ----- Callback Function ----- */

    receive() external payable {
        // only accept ETH from WETH or whitelisted external swaps.
        assert(msg.sender == WETH || isWhitelisted[msg.sender]);
    }

    /* ----- Query & swap APIs ----- */

    constructor(address _weth, address _pool) public {
        require(_weth != address(0), 'WooRouter: weth_ZERO_ADDR');
        WETH = _weth;
        setPool(_pool);
    }

    /// @inheritdoc IWooRouterV2
    function querySwap(
        address fromToken,
        address toToken,
        uint256 fromAmount
    ) external view override returns (uint256 toAmount) {
        require(fromToken != address(0), 'WooRouter: !fromToken');
        require(toToken != address(0), 'WooRouter: !toToken');
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

    /// @inheritdoc IWooRouterV2
    function swap(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        address payable to,
        address rebateTo
    ) external payable override nonReentrant returns (uint256 realToAmount) {
        require(fromToken != address(0), 'WooRouter: !fromToken');
        require(toToken != address(0), 'WooRouter: !toToken');
        require(to != address(0), 'WooRouter: !to');

        bool isFromETH = fromToken == ETH_PLACEHOLDER_ADDR;
        bool isToETH = toToken == ETH_PLACEHOLDER_ADDR;
        fromToken = isFromETH ? WETH : fromToken;
        toToken = isToETH ? WETH : toToken;

        // Step 1: transfer the source tokens to WooRouter
        if (isFromETH) {
            require(fromAmount <= msg.value, 'WooRouter: fromAmount_INVALID');
            IWETH(WETH).deposit{value: msg.value}();
            TransferHelper.safeTransfer(WETH, address(wooPool), fromAmount);
        } else {
            TransferHelper.safeTransferFrom(fromToken, msg.sender, address(wooPool), fromAmount);
        }

        // Step 2: swap and transfer
        if (fromToken == quoteToken) {
            // case 1: quoteToken --> baseToken
            realToAmount = _sellQuoteAndTransfer(isToETH, toToken, fromAmount, minToAmount, to, rebateTo);
        } else if (toToken == quoteToken) {
            // case 2: fromToken --> quoteToken
            realToAmount = wooPool.sellBase(fromToken, fromAmount, minToAmount, to, rebateTo);
        } else {
            // case 3: fromToken --> quoteToken --> toToken
            uint256 quoteAmount = wooPool.sellBase(fromToken, fromAmount, 0, address(wooPool), rebateTo);
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
            to,
            rebateTo
        );
    }

    /// @inheritdoc IWooRouterV2
    function externalSwap(
        address approveTarget,
        address swapTarget,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        address payable to,
        bytes calldata data
    ) public payable override nonReentrant returns (uint256 realToAmount) {
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
        realToAmount = postBalance.sub(preBalance);
        require(realToAmount >= minToAmount && realToAmount > 0, 'WooRouter: realToAmount_NOT_ENOUGH');
        _generalTransfer(toToken, to, realToAmount);

        emit WooRouterSwap(SwapType.DodoSwap, fromToken, toToken, fromAmount, realToAmount, msg.sender, to, address(0));
    }

    /* ----- Admin functions ----- */

    /// @dev Rescue the specified funds when stuck happen
    /// @param stuckToken the stuck token address
    function inCaseTokenGotStuck(address stuckToken) external onlyOwner {
        if (stuckToken == ETH_PLACEHOLDER_ADDR) {
            TransferHelper.safeTransferETH(msg.sender, address(this).balance);
        } else {
            uint256 amount = IERC20(stuckToken).balanceOf(address(this));
            TransferHelper.safeTransfer(stuckToken, msg.sender, amount);
        }
    }

    /// @dev Set wooPool from newPool
    /// @param newPool Wooracle address
    function setPool(address newPool) public onlyOwner {
        wooPool = IWooPP(newPool);
        quoteToken = wooPool.quoteToken();
        require(quoteToken != address(0), 'WooRouter: quoteToken_ADDR_ZERO');
        emit WooPoolChanged(newPool);
    }

    /// @dev Add target address into whitelist
    /// @param target address that approved by WooRouter
    /// @param whitelisted approve to using WooRouter or not
    function setWhitelisted(address target, bool whitelisted) external onlyOwner {
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
            realToAmount = wooPool.sellQuote(toToken, quoteAmount, minToAmount, address(this), rebateTo);
            IWETH(WETH).withdraw(realToAmount);
            TransferHelper.safeTransferETH(to, realToAmount);
        } else {
            realToAmount = wooPool.sellQuote(toToken, quoteAmount, minToAmount, to, rebateTo);
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
            require(fromAmount <= msg.value, 'WooRouter: fromAmount_INVALID');
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
