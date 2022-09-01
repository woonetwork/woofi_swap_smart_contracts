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

import './libraries/InitializableOwnable.sol';
import './libraries/DecimalMath.sol';
import './interfaces/IWooracleV2.sol';
import './interfaces/IWooPPV2.sol';
import './interfaces/IWooFeeManager.sol';
import './interfaces/IWooGuardian.sol';
import './interfaces/AggregatorV3Interface.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/math/SafeMath.sol';
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';

import "hardhat/console.sol";

/// @title Woo private pool for swaping.
/// @notice the implementation class for interface IWooPPV2, mainly for query and swap tokens.
contract WooPPV2 is InitializableOwnable, ReentrancyGuard, Pausable, IWooPPV2 {
    /* ----- Type declarations ----- */

    using SafeMath for uint256;
    using SafeMath for uint192;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    struct Decimals {
        uint64 priceDec;    // 10**(price_decimal)
        uint64 quoteDec;    // 10**(quote_decimal)
        uint64 baseDec;     // 10**(base_decimal)
    }

    struct TokenInfo {
        uint192 reserve;    // balance reserve
        uint16 feeRate;     // 1 in 100000; 10 = 1bp = 0.01%; max = 65535
        // bool paused;        // paused
    }

    /* ----- State variables ----- */
    uint256 public unclaimedFee;

    // wallet address --> is admin
    mapping(address => bool) public isAdmin;

    // token address --> fee rate
    mapping(address => TokenInfo) public tokenInfos;

    /// @inheritdoc IWooPPV2
    address public immutable override quoteToken;

    IWooracleV2 public wooracle;

    IWooFeeManager public feeManager;

    /* ----- Modifiers ----- */

    modifier onlyAdmin() {
        require(msg.sender == _OWNER_ || isAdmin[msg.sender], 'WooPPV2: !admin');
        _;
    }

    constructor(address _quoteToken) public {
        initOwner(msg.sender);
        quoteToken = _quoteToken;
    }

    function init(address _wooracle, address _feeManager) external onlyOwner {
        require(
            address(wooracle) == address(0) && address(feeManager) == address(0),
            'WooPPV2: INIT_INVALID'
        );
        wooracle = IWooracleV2(_wooracle);
        feeManager = IWooFeeManager(_feeManager);
        require(feeManager.quoteToken() == quoteToken, 'WooPPV2: !feeManager');
    }

    /* ----- External Functions ----- */

    /// @inheritdoc IWooPPV2
    function querySellBase(address baseToken, uint256 baseAmount)
        external
        view
        override
        whenNotPaused
        returns (uint256 quoteAmount)
    {
        require(baseToken != address(0), 'WooPPV2: !baseToken');
        require(baseToken != quoteToken, 'WooPPV2: baseToken==quoteToken');

        (quoteAmount, ) = getQuoteAmountSellBase(baseToken, baseAmount);
        uint256 fee = quoteAmount.mul(tokenInfos[baseToken].feeRate).div(1e5);
        quoteAmount = quoteAmount.sub(fee);

        require(quoteAmount <= tokenInfos[quoteToken].reserve, 'WooPPV2: INSUFF_QUOTE');
    }

    /// @inheritdoc IWooPPV2
    function querySellQuote(address baseToken, uint256 quoteAmount)
        external
        view
        override
        whenNotPaused
        returns (uint256 baseAmount)
    {
        require(baseToken != address(0), 'WooPPV2: !baseToken');
        require(baseToken != quoteToken, 'WooPPV2: baseToken==quoteToken');

        uint256 lpFee = quoteAmount.mul(tokenInfos[baseToken].feeRate).div(1e5);
        quoteAmount = quoteAmount.sub(lpFee);
        (baseAmount, ) = getBaseAmountSellQuote(baseToken, quoteAmount);

        require(baseAmount <= tokenInfos[baseToken].reserve, 'WooPPV2: INSUFF_BASE');
    }

    /// @inheritdoc IWooPPV2
    function sellBase(
        address baseToken,
        uint256 baseAmount,
        uint256 minQuoteAmount,
        address to,
        address rebateTo
    ) external override nonReentrant whenNotPaused returns (uint256 quoteAmount) {
        require(baseToken != address(0), 'WooPPV2: !baseToken');
        require(to != address(0), 'WooPPV2: !to');
        require(baseToken != quoteToken, 'WooPPV2: baseToken==quoteToken');

        address from = msg.sender;

        require(balance(baseToken).sub(tokenInfos[baseToken].reserve) >= baseAmount, 'WooPPV2: BASE_BALANCE_NOT_ENOUGH');

        uint256 newPrice;
        (quoteAmount, newPrice) = getQuoteAmountSellBase(baseToken, baseAmount);
        IWooracleV2(wooracle).postPrice(baseToken, uint128(newPrice));

        uint256 lpFee = quoteAmount.mul(tokenInfos[baseToken].feeRate).div(1e5);
        quoteAmount = quoteAmount.sub(lpFee);
        require(quoteAmount >= minQuoteAmount, 'WooPPV2: quoteAmount_LT_minQuoteAmount');

        // TransferHelper.safeApprove(quoteToken, address(feeManager), lpFee);
        // feeManager.collectFee(lpFee, rebateTo);
        unclaimedFee = unclaimedFee.add(lpFee);

        if (to != address(this)) {
            TransferHelper.safeTransfer(quoteToken, to, quoteAmount);
        }

        _updateReserve(baseToken);

        emit WooSwap(baseToken, quoteToken, baseAmount, quoteAmount, from, to, rebateTo);
    }

    /// @inheritdoc IWooPPV2
    function sellQuote(
        address baseToken,
        uint256 quoteAmount,
        uint256 minBaseAmount,
        address to,
        address rebateTo
    ) external override nonReentrant whenNotPaused returns (uint256 baseAmount) {
        require(baseToken != address(0), 'WooPPV2: !baseToken');
        require(to != address(0), 'WooPPV2: !to');
        require(baseToken != quoteToken, 'WooPPV2: baseToken==quoteToken');

        address from = msg.sender;

        require(
            balance(quoteToken).sub(tokenInfos[quoteToken].reserve) >= quoteAmount,
            'WooPPV2: QUOTE_BALANCE_NOT_ENOUGH'
        );

        uint256 lpFee = quoteAmount.mul(tokenInfos[baseToken].feeRate).div(1e5);
        quoteAmount = quoteAmount.sub(lpFee);
        uint256 newPrice;
        (baseAmount, newPrice) = getBaseAmountSellQuote(baseToken, quoteAmount);
        IWooracleV2(wooracle).postPrice(baseToken, uint128(newPrice));
        require(baseAmount >= minBaseAmount, 'WooPPV2: baseAmount_LT_minBaseAmount');

        unclaimedFee = unclaimedFee.add(lpFee);

        if (to != address(this)) {
            TransferHelper.safeTransfer(baseToken, to, baseAmount);
        }

        _updateReserve(baseToken);

        emit WooSwap(quoteToken, baseToken, quoteAmount.add(lpFee), baseAmount, from, to, rebateTo);
    }

    /// @dev Get the pool's balance of the specified token
    /// @dev This function is gas optimized to avoid a redundant extcodesize check in addition to the returndatasize
    /// @dev forked and curtesy by Uniswap v3-core
    /// check
    function balance(address token) public view returns (uint256) {
        (bool success, bytes memory data) =
            token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        require(success && data.length >= 32, 'WooPPV2: !BALANCE');
        return abi.decode(data, (uint256));
    }

    /// @dev Get the pool's balance of token
    /// @param token the token pool to query
    function poolSize(address token) public view returns (uint256) {
        return tokenInfos[token].reserve;
    }

    function setWooracle(address _wooracle) external onlyAdmin {
        wooracle = IWooracleV2(_wooracle);
        emit WooracleUpdated(_wooracle);
    }

    function setFeeManager(address _feeManager) external onlyAdmin {
        feeManager = IWooFeeManager(_feeManager);
        require(feeManager.quoteToken() == quoteToken, 'WooPPV2: !feeManager_quoteToken');
        emit FeeManagerUpdated(_feeManager);
    }

    /* ----- Admin Functions ----- */

    function claimFee() external onlyAdmin {
        uint256 fee = unclaimedFee;
        TransferHelper.safeApprove(quoteToken, address(feeManager), fee);
        TransferHelper.safeTransfer(quoteToken, address(feeManager), fee);
        unclaimedFee = 0;
    }

    function setFeeRate(address token, uint16 rate) external onlyAdmin {
        require(rate <= 1e5, '!rate');
        tokenInfos[token].feeRate = rate;
    }

    function pause() external onlyAdmin {
        super._pause();
    }

    function unpause() external onlyAdmin {
        super._unpause();
    }

    function setAdmin(address addr, bool flag) external onlyAdmin {
        require(addr != address(0), 'WooPPV2: !admin');
        isAdmin[addr] = flag;
        emit AdminUpdated(addr, flag);
    }

    function deposit(address token, uint256 amount) external onlyAdmin {
        uint256 balanceBefore = balance(token);
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 amountReceived = balance(token).sub(balanceBefore);
        require(amountReceived >= amount, 'AMOUNT_INSUFF');

        tokenInfos[token].reserve = uint192(tokenInfos[token].reserve.add(amount));

        emit Deposit(token, msg.sender, amount);
    }

    function withdraw(address token, uint256 amount) public onlyAdmin {
        require(tokenInfos[token].reserve >= amount, 'WooPPV2: !amount');
        TransferHelper.safeTransfer(token, _OWNER_, amount);
        tokenInfos[token].reserve = uint192(tokenInfos[token].reserve.sub(amount));
        emit Withdraw(token, _OWNER_, amount);
    }

    function withdrawAll(address token) external onlyAdmin {
        withdraw(token, poolSize(token));
    }

    /* ----- Private Functions ----- */

    function _updateReserve(address baseToken) private {
        require(
            balance(baseToken) > tokenInfos[baseToken].reserve ||
            balance(quoteToken) > tokenInfos[quoteToken].reserve,
            "WooPPV2: !BALANCE"
        );

        // TODO: how to handle the accidental transferred funds?
        tokenInfos[baseToken].reserve = uint192(balance(baseToken));
        tokenInfos[quoteToken].reserve = uint192(balance(quoteToken).sub(unclaimedFee));
    }

    function getQuoteAmountSellBase(address baseToken, uint256 baseAmount)
        private
        view
        returns (uint256 quoteAmount, uint256 newPrice)
    {
        /*
            baseBalance = base.balanceOf(this)
            baseAmount = baseBalance - baseReserve
            quoteAmount = baseAmount * oracle.price * (1 - oracle.k * baseAmount * oracle.price - oracle.spread)
            quote.transfer(to, quoteAmount)
            oracle.postPrice(base, oracle.price - 2 * k * oracle.price^2 * baseAmount)
            baseReserve = baseBalance
            quoteReserve = quote.balanceOf(this)
        */
        IWooracleV2.State memory state = IWooracleV2(wooracle).state(baseToken);
        require(state.woFeasible, 'WooPPV2: ORACLE_PRICE_NOT_FEASIBLE');

        Decimals memory decs = _decimals(baseToken);

        // quoteAmount = baseAmount * oracle.price * (1 - oracle.k * baseAmount * oracle.price - oracle.spread)
        {
        uint256 coef = uint256(1e18) - (uint256(state.coeff) * baseAmount * state.price / decs.baseDec / decs.priceDec) - state.spread;
        console.log('coeff:', coef / 1e16);
        quoteAmount = baseAmount
            .mul(decs.quoteDec)
            .mul(state.price)
            .div(decs.priceDec)
            .mulFloor(coef)
            .div(decs.baseDec);
        }

        console.log(quoteAmount / 1e18);

        // newPrice = (1 - 2 * k * oracle.price * baseAmount) * oracle.price
        uint256 k = uint256(2).mul(state.coeff).mul(state.price).mul(baseAmount).div(decs.priceDec).div(decs.baseDec);
        console.log('k: ', k / 1e12);
        newPrice =
            uint256(1e18).sub(k)
            .mul(state.price)
            .div(1e18);
        console.log('new price: ', newPrice / 1e8);
    }

    function _decimals(address baseToken) private view returns (Decimals memory) {
        Decimals memory decs;
        decs.priceDec = uint64(10)**(IWooracleV2(wooracle).decimals(baseToken)); // 8
        decs.quoteDec = uint64(10)**(ERC20(quoteToken).decimals()); // 18 or 6
        decs.baseDec = uint64(10)**(ERC20(baseToken).decimals()); // 18 or 8
        console.log(
            IWooracleV2(wooracle).decimals(baseToken),
            ERC20(quoteToken).decimals(),
            ERC20(baseToken).decimals()
        );
        return decs;
    }

    // quote token -> base token
    function getBaseAmountSellQuote(address baseToken, uint256 quoteAmount)
        private
        view
        returns (uint256 baseAmount, uint256 newPrice)
    {
        /*
            quoteBalance = quote.balanceOf(this)
            quoteAmount = quoteBalance - quoteReserve
            baseAmount = quoteAmount / oracle.price * (1 - oracle.k * quoteAmount - oracle.spread)
            base.transfer(to, baseAmount)
            oracle.postPrice(base, oracle.price + 2 * k * oracle.price * quoteAmount)
            baseReserve = base.balanceOf(this)
            quoteReserve = quoteBalance
        */
        IWooracleV2.State memory state = IWooracleV2(wooracle).state(baseToken);
        require(state.woFeasible, 'WooPPV2: ORACLE_PRICE_NOT_FEASIBLE');

        Decimals memory decs = _decimals(baseToken);

        // baseAmount = quoteAmount / oracle.price * (1 - oracle.k * quoteAmount - oracle.spread)
        {
            uint256 coef = uint256(1e18) - quoteAmount * state.coeff / decs.quoteDec - state.spread;
            baseAmount = quoteAmount
                .mul(decs.baseDec)
                .mul(decs.priceDec)
                .div(state.price)
                .mulFloor(coef)
                .div(decs.quoteDec);
        }

        // oracle.postPrice(base, oracle.price * (1 + 2 * k * quoteAmount)
        newPrice = uint256(1e18).mul(decs.quoteDec).add(uint256(2 * state.coeff).mul(quoteAmount)).mul(state.price).div(
                decs.quoteDec
            );
    }
}
