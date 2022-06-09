// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import './interfaces/IWooPP.sol';
import './interfaces/IWETH.sol';
import './interfaces/IWooRouter.sol';

import './interfaces/Stargate/IStargateRouter.sol';
import './interfaces/Stargate/IStargateReceiver.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

/// @title Woo Router implementation.
/// @notice Router for stateless execution of swaps against Woo private pool.
/// Ref links:
/// chain id: https://stargateprotocol.gitbook.io/stargate/developers/contract-addresses/mainnet
/// poold id: https://stargateprotocol.gitbook.io/stargate/developers/pool-ids
contract WooCrossChainRouter is IStargateReceiver, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20;

    event WooCrossSwapOnSrcChain(
        uint256 indexed refId,
        address indexed sender,
        address indexed to,
        address fromToken,
        uint256 fromAmount,
        uint256 minQuoteAmount,
        uint256 realQuoteAmount
    );

    event WooCrossSwapOnDstChain(
        uint256 indexed refId,
        address indexed sender,
        address indexed to,
        address bridgedToken,
        uint256 bridgedAmount,
        address toToken,
        address realToToken,
        uint256 minToAmount,
        uint256 realToAmount
    );

    address constant ETH_PLACEHOLDER_ADDR = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IStargateRouter public stargateRouter;
    IWooPP public wooPool;
    address public quoteToken;
    address public WETH;
    uint256 public bridgeSlippage; // 1 in 10000th: default 1%

    mapping(uint16 => address) public wooCrossRouters; // dstChainId => woo router
    mapping(uint16 => uint256) public quotePoolIds; // chainId => woofi_quote_token_pool_id

    receive() external payable {}

    function initialize(
        address _weth,
        address _wooPool,
        address _stargateRouter
    ) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        WETH = _weth;
        wooPool = IWooPP(_wooPool);
        quoteToken = wooPool.quoteToken();
        stargateRouter = IStargateRouter(_stargateRouter);

        bridgeSlippage = 100;

        // usdc: 1, usdt: 2, busd: 5
        quotePoolIds[1] = 1; // ethereum: usdc
        quotePoolIds[2] = 2; // BSC: usdt
        quotePoolIds[6] = 1; // Avalanche: usdc
        quotePoolIds[9] = 1; // Polygon: usdc
        quotePoolIds[10] = 1; // Arbitrum: usdc
        quotePoolIds[11] = 1; // Optimism: usdc
        quotePoolIds[12] = 1; // Fantom: usdc
    }

    /*
    https://stargateprotocol.gitbook.io/stargate/developers/contract-addresses/mainnet
        - Chain ID : Chain -
        1: Ether
        2: BSC (BNB Chain)
        6: Avalanche
        9: Polygon
        10: Arbitrum
        11: Optimism
        12: Fantom
    */
    function setWooCrossChainRouter(uint16 _chainId, address _wooCrossRouter) external onlyOwner {
        require(_wooCrossRouter != address(0), 'WooCrossChainRouter: !wooCrossRouter');
        wooCrossRouters[_chainId] = _wooCrossRouter;
    }

    function setStargateRouter(address _stargateRouter) external onlyOwner {
        require(_stargateRouter != address(0), 'WooCrossChainRouter: !stargateRouter');
        stargateRouter = IStargateRouter(_stargateRouter);
    }

    function setWooPool(address _wooPool) external onlyOwner {
        wooPool = IWooPP(_wooPool);
    }

    function setBridgeSlippage(uint256 _bridgeSlippage) external onlyOwner {
        require(_bridgeSlippage <= 10000, 'WooCrossChainRouter: !_bridgeSlippage');
        bridgeSlippage = _bridgeSlippage;
    }

    function setQuotePoolId(uint16 _chainId, uint256 _quotePoolId) external onlyOwner {
        quotePoolIds[_chainId] = _quotePoolId;
    }

    function crossSwap(
        uint256 refId_,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 srcMinQuoteAmount,
        uint256 dstMinToAmount,
        uint16 srcChainId,
        uint16 dstChainId,
        address payable to
    ) external payable {
        require(fromToken != address(0), 'WooCrossChainRouter: !fromToken');
        require(toToken != address(0), 'WooCrossChainRouter: !toToken');
        require(to != address(0), 'WooCrossChainRouter: !to');

        uint256 gasValue = msg.value;
        uint256 refId = refId_; // NOTE: to avoid stack too deep issue

        // Step 1: transfer
        {
            bool isFromETH = fromToken == ETH_PLACEHOLDER_ADDR;
            fromToken = isFromETH ? WETH : fromToken;
            if (isFromETH) {
                require(fromAmount <= msg.value, 'WooCrossChainRouter: !fromAmount');
                IWETH(WETH).deposit{value: fromAmount}();
                gasValue -= fromAmount;
            } else {
                TransferHelper.safeTransferFrom(fromToken, msg.sender, address(this), fromAmount);
            }
        }

        // Step 2: local transfer
        uint256 bridgeAmount;
        if (fromToken != quoteToken) {
            TransferHelper.safeApprove(fromToken, address(wooPool), fromAmount);
            bridgeAmount = wooPool.sellBase(fromToken, fromAmount, srcMinQuoteAmount, address(this), to);
        } else {
            bridgeAmount = fromAmount;
        }

        // Step 3: send to stargate
        require(bridgeAmount <= IERC20(quoteToken).balanceOf(address(this)), '!bridgeAmount');
        TransferHelper.safeApprove(quoteToken, address(stargateRouter), bridgeAmount);

        require(to != address(0), 'WooCrossChainRouter: to_ZERO_ADDR'); // NOTE: double check it
        {
            bytes memory payloadData;
            payloadData = abi.encode(
                toToken, // to token
                refId, // reference id
                dstMinToAmount, // minToAmount on destination chain
                to // to address
            );

            bytes memory dstWooCrossRouter = abi.encodePacked(wooCrossRouters[dstChainId]);
            uint256 minBridgeAmount = bridgeAmount.mul(uint256(10000).sub(bridgeSlippage)).div(10000);
            uint256 srcPoolId = quotePoolIds[srcChainId];
            uint256 dstPoolId = quotePoolIds[dstChainId];

            stargateRouter.swap{value: gasValue}(
                dstChainId,
                srcPoolId,
                dstPoolId,
                payable(msg.sender),
                bridgeAmount,
                minBridgeAmount,
                IStargateRouter.lzTxObj(600000, 0, '0x'), // 600000 is the max gas required for wooPP swap.
                dstWooCrossRouter,
                payloadData
            );
        }

        emit WooCrossSwapOnSrcChain(refId, msg.sender, to, fromToken, fromAmount, srcMinQuoteAmount, bridgeAmount);
    }

    function quoteLayerZeroFee(
        uint16 dstChainId,
        address toToken,
        uint256 refId,
        uint256 dstMinToAmount,
        address to
    ) external view returns (uint256, uint256) {
        bytes memory toAddress = abi.encodePacked(to);
        bytes memory payloadData = abi.encode(
            toToken, // to token
            refId, // reference id
            dstMinToAmount, // minToAmount on destination chain
            to // to address
        );
        return
            stargateRouter.quoteLayerZeroFee(
                dstChainId,
                1, // https://stargateprotocol.gitbook.io/stargate/developers/function-types
                toAddress,
                payloadData,
                IStargateRouter.lzTxObj(600000, 0, '0x')
            );
    }

    function sgReceive(
        uint16 _chainId,
        bytes memory _srcAddress,
        uint256 _nonce,
        address _token,
        uint256 amountLD,
        bytes memory payload
    ) external override {
        require(msg.sender == address(stargateRouter), 'WooCrossChainRouter: INVALID_CALLER');

        (address toToken, uint256 refId, uint256 minToAmount, address to) = abi.decode(
            payload,
            (address, uint256, uint256, address)
        );

        if (wooPool.quoteToken() != _token) {
            // NOTE: The bridged token is not WooPP's quote token.
            // So Cannot do the swap; just return it to users.
            TransferHelper.safeTransfer(_token, to, amountLD);
            emit WooCrossSwapOnDstChain(
                refId,
                msg.sender,
                to,
                _token,
                amountLD,
                toToken,
                _token,
                minToAmount,
                amountLD
            );
            return;
        }

        uint256 quoteAmount = amountLD;
        TransferHelper.safeApprove(_token, address(wooPool), quoteAmount);

        if (toToken == ETH_PLACEHOLDER_ADDR) {
            // quoteToken -> WETH -> ETH
            try wooPool.sellQuote(WETH, quoteAmount, minToAmount, address(this), to) returns (uint256 realToAmount) {
                IWETH(WETH).withdraw(realToAmount);
                TransferHelper.safeTransferETH(to, realToAmount);
                emit WooCrossSwapOnDstChain(
                    refId,
                    msg.sender,
                    to,
                    _token,
                    amountLD,
                    toToken,
                    ETH_PLACEHOLDER_ADDR,
                    minToAmount,
                    realToAmount
                );
            } catch {
                // transfer _token/amountLD to msg.sender because the swap failed for some reason.
                // this is not the ideal scenario, but the contract needs to deliver them eth or USDC.
                TransferHelper.safeTransfer(_token, to, amountLD);
                emit WooCrossSwapOnDstChain(
                    refId,
                    msg.sender,
                    to,
                    _token,
                    amountLD,
                    toToken,
                    _token,
                    minToAmount,
                    amountLD
                );
            }
        } else {
            if (_token == toToken) {
                // Stargate bridged token == toToken: NO swap is needed!
                TransferHelper.safeTransfer(toToken, to, amountLD);
                emit WooCrossSwapOnDstChain(
                    refId,
                    msg.sender,
                    to,
                    _token,
                    amountLD,
                    toToken,
                    toToken,
                    minToAmount,
                    amountLD
                );
            } else {
                // swap to the ERC20 token
                try wooPool.sellQuote(toToken, quoteAmount, minToAmount, to, to) returns (uint256 realToAmount) {
                    emit WooCrossSwapOnDstChain(
                        refId,
                        msg.sender,
                        to,
                        _token,
                        amountLD,
                        toToken,
                        toToken,
                        minToAmount,
                        realToAmount
                    );
                } catch {
                    TransferHelper.safeTransfer(_token, to, amountLD);
                    emit WooCrossSwapOnDstChain(
                        refId,
                        msg.sender,
                        to,
                        _token,
                        amountLD,
                        toToken,
                        _token,
                        minToAmount,
                        amountLD
                    );
                }
            }
        }
    }

    function inCaseTokensGetStuck(address stuckToken) external onlyOwner {
        uint256 amount = IERC20(stuckToken).balanceOf(address(this));
        if (amount > 0) {
            TransferHelper.safeTransfer(stuckToken, msg.sender, amount);
        }
    }

    function inCaseNativeTokensGetStuck() external onlyOwner {
        if (address(this).balance > 0) {
            TransferHelper.safeTransferETH(msg.sender, address(this).balance);
        }
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
