import BigNumber from 'bignumber.js';
import { Wooracle } from '../../typechain';
BigNumber.config({
    EXPONENTIAL_AT: [-80, 80],
    DECIMAL_PLACES: 80,
});


import { Token } from './Token'

const BASE = new BigNumber(10**18)
const ONE = BASE.multipliedBy(1)
const TWO = BASE.multipliedBy(1)



/**
 * Query data from:
 * https://bscscan.com/address/0xea4edfeff60b375556459e106ab57b696c202a29#readContract
 *
 *
 *      function state(address base) external
 *         returns (
            uint256 priceNow,
            uint256 spreadNow,
            uint256 coeffNow,
            bool feasible
        )
 */
export class WooracleState {
    public readonly priceNow!: BigNumber;
    public readonly spreadNow!: BigNumber;
    public readonly coeffNow!: BigNumber;
    public readonly feasible!: Boolean;

    public constructor(
        priceNow: BigNumber,
        spreadNow: BigNumber,
        coeffNow: BigNumber,
        feasible: Boolean
    ) {
        this.priceNow = priceNow;
        this.spreadNow = spreadNow;
        this.coeffNow = coeffNow;
        this.feasible = feasible;
    }
}

/**
 * Query data from:
 * https://bscscan.com/address/0x8489d142da126f4ea01750e80ccaa12fd1642988#readContract
 *
 * #tokenInfo(address baseToken)
 *
 * return value:
 *
 *  struct TokenInfo {
        uint112 reserve; // Token balance
        uint112 threshold; // Threshold for reserve update
        uint32 lastResetTimestamp; // Timestamp for last param update
        uint64 lpFeeRate; // Fee rate: e.g. 0.001 = 0.1%
        uint64 R; // Rebalance coefficient [0, 1]
        uint112 target; // Targeted balance for pricing
        bool isValid; // is this token info valid
    }
 */
export class WooppTokenInfo {

    public readonly reserve!: BigNumber;
    public readonly threshold!: BigNumber;
    public readonly lastResetTimestamp!: BigNumber;
    public readonly lpFeeRate!: BigNumber;
    public readonly R!: BigNumber;
    public readonly target!: BigNumber;
    public readonly isValid!: Boolean;

    public constructor(
        reserve: BigNumber,
        threshold: BigNumber,
        lastResetTimestamp: BigNumber,
        lpFeeRate: BigNumber,
        R: BigNumber,
        target: BigNumber,
        isValid: Boolean
    ) {
        this.reserve = reserve;
        this.threshold = threshold;
        this.lastResetTimestamp = lastResetTimestamp;
        this.lpFeeRate = lpFeeRate;
        this.R = R;
        this.target = target;
        this.isValid = isValid;
    }
}


export class WooPP {
    public readonly quoteToken: Token
    public readonly wooPPAddr: string
    public readonly wooPPVersion: number
    public readonly baseTokens: Set<string>

    public constructor(quoteToken: Token, wooPPAddr: string, wooPPVersion: number) {
        this.quoteToken = quoteToken
        this.wooPPAddr = wooPPAddr
        this.wooPPVersion = wooPPVersion

        this.baseTokens = new Set()
        // current WooPP supported base token list: https://github.com/woonetwork/woofi_swap_smart_contracts
        this.baseTokens.add('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c') // wbnb
        this.baseTokens.add('0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c') // btcb
        this.baseTokens.add('0x2170ed0880ac9a755fd29b2688956bd959f933f8') // eth
        this.baseTokens.add('0x4691937a7508860f876c9c0a2a617e7d9e945d4b') // woo
    }

    // swap token1 -> token2
    public getSwapAmount(token1: Token, token2: Token): BigNumber {
        const inputAmount = token1.amount
        // invariant(inputAmount.gt(0), "INPUT_AMOUNT_NOT_ZERO")

        if (this.involvesToken(token1) || this.involvesToken(token2)) {
            // token not supported
            return new BigNumber(0)
        }

        // Three cases:
        // 1. base -> usdt
        // 2. usdt -> base
        // 3. base1 -> usdt -> base2
        try {
            if (this.isQuoteToken(token1)) {
                const { baseTokenInfo, quoteTokenInfo } = this.QueryWooppTokenInfo(token2)
                const baseState = this.QueryWooracleState(token2)
                return this.QuerySellQuote(token2, baseTokenInfo, quoteTokenInfo, baseState, token2.amount)
            } else if (this.isQuoteToken(token2)) {
                const { baseTokenInfo, quoteTokenInfo } = this.QueryWooppTokenInfo(token1)
                const baseState = this.QueryWooracleState(token1)
                return this.QuerySellBase(token1, baseTokenInfo, quoteTokenInfo, baseState, token1.amount)
            } else {
                const { baseTokenInfo, quoteTokenInfo } = this.QueryWooppTokenInfo(token1)
                const base1State = this.QueryWooracleState(token1)
                const baseToken2Info = this.QueryWooppTokenInfo(token2).baseTokenInfo
                const base2State = this.QueryWooracleState(token2)
                const quoteAmount = this.QuerySellBase(token1, baseTokenInfo, quoteTokenInfo, base1State, token1.amount)
                return this.QuerySellQuote(token2, baseToken2Info, quoteTokenInfo, base2State, quoteAmount)
            }
        } catch (error) {
            throw error;
        }
    }

    public QueryWooppTokenInfo(baseToken: Token):
        { baseTokenInfo: WooppTokenInfo, quoteTokenInfo: WooppTokenInfo} {
        // Steps to do:
        // 1. query the token info from WooPP smart contract (address: this.wooPPAddr)
        // https://bscscan.com/address/0x8489d142Da126F4Ea01750e80ccAa12FD1642988
        // call method: WooPP#tokenInfo(token_address)
        //
        // 2. query both base and quote token info and return
        const baseTokenInfo = new WooppTokenInfo(ONE, ONE, ONE, ONE, ONE, ONE, true)
        const quoteTokenInfo = new WooppTokenInfo(ONE, ONE, ONE, ONE, ONE, ONE, true)
        return {
            baseTokenInfo, quoteTokenInfo
        }
    }

    public QueryWooracleState(baseToken: Token) {
        // Steps to do:
        // 1. query the wooracle info from WooPP
        // https://bscscan.com/address/0x8489d142Da126F4Ea01750e80ccAa12FD1642988
        // call method: WooPP#wooracle
        // Current wooracle address: 0xea4edfeff60b375556459e106ab57b696c202a29
        //
        // 2.
        // Call wooracle#state(baseToken) to get the token state
        //
        //
        // 3. return the base token state
        return new WooracleState(ONE, ONE, ONE, true)
    }

    // Query: base token -> quote token with the given baseAmount
    public QuerySellBase(
        baseToken: Token,
        baseTokenInfo: WooppTokenInfo,
        quoteTokenInfo: WooppTokenInfo,
        baseState: WooracleState,
        baseAmount: BigNumber
    ): BigNumber {
        // check validity of input args

        const quoteAmount = this.getQuoteAmountSellBase(
            baseToken,
            baseAmount,
            baseTokenInfo,
            quoteTokenInfo,
            baseState);
        const lpFee = quoteAmount.multipliedBy(baseTokenInfo.lpFeeRate).div(BASE)
        return quoteAmount.minus(lpFee)
    }

    // Query: quote token -> base token with the given quoteAmount
    public QuerySellQuote(
        baseToken: Token,
        baseTokenInfo: WooppTokenInfo,
        quoteTokenInfo: WooppTokenInfo,
        baseState: WooracleState,
        quoteAmount: BigNumber
    ): BigNumber {
        // check validity of input args

        const lpFee = quoteAmount.multipliedBy(baseTokenInfo.lpFeeRate).div(BASE)
        const quoteAmountAfterFee = quoteAmount.minus(lpFee)
        return this.getBaseAmountSellQuote(
            baseToken,
            quoteAmountAfterFee,
            baseTokenInfo,
            quoteTokenInfo,
            baseState)
    }

    private getQuoteAmountSellBase(
        baseToken: Token,
        baseAmount: BigNumber,
        baseTokenInfo: WooppTokenInfo,
        quoteTokenInfo: WooppTokenInfo,
        baseState: WooracleState
    ): BigNumber {
        let p = baseState.priceNow.multipliedBy(ONE.minus(baseState.spreadNow.div(2))).div(BASE)
        let k = baseState.coeffNow
        let r = ONE
        return this.getQuoteAmountLowQuoteSide(p, k, r, baseAmount)
    }

    private getBaseAmountSellQuote(
        baseToken: Token,
        quoteAmount: BigNumber,
        baseTokenInfo: WooppTokenInfo,
        quoteTokenInfo: WooppTokenInfo,
        baseState: WooracleState
    ): BigNumber {
        let p = baseState.priceNow.multipliedBy(ONE.plus(baseState.spreadNow.div(2))).div(BASE)
        let k = baseState.coeffNow
        let r = ONE
        return this.getBaseAmountLowBaseSide(p, k, r, quoteAmount)
    }


    public isBaseToken(token: Token): boolean {
        return token.address in this.baseTokens
    }

    public isQuoteToken(token: Token): boolean {
        return token.address === this.quoteToken.address
    }

    public involvesToken(token: Token): boolean {
        return this.isBaseToken(token) || this.isQuoteToken(token)
    }

    // --------- private method --------- //

    private getQuoteAmountLowQuoteSide(
        p: BigNumber,
        k: BigNumber,
        r: BigNumber,
        baseAmount: BigNumber
    ): BigNumber {
        // priceFactor = 1 + k * baseAmount * p * r;
        const priceFactor = ONE.plus(k.multipliedBy(baseAmount).div(BASE).multipliedBy(p).div(BASE).multipliedBy(r).div(BASE))
        // return baseAmount * p / priceFactor
        return baseAmount.multipliedBy(p).div(BASE).multipliedBy(BASE).div(priceFactor)
    }

    private getBaseAmountLowQuoteSide(
        p: BigNumber,
        k: BigNumber,
        r: BigNumber,
        quoteAmount: BigNumber
    ): BigNumber {
        // priceFactor = 1 - k * quote * r
        const priceFactor = ONE.minus(k.multipliedBy(quoteAmount).div(BASE).multipliedBy(r).div(BASE))
        // return quote / p / priceFactor
        return quoteAmount.multipliedBy(BASE).div(p).multipliedBy(BASE).div(priceFactor)
    }

    private getBaseAmountLowBaseSide(
        p: BigNumber,
        k: BigNumber,
        r: BigNumber,
        quoteAmount: BigNumber
        ): BigNumber {
        // priceFactor = 1 + k * quote * r
        const priceFactor = ONE.plus(k.multipliedBy(quoteAmount).div(BASE).multipliedBy(r).div(BASE))
        // return quote / p / priceFactor
        return quoteAmount.multipliedBy(BASE).div(p).multipliedBy(BASE).div(priceFactor)
    }

    private getQuoteAmountLowBaseSide(
        p: BigNumber,
        k: BigNumber,
        r: BigNumber,
        baseAmount: BigNumber
    ): BigNumber {
        // priceFactor = 1 - k * base * p * r
        const priceFactor = ONE.minus(k.multipliedBy(baseAmount).div(BASE).multipliedBy(p).div(BASE).multipliedBy(r).div(BASE))
        // return base * p / priceFactor
        return baseAmount.multipliedBy(p).div(BASE).multipliedBy(BASE).div(priceFactor)
    }
}
