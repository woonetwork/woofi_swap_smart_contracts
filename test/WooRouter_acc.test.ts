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
import IWooGuardian from '../build/IWooGuardian.json'
// import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooRouter } from '../typechain'
import WooRouterArtifact from '../artifacts/contracts/WooRouter.sol/WooRouter.json'

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

describe('WooRouter trading accuracy', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress

  let wooracle: Contract
  let wooGuardian: Contract
  let btcToken: Contract
  let wooToken: Contract
  let usdtToken: Contract

  before('Deploy ERC20', async () => {
    ;[owner, user] = await ethers.getSigners()
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

  describe('Query Functions', () => {
    let wooPP: Contract
    let wooRouter: WooRouter

    beforeEach('Deploy WooRouter', async () => {
      wooPP = await deployContract(owner, WooPP, [usdtToken.address, wooracle.address, wooGuardian.address])
      wooRouter = (await deployContract(owner, WooRouterArtifact, [WBNB_ADDR, wooPP.address])) as WooRouter

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)
      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R)

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
      console.log('Query selling 1 btc for usdt: ', amountNum, slippage)
    })

    it('querySwap accuracy1_2', async () => {
      const btcNum = 3
      const amount = await wooRouter.querySwap(btcToken.address, usdtToken.address, ONE.mul(btcNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE * btcNum
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 2.5)
      console.log('Query selling 3 btc for usdt: ', amountNum, slippage)
    })

    it('querySwap accuracy1_3', async () => {
      const btcNum = 10
      const amount = await wooRouter.querySwap(btcToken.address, usdtToken.address, ONE.mul(btcNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE * btcNum
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002 * 6.5)
      console.log('Query selling 10 btc for usdt: ', amountNum, slippage)
    })

    it('querySwap accuracy2', async () => {
      const amount = await wooRouter.querySwap(usdtToken.address, btcToken.address, ONE.mul(10000))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = 10000 / BTC_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.0002)
      console.log('Query selling 10000 usdt for btc: ', amountNum, slippage)
    })

    it('querySwap accuracy3_1', async () => {
      const wooNum = 25000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.003)
      console.log('Query selling 25000 woo for usdt: ', amountNum, slippage)
    })

    it('querySwap accuracy3_2', async () => {
      const wooNum = 200000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.3)
      console.log('Query selling 200000 woo for usdt: ', amountNum, slippage)
    })

    it('querySwap accuracy3_3', async () => {
      const wooNum = 1230000
      const amount = await wooRouter.querySwap(wooToken.address, usdtToken.address, ONE.mul(wooNum))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = wooNum * WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)
      const slippage = (benchmark - amountNum) / benchmark
      expect(slippage).to.lessThan(0.76)
      console.log('Query selling 1230000 woo for usdt: ', amountNum, slippage)
    })

    it('querySwap 2-routes accuracy1', async () => {
      const amount = await wooRouter.querySwap(btcToken.address, wooToken.address, ONE)
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = BTC_PRICE / WOO_PRICE
      expect(amountNum).to.lessThan(benchmark)

      const slippage = (benchmark - amountNum) / benchmark
      const slippageBenchmark = 0.02
      expect(slippage).to.lessThan(slippageBenchmark)
      console.log('Query selling 1 btc for woo: ', amountNum, slippage)
    })

    it('querySwap 2-routes accuracy2', async () => {
      const amount = await wooRouter.querySwap(wooToken.address, btcToken.address, ONE.mul(30000))
      const amountNum = Number(utils.formatEther(amount))
      const benchmark = (30000 * WOO_PRICE) / BTC_PRICE
      expect(amountNum).to.lessThan(benchmark)

      const slippage = (benchmark - amountNum) / benchmark
      const slippageBenchmark = 0.07
      expect(slippage).to.lessThan(slippageBenchmark)
      console.log('Query selling 30000 woo for btc: ', amountNum, slippage)
    })
  })

  describe('Swap Functions', () => {
    let wooPP: Contract
    let wooRouter: WooRouter

    beforeEach('Deploy WooRouter', async () => {
      wooPP = await deployContract(owner, WooPP, [usdtToken.address, wooracle.address, wooGuardian.address])
      wooRouter = (await deployContract(owner, WooRouterArtifact, [WBNB_ADDR, wooPP.address])) as WooRouter

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)
      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R)

      await btcToken.mint(wooPP.address, ONE.mul(100))
      await usdtToken.mint(wooPP.address, ONE.mul(8000000))
      await wooToken.mint(wooPP.address, ONE.mul(10000000))
    })

    it('swap btc -> usdt accuracy1', async () => {
      await btcToken.mint(user.address, ONE.mul(1))

      const name = 'Swap: btc -> usdt'
      const fromAmount = ONE.mul(1)
      const minToAmount = fromAmount.mul(BTC_PRICE).mul(999).div(1000)
      const price = BTC_PRICE
      const minSlippage = 0.0002
      await _testSwap(name, btcToken, usdtToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap btc -> usdt accuracy2', async () => {
      await btcToken.mint(user.address, ONE.mul(100))

      const name = 'Swap: btc -> usdt'
      const fromAmount = ONE.mul(50)
      const minToAmount = fromAmount.mul(BTC_PRICE).mul(99).div(100)
      const price = BTC_PRICE
      const minSlippage = 0.0065
      await _testSwap(name, btcToken, usdtToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap woo -> usdt accuracy1', async () => {
      await wooToken.mint(user.address, ONE.mul(999999))

      const name = 'Swap: woo -> usdt'
      const fromAmount = ONE.mul(10000)
      const minToAmount = fromAmount.mul(105).div(100).mul(95).div(100)
      const price = 1.05
      const minSlippage = 0.035
      await _testSwap(name, wooToken, usdtToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('Swap: woo -> usdt accuracy2', async () => {
      await wooToken.mint(user.address, ONE.mul(3000000))

      const name = 'Swap: woo -> usdt'
      const fromAmount = ONE.mul(200000)
      const minToAmount = fromAmount.mul(105).div(100).mul(70).div(100)
      const price = 1.05
      const minSlippage = 0.3
      await _testSwap(name, wooToken, usdtToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap btc -> woo accuracy1', async () => {
      await btcToken.mint(user.address, ONE.mul(3))

      const name = 'Swap: btc -> woo'
      const fromAmount = ONE.mul(1)
      const minToAmount = fromAmount.mul(BTC_PRICE).mul(100).div(105).mul(90).div(100)
      const price = BTC_PRICE / WOO_PRICE
      const minSlippage = 0.1
      console.log('minToAmount', utils.formatEther(minToAmount))
      await _testSwap(name, btcToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('Swap: btc -> woo accuracy2', async () => {
      await btcToken.mint(user.address, ONE.mul(100))

      const name = 'Swap: btc -> woo'
      const fromAmount = ONE.mul(10)
      const minToAmount = fromAmount.mul(BTC_PRICE).mul(100).div(105).mul(30).div(100)
      const price = BTC_PRICE / WOO_PRICE
      const minSlippage = 0.7
      await _testSwap(name, btcToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap usdt -> woo accuracy0', async () => {
      await usdtToken.mint(user.address, ONE.mul(20000))

      const name = 'Swap: usdt -> woo'
      const fromAmount = ONE.mul(3000)
      const minToAmount = fromAmount.mul(100).div(105).mul(99).div(100)
      const price = 1.0 / WOO_PRICE
      const minSlippage = 0.01
      await _testSwap(name, usdtToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap usdt -> woo accuracy1', async () => {
      await usdtToken.mint(user.address, ONE.mul(20000))

      const name = 'Swap: usdt -> woo'
      const fromAmount = ONE.mul(15000)
      const minToAmount = fromAmount.mul(100).div(105).mul(96).div(100)
      const price = 1.0 / WOO_PRICE
      const minSlippage = 0.04
      await _testSwap(name, usdtToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap usdt -> woo accuracy2', async () => {
      await usdtToken.mint(user.address, ONE.mul(200000))

      const name = 'Swap: usdt -> woo'
      const fromAmount = ONE.mul(BTC_PRICE)
      const minToAmount = fromAmount.mul(100).div(105).mul(90).div(100)
      const price = 1.0 / WOO_PRICE
      const minSlippage = 0.1
      await _testSwap(name, usdtToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('Swap: usdt -> woo accuracy3', async () => {
      await usdtToken.mint(user.address, ONE.mul(5000000))

      const name = 'Swap: usdt -> woo'
      const fromAmount = ONE.mul(200000)
      const minToAmount = fromAmount.mul(100).div(105).mul(50).div(100)
      const price = 1.0 / WOO_PRICE
      const minSlippage = 0.5
      await _testSwap(name, usdtToken, wooToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('swap usdt -> btc accuracy1', async () => {
      await usdtToken.mint(user.address, ONE.mul(20000))

      const name = 'Swap: usdt -> btc'
      const fromAmount = ONE.mul(15000)
      const minToAmount = fromAmount.div(BTC_PRICE).mul(999).div(1000)
      const price = 1.0 / BTC_PRICE
      const minSlippage = 0.0003
      await _testSwap(name, usdtToken, btcToken, fromAmount, minToAmount, price, minSlippage)
    })

    it('Swap: usdt -> btc accuracy2', async () => {
      await usdtToken.mint(user.address, ONE.mul(5000000))

      const name = 'Swap: usdt -> btc'
      const fromAmount = ONE.mul(3000000)
      const minToAmount = fromAmount.div(BTC_PRICE).mul(99).div(100)
      const price = 1.0 / BTC_PRICE
      const minSlippage = 0.008
      await _testSwap(name, usdtToken, btcToken, fromAmount, minToAmount, price, minSlippage)
    })

    // ----- Private test methods ----- //

    async function _testSwap(
      swapName: string,
      token0: Contract,
      token1: Contract,
      fromAmount: BigNumberish,
      minToAmount: BigNumberish,
      price: number,
      minSlippage: number
    ) {
      const preWooppToken0Amount = await wooPP.poolSize(token0.address)
      const preWooppToken1Amount = await wooPP.poolSize(token1.address)
      const preUserToken0Amount = await token0.balanceOf(user.address)
      const preUserToken1Amount = await token1.balanceOf(user.address)

      await token0.connect(user).approve(wooRouter.address, fromAmount)

      const realToAmount = await wooRouter
        .connect(user)
        .callStatic.swap(token0.address, token1.address, fromAmount, minToAmount, user.address, ZERO_ADDR)

      await wooRouter
        .connect(user)
        .swap(token0.address, token1.address, fromAmount, minToAmount, user.address, ZERO_ADDR)

      const toNum = Number(utils.formatEther(realToAmount))
      const fromNum = Number(utils.formatEther(fromAmount))
      const benchmark = price * fromNum
      expect(toNum).to.lessThan(benchmark)
      const slippage = (benchmark - toNum) / benchmark
      expect(slippage).to.lessThan(minSlippage)
      console.log(`${swapName}: ${fromNum} -> ${toNum} with slippage ${slippage}`)

      const curWooppToken0Amount = await wooPP.poolSize(token0.address)
      const curWooppToken1Amount = await wooPP.poolSize(token1.address)
      const curUserToken0Amount = await token0.balanceOf(user.address)
      const curUserToken1Amount = await token1.balanceOf(user.address)
      expect(curWooppToken0Amount.sub(preWooppToken0Amount)).to.eq(fromAmount)
      expect(preUserToken0Amount.sub(curUserToken0Amount)).to.eq(fromAmount)
      expect(preWooppToken1Amount.sub(curWooppToken1Amount)).to.eq(realToAmount)
      expect(curUserToken1Amount.sub(preUserToken1Amount)).to.eq(realToAmount)
    }
  })
})
