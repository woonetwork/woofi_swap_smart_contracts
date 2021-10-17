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

import { expect, use } from 'chai'
import { Contract, utils, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import IWooracle from '../build/IWooracle.json'
import WooPP from '../build/WooPP.json'
import IWooPP from '../build/IWooPP.json'
import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const BTC_PRICE = 50000
const WOO_PRICE = 1.05

const ONE = BigNumber.from(10).pow(18)

describe('WooRouter', () => {
  const [owner, user, approveTarget, swapTarget] = new MockProvider().getWallets()

  describe('core func', () => {
    let wooracle: Contract
    let wooPP: Contract
    let wooRouter: Contract
    let btcToken: Contract
    let wooToken: Contract
    let usdtToken: Contract

    before('Deploy ERC20', async () => {
      btcToken = await deployContract(owner, TestToken, [])
      wooToken = await deployContract(owner, TestToken, [])
      usdtToken = await deployContract(owner, TestToken, [])

      wooracle = await deployMockContract(owner, IWooracle.abi)
      await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
      await wooracle.mock.getPrice.withArgs(btcToken.address).returns(ONE.mul(BTC_PRICE), true)
      await wooracle.mock.getState
        .withArgs(btcToken.address)
        .returns(
          ONE.mul(BTC_PRICE),
          BigNumber.from(10).pow(18).mul(1).div(10000),
          BigNumber.from(10).pow(9).mul(2),
          true
        )
      await wooracle.mock.getState
        .withArgs(wooToken.address)
        .returns(
          ONE.mul(105).div(100),
          BigNumber.from(10).pow(18).mul(1).div(10000),
          BigNumber.from(10).pow(9).mul(2),
          true
        )
    })

    beforeEach('Deploy WooRouter', async () => {
      wooPP = await deployContract(owner, WooPP, [usdtToken.address, wooracle.address, ZERO_ADDR])
      wooRouter = await deployContract(owner, WooRouter, [WBNB_ADDR, wooPP.address])

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R, ZERO_ADDR)
      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R, ZERO_ADDR)

      await btcToken.mint(wooPP.address, ONE.mul(10))
      await usdtToken.mint(wooPP.address, ONE.mul(5000000))
      await wooToken.mint(wooPP.address, ONE.mul(10000000))
    })

    it('querySwap accuracy1', async () => {
      const btcNum = 1
      const amount = await wooRouter.querySwap(btcToken.address, usdtToken.address, ONE.mul(btcNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE * btcNum
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002)
      console.log("Query selling 1 btc for usdt: ", amountNum, slippage)
    })

    it('querySwap accuracy1_2', async () => {
      const btcNum = 3
      const amount = await wooRouter.querySwap(btcToken.address, usdtToken.address, ONE.mul(btcNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE * btcNum
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 2)
      console.log("Query selling 3 btc for usdt: ", amountNum, slippage)
    })

    it('querySwap accuracy1_3', async () => {
      const btcNum = 10
      const amount = await wooRouter.querySwap(btcToken.address, usdtToken.address, ONE.mul(btcNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE * btcNum
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 6)
      console.log("Query selling 10 btc for usdt: ", amountNum, slippage)
    })

    it('querySwap accuracy2', async () => {
      const amount = await wooRouter.querySwap(usdtToken.address, btcToken.address, ONE.mul(10000))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = 0.2
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002)
      console.log("Query selling 10000 usdt for btc: ", amountNum, slippage)
    })

    it('querySwap accuracy3_1', async () => {
      const wooNum = 25000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002)
      console.log("Query selling 25000 woo for usdt: ", amountNum, slippage)
    })

    it('querySwap accuracy3_2', async () => {
      const wooNum = 200000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 2.5)
      console.log("Query selling 200000 woo for usdt: ", amountNum, slippage)
    })

    it('querySwap accuracy3_3', async () => {
      const wooNum = 1230000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 15)
      console.log("Query selling 1230000 woo for usdt: ", amountNum, slippage)
    })

    it('querySwap 2-routes accuracy1', async () => {
      const amount = await wooRouter.querySwap(btcToken.address, wooToken.address, ONE)
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = 1 * BTC_PRICE / WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)

      const slippage = (benchmark - amountNum) / benchmark
      const slippageBenchmark = 0.0002 * 1.5
      expect(slippage).to.lessThan(slippageBenchmark)
      console.log("Query selling 1 btc for woo: ", amountNum, slippage)
    })

    it('querySwap 2-routes accuracy2', async () => {
      const amount = await wooRouter.querySwap(wooToken.address, btcToken.address, ONE.mul(30000))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = 30000 * WOO_PRICE / BTC_PRICE
      expect(amountNum).to.lessThan(benchmark)

      const slippage = (benchmark - amountNum) / benchmark
      const slippageBenchmark = 0.0002 * 1.5
      expect(slippage).to.lessThan(slippageBenchmark)
      console.log("Query selling 30000 woo for btc: ", amountNum, slippage)
    })
  })

})
