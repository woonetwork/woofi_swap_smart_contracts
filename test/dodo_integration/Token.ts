import BigNumber from 'bignumber.js'
BigNumber.config({
    EXPONENTIAL_AT: [-80, 80],
    DECIMAL_PLACES: 80,
});

// import { validateAndParseAddress } from '../utils'

export class Token {
    public readonly netWorkId: number
    public readonly address: string
    public readonly decimals: number
    public readonly symbol?: string
    public readonly name?: string
    public source?: string
    public amount?: BigNumber

    public constructor(netWorkId: number, address: string, decimals: number, symbol?: string, name?: string, source?: string, amount?: BigNumber) {
        this.netWorkId = netWorkId
        // this.address = validateAndParseAddress(address)
        this.address = address
        this.decimals = decimals
        this.symbol = symbol || ''
        this.name = name || ''
        this.amount = amount || new BigNumber(0)
        this.source = source || 'other'
    }

    public equals(other: Token): boolean {
        if (this === other) {
            return true
        }
        return this.netWorkId === other.netWorkId && this.address === other.address
    }

    public getUnitAmount(): BigNumber {
        return new BigNumber(1).multipliedBy(10**this.decimals);
    }
}

export const WETH = {
    [1]: new Token(
        1,
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        18,
        'WETH',
        'Wrapped Ether',
        'dodo'
    ),
    [4]: new Token(
        4,
        '0xB26c0d8Be2960c70641A95A9195BE1f59Ac83aC0',
        18,
        'WETH',
        'Wrapped Ether',
        'dodo'
    ),
    [28]: new Token(
        28,
        '0x42e50568d436b0376a4203517Bd3AF274c5546B2',
        18,
        'WETH',
        'Wrapped Ether',
        'dodo'
    ),
    [42]: new Token(
        42,
        '0x5eca15b12d959dfcf9c71c59f8b467eb8c6efd0b',
        18,
        'WETH',
        'Wrapped Ether',
        'dodo'
    ),
    [56]: new Token(
        56,
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        18,
        'WBNB',
        'Wrapped BNB',
        'other'
    ),
    [66]: new Token(
        66,
        '0x8F8526dbfd6E38E3D8307702cA8469Bae6C56C15',
        18,
        'WOKT',
        'Wrapped OKT',
        'other'
    ),
    [86]: new Token(
        86,
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        18,
        'WBNB',
        'Wrapped BNB',
        'other'
    ),
    [128]: new Token(
        128,
        '0x5545153ccfca01fbd7dd11c0b23ba694d9509a6f',
        18,
        'WHT',
        'Wrapped HT',
        'other'
    ),
    [137]: new Token(
        137,
        '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        18,
        'WMATIC',
        'Wrapped MATIC',
        'other'
    ),
    [1285]: new Token(
        1285,
        '0xf50225a84382c74CbdeA10b0c176f71fc3DE0C4d',
        18,
        'WMOVR',
        'Wrapped Moonriver',
        'other'
    ),
    [42161]: new Token(
        42161,
        '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        18,
        'WETH',
        'Wrapped Ether',
        'other'
    )
}
