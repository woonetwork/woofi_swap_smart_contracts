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

import './libraries/InitializableOwnable.sol';
import './libraries/DecimalMath.sol';
import './interfaces/IWooracle.sol';
import './interfaces/IWooPP.sol';
import './interfaces/IRewardManager.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';

contract WooPP is InitializableOwnable, ReentrancyGuard, IWooPP {
    using SafeMath for uint256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    event StrategistUpdated(address indexed strategist, bool flag);
    event RewardManagerUpdated(address indexed newRewardManager);
    event PriceOracleUpdated(address indexed newPriceOracle);
    event ChainlinkRefOracleUpdated(address indexed token, address indexed newChainlinkRefOracle);
    event ParametersUpdated(address indexed baseToken, uint256 newThreshold, uint256 newLpFeeRate, uint256 newR);
    event Withdraw(address indexed token, address indexed to, uint256 amount);
    event WooSwap(
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 toAmount,
        address from,
        address indexed to
    );

    mapping(address => bool) public isStrategist;

    modifier onlyStrategist() {
        require(msg.sender == _OWNER_ || isStrategist[msg.sender], 'WooPP: NOT_STRATEGIST');
        _;
    }

    // ============ Core Address ============

    address public override immutable quoteToken;

    // ============ Variables for Pricing ============

    struct TokenInfo {
        uint112 reserve;
        uint112 threshold;
        uint112 target;
        uint96 refPriceFixCoeff;
        uint64 lpFeeRate;
        uint64 R;
        uint32 lastResetTimestamp;
        bool isValid;
        address chainlinkRefOracle; // Reference
    }

    address public priceOracle; // WooOracle
    mapping(address => TokenInfo) public tokenInfo;

    string public pairsInfo; // e.g. BNB/ETH/BTCB/WOO-USDT  (only one single quoteToken supported)

    address public rewardManager;

    constructor(
        address newQuoteToken,
        address newPriceOracle,
        address quoteChainlinkRefOracle
    ) public {
        require(newQuoteToken != address(0), 'WooPP: INVALID_QUOTE');
        require(newPriceOracle != address(0), 'WooPP: INVALID_ORACLE');

        initOwner(msg.sender);
        quoteToken = newQuoteToken;
        priceOracle = newPriceOracle;

        TokenInfo storage quoteInfo = tokenInfo[newQuoteToken];
        quoteInfo.isValid = true;
        quoteInfo.chainlinkRefOracle = quoteChainlinkRefOracle;
        // About decimals:
        // For a sell base trade, we have quoteSize = baseSize * price
        // For calculation convenience, the decimals of price is 18-base.decimals()+quote.decimals()
        // If we have price = basePrice / quotePrice, then decimals of tokenPrice should be 36-token.decimals()
        // We use chainlink oracle price as token reference price, which decimals is chainlinkPrice.decimals()
        // We should multiply it by 1e(36-token.decimals()+chainlinkPrice.decimals()), which is refPriceFixCoeff
        if (quoteChainlinkRefOracle != address(0)) {
            // TODO: (@qinchao) should use ERC20Detailed or IERC20 ?
            uint256 decimalsToFix = uint256(ERC20(newQuoteToken).decimals()).add(
                uint256(AggregatorV3Interface(quoteChainlinkRefOracle).decimals())
            );
            uint256 refPriceFixCoeff = 10**(uint256(36).sub(decimalsToFix));
            require(refPriceFixCoeff <= type(uint96).max);
            quoteInfo.refPriceFixCoeff = uint96(refPriceFixCoeff);
        }

        emit ChainlinkRefOracleUpdated(newQuoteToken, quoteChainlinkRefOracle);
    }

    function setPairsInfo(string calldata newPairsInfo) external nonReentrant onlyStrategist {
        pairsInfo = newPairsInfo;
    }

    function sellBase(
        address baseToken,
        uint256 baseAmount,
        uint256 minQuoteAmount,
        address from,
        address to,
        address rebateTo
    ) external override nonReentrant returns (uint256 realQuoteAmount) {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        _autoUpdate(baseToken, baseInfo, quoteInfo);

        realQuoteAmount = getQuoteAmountSellBase(baseToken, baseAmount, baseInfo, quoteInfo);
        uint256 lpFee = realQuoteAmount.mulCeil(baseInfo.lpFeeRate);
        realQuoteAmount = realQuoteAmount.sub(lpFee);

        require(realQuoteAmount >= minQuoteAmount, 'WooPP: PRICE_EXCEEDS_LIMIT');
        IERC20(baseToken).safeTransferFrom(from, address(this), baseAmount);
        IERC20(quoteToken).safeTransfer(to, realQuoteAmount);
        if (rewardManager != address(0)) {
            IRewardManager(rewardManager).addReward(rebateTo, lpFee);
        }

        tokenInfo[baseToken] = baseInfo;
        tokenInfo[quoteToken] = quoteInfo;

        emit WooSwap(baseToken, quoteToken, baseAmount, realQuoteAmount, from, to);
    }

    function sellQuote(
        address baseToken,
        uint256 quoteAmount,
        uint256 minBaseAmount,
        address from,
        address to,
        address rebateTo
    ) external override nonReentrant returns (uint256 realBaseAmount) {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        _autoUpdate(baseToken, baseInfo, quoteInfo);

        uint256 lpFee = quoteAmount.mulCeil(baseInfo.lpFeeRate);
        quoteAmount = quoteAmount.sub(lpFee);
        realBaseAmount = getBaseAmountSellQuote(baseToken, quoteAmount, baseInfo, quoteInfo);

        require(realBaseAmount >= minBaseAmount, 'WooPP: PRICE_EXCEEDS_LIMIT');
        IERC20(quoteToken).safeTransferFrom(from, address(this), quoteAmount.add(lpFee));
        IERC20(baseToken).safeTransfer(to, realBaseAmount);
        if (rewardManager != address(0)) {
            IRewardManager(rewardManager).addReward(rebateTo, lpFee);
        }

        tokenInfo[baseToken] = baseInfo;
        tokenInfo[quoteToken] = quoteInfo;

        emit WooSwap(quoteToken, baseToken, quoteAmount, realBaseAmount, from, to);
    }

    function querySellBase(address baseToken, uint256 baseAmount) external view override returns (uint256 quoteAmount) {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        _autoUpdate(baseToken, baseInfo, quoteInfo);

        quoteAmount = getQuoteAmountSellBase(baseToken, baseAmount, baseInfo, quoteInfo);
        uint256 lpFee = quoteAmount.mulCeil(baseInfo.lpFeeRate);
        quoteAmount = quoteAmount.sub(lpFee);

        require(quoteAmount <= IERC20(quoteToken).balanceOf(address(this)));
    }

    function querySellQuote(address baseToken, uint256 quoteAmount)
        external
        view
        override
        returns (uint256 baseAmount)
    {
        TokenInfo memory baseInfo = tokenInfo[baseToken];
        require(baseInfo.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        TokenInfo memory quoteInfo = tokenInfo[quoteToken];
        _autoUpdate(baseToken, baseInfo, quoteInfo);

        uint256 lpFee = quoteAmount.mulCeil(baseInfo.lpFeeRate);
        quoteAmount = quoteAmount.sub(lpFee);
        baseAmount = getBaseAmountSellQuote(baseToken, quoteAmount, baseInfo, quoteInfo);

        require(baseAmount <= IERC20(baseToken).balanceOf(address(this)));
    }

    function poolSize(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function setPriceOracle(address newPriceOracle) external nonReentrant onlyStrategist {
        require(newPriceOracle != address(0), 'WooPP: INVALID_ORACLE');
        priceOracle = newPriceOracle;
        emit PriceOracleUpdated(newPriceOracle);
    }

    function setChainlinkRefOracle(address token, address newChainlinkRefOracle) external nonReentrant onlyStrategist {
        TokenInfo storage info = tokenInfo[token];
        require(info.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');
        info.chainlinkRefOracle = newChainlinkRefOracle;
        if (newChainlinkRefOracle != address(0)) {
            // TODO: (@qinchao) should use ERC20Detailed or IERC20 ?
            uint256 decimalsToFix = uint256(ERC20(token).decimals()).add(
                uint256(AggregatorV3Interface(newChainlinkRefOracle).decimals())
            );
            uint256 refPriceFixCoeff = 10**(uint256(36).sub(decimalsToFix));
            require(refPriceFixCoeff <= type(uint96).max);
            info.refPriceFixCoeff = uint96(refPriceFixCoeff);
        }
        emit ChainlinkRefOracleUpdated(token, newChainlinkRefOracle);
    }

    function setRewardManager(address newRewardManager) external nonReentrant onlyStrategist {
        rewardManager = newRewardManager;
        emit RewardManagerUpdated(newRewardManager);
    }

    function addBaseToken(
        address baseToken,
        uint256 threshold,
        uint256 lpFeeRate,
        uint256 R,
        address chainlinkRefOracle
    ) external nonReentrant onlyStrategist {
        require(baseToken != address(0), 'WooPP: BASE_TOKEN_ZERO_ADDR');
        require(baseToken != quoteToken, 'WooPP: BASE_TOKEN_INVALID');
        require(threshold <= type(uint112).max, 'WooPP: THRESHOLD_OUT_OF_RANGE');
        require(lpFeeRate <= 1e18, 'WooPP: LP_FEE_RATE_OUT_OF_RANGE');
        require(R <= 1e18, 'WooPP: R_OUT_OF_RANGE');

        TokenInfo memory info = tokenInfo[baseToken];
        require(!info.isValid, 'WooPP: TOKEN_ALREADY_EXISTS');

        // TODO(@qinchao): update info.reserve and lastResetTimestamp ?
        info.threshold = uint112(threshold);
        info.lpFeeRate = uint64(lpFeeRate);
        info.R = uint64(R);
        info.target = max(info.threshold, info.target);
        info.isValid = true;
        info.chainlinkRefOracle = chainlinkRefOracle;
        if (chainlinkRefOracle != address(0)) {
            // TODO: (@qinchao) should use ERC20Detailed or IERC20 ?
            uint256 decimalsToFix = uint256(ERC20(baseToken).decimals()).add(
                uint256(AggregatorV3Interface(chainlinkRefOracle).decimals())
            );
            uint256 refPriceFixCoeff = 10**(uint256(36).sub(decimalsToFix));
            require(refPriceFixCoeff <= type(uint96).max);
            info.refPriceFixCoeff = uint96(refPriceFixCoeff);
        }

        tokenInfo[baseToken] = info;
        emit ParametersUpdated(baseToken, threshold, lpFeeRate, R);
        emit ChainlinkRefOracleUpdated(baseToken, chainlinkRefOracle);
    }

    function removeBaseToken(address baseToken) external nonReentrant onlyStrategist {
        require(baseToken != address(0), 'WooPP: BASE_TOKEN_ZERO_ADDR');
        TokenInfo memory info = tokenInfo[baseToken];
        require(info.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');

        info.reserve = 0;
        info.threshold = 0;
        info.lastResetTimestamp = 0;
        info.lpFeeRate = 0;
        info.R = 0;
        info.target = 0;
        info.isValid = false;
        info.chainlinkRefOracle = address(0);
        info.refPriceFixCoeff = 0;

        tokenInfo[baseToken] = info;
        emit ParametersUpdated(baseToken, 0, 0, 0);
        emit ChainlinkRefOracleUpdated(baseToken, address(0));
    }

    function tuneParameters(
        address baseToken,
        uint256 newThreshold,
        uint256 newLpFeeRate,
        uint256 newR
    ) external nonReentrant onlyStrategist {
        require(baseToken != address(0), 'WooPP: BASE_TOKEN_ZERO_ADDR');
        require(newThreshold <= type(uint112).max, 'WooPP: THRESHOLD_OUT_OF_RANGE');
        require(newLpFeeRate <= 1e18, 'WooPP: LP_FEE_RATE_OUT_OF_RANGE');
        require(newR <= 1e18, 'WooPP: R_OUT_OF_RANGE');

        TokenInfo memory info = tokenInfo[baseToken];
        require(info.isValid, 'WooPP: TOKEN_DOES_NOT_EXIST');

        info.threshold = uint112(newThreshold);
        info.lpFeeRate = uint64(newLpFeeRate);
        info.R = uint64(newR);
        info.target = max(info.threshold, info.target);

        tokenInfo[baseToken] = info;
        emit ParametersUpdated(baseToken, newThreshold, newLpFeeRate, newR);
    }

    // ========== Administrative functions ==========

    function setStrategist(address strategist, bool flag) external nonReentrant onlyOwner {
        require(strategist != address(0), 'WooPP: strategist_ZERO_ADDR');
        isStrategist[strategist] = flag;
        emit StrategistUpdated(strategist, flag);
    }

    function withdraw(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant onlyOwner {
        require(token != address(0), 'WooPP: token_ZERO_ADDR');
        require(to != address(0), 'WooPP: to_ZERO_ADDR');
        IERC20(token).safeTransfer(to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawToOwner(address token, uint256 amount) external nonReentrant onlyStrategist {
        require(token != address(0), 'WooPP: token_ZERO_ADDR');
        IERC20(token).safeTransfer(_OWNER_, amount);
        emit Withdraw(token, _OWNER_, amount);
    }

    // ========== Private functions ========== //

    function _ensurePriceReliable(
        uint256 p,
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo
    ) private view {
        // check Chainlink
        if (baseInfo.chainlinkRefOracle != address(0) && quoteInfo.chainlinkRefOracle != address(0)) {
            (, int256 rawBaseRefPrice, , , ) = AggregatorV3Interface(baseInfo.chainlinkRefOracle).latestRoundData();
            require(rawBaseRefPrice >= 0, 'WooPP: INVALID_CHAINLINK_PRICE');
            (, int256 rawQuoteRefPrice, , , ) = AggregatorV3Interface(quoteInfo.chainlinkRefOracle).latestRoundData();
            require(rawQuoteRefPrice >= 0, 'WooPP: INVALID_CHAINLINK_QUOTE_PRICE');
            uint256 baseRefPrice = uint256(rawBaseRefPrice).mul(uint256(baseInfo.refPriceFixCoeff));
            uint256 quoteRefPrice = uint256(rawQuoteRefPrice).mul(uint256(quoteInfo.refPriceFixCoeff));
            uint256 refPrice = baseRefPrice.divFloor(quoteRefPrice);
            require(
                refPrice.mulFloor(1e18 - 1e16) <= p && p <= refPrice.mulCeil(1e18 + 1e16),
                'WooPP: PRICE_UNRELIABLE'
            );
        }
    }

    function _autoUpdate(
        address baseToken,
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo
    ) private view {
        require(baseToken != address(0), 'WooPP: BASETOKEN_ZERO_ADDR');
        uint256 baseReserve = IERC20(baseToken).balanceOf(address(this));
        uint256 quoteReserve = IERC20(quoteToken).balanceOf(address(this));
        require(baseReserve <= type(uint112).max);
        require(quoteReserve <= type(uint112).max);
        baseInfo.reserve = uint112(baseReserve);
        quoteInfo.reserve = uint112(quoteReserve);
        uint32 priceTimestamp = uint32(IWooracle(priceOracle).timestamp() % 2**32);
        if (priceTimestamp != baseInfo.lastResetTimestamp) {
            baseInfo.target = max(baseInfo.threshold, baseInfo.reserve);
            baseInfo.lastResetTimestamp = priceTimestamp;
        }
        if (priceTimestamp != quoteInfo.lastResetTimestamp) {
            quoteInfo.target = max(quoteInfo.threshold, quoteInfo.reserve);
            quoteInfo.lastResetTimestamp = priceTimestamp;
        }
    }

    // When baseSold >= 0 , users sold the base token
    function getQuoteAmountLowQuoteSide(
        uint256 p,
        uint256 k,
        uint256 r,
        uint256 baseAmount
    ) private pure returns (uint256) {
        // priceFactor = 1 + k * baseAmount * p * r;
        uint256 priceFactor = DecimalMath.ONE.add(k.mulCeil(baseAmount).mulCeil(p).mulCeil(r));
        // return baseAmount * p / priceFactor;
        return DecimalMath.divFloor(baseAmount.mulFloor(p), priceFactor); // round down
    }

    // When baseSold >= 0
    function getBaseAmountLowQuoteSide(
        uint256 p,
        uint256 k,
        uint256 r,
        uint256 quoteAmount
    ) private pure returns (uint256) {
        // priceFactor = (1 - k * quoteAmount * r);
        uint256 priceFactor = DecimalMath.ONE.sub(k.mulFloor(quoteAmount).mulFloor(r));
        // return quoteAmount * p^{-1} / priceFactor;
        return DecimalMath.divFloor(DecimalMath.divFloor(quoteAmount, p), priceFactor); // round down
    }

    // When quoteSold >= 0
    function getBaseAmountLowBaseSide(
        uint256 p,
        uint256 k,
        uint256 r,
        uint256 quoteAmount
    ) private pure returns (uint256) {
        // priceFactor = 1 + k * quoteAmount * r;
        uint256 priceFactor = DecimalMath.ONE.add(k.mulCeil(quoteAmount).mulCeil(r));
        // return quoteAmount * p^{-1} / priceFactor;
        return DecimalMath.divFloor(DecimalMath.divFloor(quoteAmount, p), priceFactor); // round down
    }

    // When quoteSold >= 0
    function getQuoteAmountLowBaseSide(
        uint256 p,
        uint256 k,
        uint256 r,
        uint256 baseAmount
    ) private pure returns (uint256) {
        // priceFactor = 1 - k * baseAmount * p * r;
        uint256 priceFactor = DecimalMath.ONE.sub(k.mulFloor(baseAmount).mulFloor(p).mulFloor(r));
        // return baseAmount * p / priceFactor;
        return DecimalMath.divFloor(baseAmount.mulFloor(p), priceFactor); // round down
    }

    function getBoughtAmount(
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo,
        uint256 p,
        uint256 k,
        bool isSellBase
    ) private pure returns (uint256 baseBought, uint256 quoteBought) {
        uint256 baseSold = 0;
        if (baseInfo.reserve < baseInfo.target) baseBought = uint256(baseInfo.target).sub(uint256(baseInfo.reserve));
        else baseSold = uint256(baseInfo.reserve).sub(uint256(baseInfo.target));
        uint256 quoteSold = 0;
        if (quoteInfo.reserve < quoteInfo.target)
            quoteBought = uint256(quoteInfo.target).sub(uint256(quoteInfo.reserve));
        else quoteSold = uint256(quoteInfo.reserve).sub(uint256(quoteInfo.target));

        if (baseSold.mulCeil(p) > quoteSold) {
            baseSold = baseSold.sub(DecimalMath.divFloor(quoteSold, p));
            quoteSold = 0;
        } else {
            quoteSold = quoteSold.sub(baseSold.mulCeil(p));
            baseSold = 0;
        }

        uint256 virtualBaseBought = getBaseAmountLowBaseSide(p, k, DecimalMath.ONE, quoteSold);
        if (isSellBase == (virtualBaseBought < baseBought)) baseBought = virtualBaseBought;
        uint256 virtualQuoteBought = getQuoteAmountLowQuoteSide(p, k, DecimalMath.ONE, baseSold);
        if (isSellBase == (virtualQuoteBought > quoteBought)) quoteBought = virtualQuoteBought;
    }

    function getQuoteAmountSellBase(
        address baseToken,
        uint256 baseAmount,
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo
    ) private view returns (uint256 quoteAmount) {
        uint256 p;
        uint256 s;
        uint256 k;
        bool isFeasible;
        (p, s, k, isFeasible) = IWooracle(priceOracle).getState(baseToken);
        require(isFeasible, 'WooPP: ORACLE_PRICE_NOT_FEASIBLE');

        _ensurePriceReliable(p, baseInfo, quoteInfo);
        p = p.mulFloor(DecimalMath.ONE.sub(DecimalMath.divCeil(s, DecimalMath.TWO)));

        uint256 baseBought;
        uint256 quoteBought;
        (baseBought, quoteBought) = getBoughtAmount(baseInfo, quoteInfo, p, k, true);

        if (baseBought > 0) {
            uint256 quoteSold = getQuoteAmountLowBaseSide(p, k, baseInfo.R, baseBought);
            if (baseAmount > baseBought) {
                uint256 newBaseSold = baseAmount.sub(baseBought);
                quoteAmount = quoteSold.add(getQuoteAmountLowQuoteSide(p, k, DecimalMath.ONE, newBaseSold));
            } else {
                uint256 newBaseBought = baseBought.sub(baseAmount);
                quoteAmount = quoteSold.sub(getQuoteAmountLowBaseSide(p, k, baseInfo.R, newBaseBought));
            }
        } else {
            uint256 baseSold = getBaseAmountLowQuoteSide(p, k, DecimalMath.ONE, quoteBought);
            uint256 newBaseSold = baseAmount.add(baseSold);
            uint256 newQuoteBought = getQuoteAmountLowQuoteSide(p, k, DecimalMath.ONE, newBaseSold);
            if (newQuoteBought > quoteBought) {
                quoteAmount = newQuoteBought.sub(quoteBought);
            }
        }
    }

    function getBaseAmountSellQuote(
        address baseToken,
        uint256 quoteAmount,
        TokenInfo memory baseInfo,
        TokenInfo memory quoteInfo
    ) private view returns (uint256 baseAmount) {
        uint256 p;
        uint256 s;
        uint256 k;
        bool isFeasible;
        (p, s, k, isFeasible) = IWooracle(priceOracle).getState(baseToken);
        require(isFeasible, 'WooPP: ORACLE_PRICE_NOT_FEASIBLE');

        _ensurePriceReliable(p, baseInfo, quoteInfo);
        p = p.mulCeil(DecimalMath.ONE.add(DecimalMath.divCeil(s, DecimalMath.TWO)));

        uint256 baseBought;
        uint256 quoteBought;
        (baseBought, quoteBought) = getBoughtAmount(baseInfo, quoteInfo, p, k, false);

        if (quoteBought > 0) {
            uint256 baseSold = getBaseAmountLowQuoteSide(p, k, baseInfo.R, quoteBought);
            if (quoteAmount > quoteBought) {
                uint256 newQuoteSold = quoteAmount.sub(quoteBought);
                baseAmount = baseSold.add(getBaseAmountLowBaseSide(p, k, DecimalMath.ONE, newQuoteSold));
            } else {
                uint256 newQuoteBought = quoteBought.sub(quoteAmount);
                baseAmount = baseSold.sub(getBaseAmountLowQuoteSide(p, k, baseInfo.R, newQuoteBought));
            }
        } else {
            uint256 quoteSold = getQuoteAmountLowBaseSide(p, k, DecimalMath.ONE, baseBought);
            uint256 newQuoteSold = quoteAmount.add(quoteSold);
            uint256 newBaseBought = getBaseAmountLowBaseSide(p, k, DecimalMath.ONE, newQuoteSold);
            if (newBaseBought > baseBought) {
                baseAmount = newBaseBought.sub(baseBought);
            }
        }
    }

    function max(uint112 a, uint112 b) private pure returns (uint112) {
        return a >= b ? a : b;
    }
}
