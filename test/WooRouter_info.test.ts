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

import { expect, use } from 'chai'
import { Contract, utils, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import IWooracle from '../build/IWooracle.json'
import WooPP from '../build/WooPP.json'
import IWooPP from '../build/IWooPP.json'
import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import IWooGuardian from '../build/IWooGuardian.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const BTC_PRICE = 60000
const WOO_PRICE = 1.05

const ONE = BigNumber.from(10).pow(18)

describe('WooRouter Info', () => {
  const [owner, user, approveTarget, swapTarget] = new MockProvider().getWallets()

  let wooracle: Contract
  let wooGuardian: Contract
  let btcToken: Contract
  let wooToken: Contract
  let usdtToken: Contract

  before('Deploy ERC20', async () => {
    btcToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])

    wooracle = await deployMockContract(owner, IWooracle.abi)
    await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
    await wooracle.mock.state
      .withArgs(btcToken.address)
      .returns(
        utils.parseEther(BTC_PRICE.toString()),
        utils.parseEther('0.0001'),
        utils.parseEther('0.000000001'),
        true
      )
    await wooracle.mock.state
      .withArgs(wooToken.address)
      .returns(utils.parseEther('1.05'), utils.parseEther('0.002'), utils.parseEther('0.00000005'), true)

    wooGuardian = await deployMockContract(owner, IWooGuardian.abi)
    await wooGuardian.mock.checkSwapPrice.returns()
    await wooGuardian.mock.checkSwapAmount.returns()
    await wooGuardian.mock.checkInputAmount.returns()
  })

  describe('Print slippage info', () => {
    let wooPP: Contract
    let wooRouter: Contract

    beforeEach('Deploy WooRouter', async () => {
      wooPP = await deployContract(owner, WooPP, [usdtToken.address, wooracle.address, wooGuardian.address])
      wooRouter = await deployContract(owner, WooRouter, [WBNB_ADDR, wooPP.address])

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)
      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R)

      await btcToken.mint(wooPP.address, ONE.mul(1000))
      await usdtToken.mint(wooPP.address, ONE.mul(5000000000))
      await wooToken.mint(wooPP.address, ONE.mul(100000000))
    })

    it('Print slippage', async () => {
      const btcNum = [0.1, 0.3, 1, 3, 10, 20, 50, 100, 200, 500]
      await _querySellSwaps(btcNum, btcToken, BTC_PRICE)
      console.log('----------------------------------------------------------------------------')
      await _queryBuySwaps(
        btcNum.map((x) => x * BTC_PRICE),
        btcToken,
        BTC_PRICE
      )
      console.log('----------------------------------------------------------------------------')
      const wooNum = [1000, 3000, 10000, 30000, 100000, 300000, 600000, 1000000, 3000000, 6000000]
      await _querySellSwaps(wooNum, wooToken, WOO_PRICE)
      console.log('----------------------------------------------------------------------------')
      await _queryBuySwaps(
        wooNum.map((x) => x * WOO_PRICE),
        wooToken,
        WOO_PRICE
      )
      console.log('----------------------------------------------------------------------------')
      await _queryBtcWooSwaps(btcNum, BTC_PRICE / WOO_PRICE)
    })

    async function _querySellSwaps(tokenNums: Number[], token: Contract, price: number) {
      const name = token == btcToken ? 'btc' : 'woo'
      for (let i in tokenNums) {
        const num = tokenNums[i]
        const amount = await wooRouter.querySwap(token.address, usdtToken.address, utils.parseEther(num.toString()))
        const amountNum = Number(utils.formatEther(amount))
        const benchmark = price * Number(num)
        const slippage = (benchmark - amountNum) / benchmark
        console.log(`\t ${num} ${name} for usdt:\t`, amountNum, slippage)
      }
    }

    async function _queryBuySwaps(tokenNums: Number[], token: Contract, price: number) {
      const name = token == btcToken ? 'btc' : 'woo'
      for (let i in tokenNums) {
        const num = tokenNums[i]
        const amount = await wooRouter.querySwap(usdtToken.address, token.address, utils.parseEther(num.toString()))
        const amountNum = Number(utils.formatEther(amount))
        const benchmark = Number(num) / price
        const slippage = (benchmark - amountNum) / benchmark
        console.log(`\t ${num} usdt for ${name}:\t`, amountNum, slippage)
      }
    }

    async function _queryBtcWooSwaps(tokenNums: Number[], price: number) {
      for (let i in tokenNums) {
        const num = tokenNums[i]
        const amount = await wooRouter.querySwap(btcToken.address, wooToken.address, utils.parseEther(num.toString()))
        const amountNum = Number(utils.formatEther(amount))
        const benchmark = Number(num) * price
        const slippage = (benchmark - amountNum) / benchmark
        console.log(`\t ${num} bitcoin for woo:\t`, amountNum, slippage)
      }
    }
  })
})
