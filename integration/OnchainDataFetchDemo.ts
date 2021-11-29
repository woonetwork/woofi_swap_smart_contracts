import { Token } from "../../entities/Token"
import Web3 from 'web3';
import { BigNumber } from '@ethersproject/bignumber';
import { GetConfig, GetWooPPTokens } from '../../data/dataAdapter';
import { sortsAddress } from '../../utils'
import * as MULTI_ABI from '../../abi/external/mutlicall.json';
import { BigNumber as LocBN} from 'bignumber.js';
import { WooPair, WooppTokenInfo, WooracleState, WooRefInfo } from "../../entities/WooPair";
LocBN.config({
    EXPONENTIAL_AT: [-80, 80],
    DECIMAL_PLACES: 80,
});

export class WooRouteHelper {
    public WEB3: any
    public NETWORK_ID: number
    public WOOPP_CONTRACT: string
    public WOOORACAL_CONTRACT: string
    public MULTI_CALL: string
    public WOO_GUARDIAN: string
    public BASETOKENS: Token[]
    public QUOTETOKEN: Token

    constructor(
        _NETWORK_ID: number,
        _WEB3?: any,
        _ORACAL?: string,
        _WOOPP?: string
    ) {
        this.NETWORK_ID = _NETWORK_ID
        let CONFIG = GetConfig(_NETWORK_ID)
        this.WEB3 = _WEB3 || CONFIG['WEB3_URL']
        let tokens = GetWooPPTokens(_NETWORK_ID)
        this.BASETOKENS = tokens["baseToken"]
        this.QUOTETOKEN = tokens["quoteToken"]
        this.WOOORACAL_CONTRACT = _ORACAL || CONFIG["WOO_ORACLE"]
        this.WOOPP_CONTRACT = _WOOPP || CONFIG["WOOPP"]
        this.WOO_GUARDIAN = CONFIG["WOO_GUARDIAN"]
        this.MULTI_CALL = CONFIG['MULTI_CALL']
    }

    public async getAllWooPairs(): Promise<WooPair[]> {
        let calls = []
        const web3 = new Web3(this.WEB3);
        const multiInstance = new web3.eth.Contract(MULTI_ABI['default'], this.MULTI_CALL);

        const tokenInfoKey = "0xf5dab711"
        const refInfoKey = "0x5ab971eb"

        // get quoteTokenInfo
        let rec1 = web3.eth.abi.encodeParameters(["address"], [this.QUOTETOKEN.address])
        rec1 = rec1.replace('0x', '')
        calls.push({
            "target": this.WOOPP_CONTRACT,
            "callData": tokenInfoKey + rec1
        })
        calls.push({
            "target": this.WOO_GUARDIAN,
            "callData": refInfoKey + rec1
        })


        // get baseTokenInfo and baseState
        const stateKey = "0x31e658a5"
        for(let i = 0; i < this.BASETOKENS.length; ++i) {
            let rec1 = web3.eth.abi.encodeParameters(["address"], [this.BASETOKENS[i].address])
            rec1 = rec1.replace('0x', '')

            calls.push({
                "target": this.WOOPP_CONTRACT,
                "callData": tokenInfoKey + rec1
            })

            calls.push({
                "target": this.WOOORACAL_CONTRACT,
                "callData": stateKey + rec1
            })

            calls.push({
                "target": this.WOO_GUARDIAN,
                "callData": refInfoKey + rec1
            })
        }

        const res = await multiInstance.methods.aggregate(calls).call(); // results.length >  tokens.length
        const results = res[1]

        // deal with quoteTokenInfo
        let rawQuoteInfo = results[0]
        let tmpInfo = web3.eth.abi.decodeParameters(["uint112", "uint112", "uint32", "uint64", "uint64", "uint112", "bool"], rawQuoteInfo)
        let quoteTokenInfo = new WooppTokenInfo(new LocBN(tmpInfo[0]), new LocBN(tmpInfo[1]), new LocBN(tmpInfo[2]), new LocBN(tmpInfo[3]), new LocBN(tmpInfo[4]), new LocBN(tmpInfo[5]), tmpInfo[6])

        let rawQuoteRef = results[1]
        let tmpRef = web3.eth.abi.decodeParameters(["address", "uint96", "uint96", "uint96", "uint64"], rawQuoteRef)
        let quoteRef = new WooRefInfo(new LocBN(tmpRef[2]), new LocBN(tmpRef[3]))

        // deal with baseTokenInfo and construct pair
        let ans = []
        for(let i = 0; i < this.BASETOKENS.length; ++i) {
            let j = i*3 +2, k = (i+1)*3, p = (i+1)*3+1

            let rawBaseInfo = results[j]
            let tmpInfo = web3.eth.abi.decodeParameters(["uint112", "uint112", "uint32", "uint64", "uint64", "uint112", "bool"], rawBaseInfo)
            let baseTokenInfo = new WooppTokenInfo(new LocBN(tmpInfo[0]), new LocBN(tmpInfo[1]), new LocBN(tmpInfo[2]), new LocBN(tmpInfo[3]), new LocBN(tmpInfo[4]), new LocBN(tmpInfo[5]), tmpInfo[6])

            let rawBaseState = results[k]
            let tmpState = web3.eth.abi.decodeParameters(["uint256", "uint256", "uint256", "bool"], rawBaseState)
            let baseState = new WooracleState(new LocBN(tmpState[0]), new LocBN(tmpState[1]), new LocBN(tmpState[2]), tmpState[3])

            let rawBaseRef = results[p]
            let tmpRef = web3.eth.abi.decodeParameters(["address", "uint96", "uint96", "uint96", "uint64"], rawBaseRef)
            let baseRef = new WooRefInfo(new LocBN(tmpRef[2]), new LocBN(tmpRef[3]))

            let curPair = new WooPair(this.BASETOKENS[i], this.QUOTETOKEN, this.WOOPP_CONTRACT, 8, "Woo Fi", baseTokenInfo, quoteTokenInfo, baseState, baseRef, quoteRef)
            ans.push(curPair)
        }

        return ans
    }
}