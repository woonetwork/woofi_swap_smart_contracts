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
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

// import WooPP from '../build/WooPP.json'
import IERC20 from '../build/IERC20.json'
import IWooracle from '../build/IWooracle.json'
import IWooGuardian from '../build/IWooGuardian.json'
import IRewardManager from '../build/IRewardManager.json'
import TestToken from '../build/TestToken.json'
import { basename } from 'path/posix'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooPP } from '../typechain'
import WooPPArtifact from '../artifacts/contracts/WooPP.sol/WooPP.json'

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const BTC_PRICE = 50000
const WOO_PRICE = 0.85

const ONE = BigNumber.from(10).pow(18)

const WOOPP_BTC_BALANCE = utils.parseEther('100') // 100 btc
const WOOPP_USDT_BALANCE = utils.parseEther('10000000') // 10 million usdt
const WOOPP_WOO_BALANCE = utils.parseEther('5000000') // 5 million woo

describe('WooPP Test Suite 2', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress

  let wooracle: Contract
  let wooGuardian: Contract
  let usdtToken: Contract
  let btcToken: Contract
  let wooToken: Contract
  let rewardManager: Contract

  before('deploy tokens & wooracle', async () => {
    ;[owner, user1, user2] = await ethers.getSigners()
    usdtToken = await deployContract(owner, TestToken, [])
    btcToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    wooracle = await deployMockContract(owner, IWooracle.abi)
    await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
    await wooracle.mock.price.withArgs(btcToken.address).returns(ONE.mul(BTC_PRICE), true)
    await wooracle.mock.state
      .withArgs(btcToken.address)
      .returns(ONE.mul(BTC_PRICE), BigNumber.from(10).pow(18).mul(1).div(10000), BigNumber.from(10).pow(9).mul(2), true)

    wooGuardian = await deployMockContract(owner, IWooGuardian.abi)
    await wooGuardian.mock.checkSwapPrice.returns()
    await wooGuardian.mock.checkSwapAmount.returns()
    await wooGuardian.mock.checkInputAmount.returns()

    rewardManager = await deployMockContract(owner, IRewardManager.abi)
    await rewardManager.mock.addReward.returns()
  })

  describe('swap func', () => {
    let wooPP: WooPP

    beforeEach('deploy WooPP & Tokens', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        usdtToken.address,
        wooracle.address,
        wooGuardian.address,
      ])) as WooPP

      const threshold = 0
      // const lpFeeRate = BigNumber.from(10).pow(18).mul(1).div(1000)
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)
      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R)

      await usdtToken.mint(wooPP.address, WOOPP_USDT_BALANCE)
      await btcToken.mint(wooPP.address, WOOPP_BTC_BALANCE)
      await wooToken.mint(wooPP.address, WOOPP_WOO_BALANCE)

      await wooPP.connect(owner).setRewardManager(rewardManager.address)
      expect(await wooPP.rewardManager()).to.be.eq(rewardManager.address)
    })

    it('querySellBase accuracy1', async () => {
      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      const quoteBigAmount = await wooPP.querySellBase(btcToken.address, baseAmount)

      console.log('Sell 1 BTC for: ', utils.formatEther(quoteBigAmount))

      const quoteNum = Number(utils.formatEther(quoteBigAmount))
      const minQuoteNum = Number(utils.formatEther(minQuoteAmount))
      const benchmarkNum = 50000

      expect(quoteNum).to.greaterThanOrEqual(minQuoteNum)
      expect((benchmarkNum - quoteNum) / benchmarkNum).to.lessThan(0.0002)
    })

    it('querySellQuote accuracy1', async () => {
      const quoteAmount = ONE.mul(50000)
      const minBaseAmount = ONE.mul(999).div(1000)

      const baseBigAmount = await wooPP.querySellQuote(btcToken.address, quoteAmount)

      console.log('Swap 50000 usdt for BTC: ', utils.formatEther(baseBigAmount))

      const baseNumber = Number(utils.formatEther(baseBigAmount))
      const minBaseNum = Number(utils.formatEther(minBaseAmount))
      const benchmarkNum = 1

      expect(baseNumber).to.greaterThanOrEqual(minBaseNum)
      expect((benchmarkNum - baseNumber) / benchmarkNum).to.lessThan(0.0002)
    })

    it('sellBase accuracy1', async () => {
      await btcToken.mint(user1.address, ONE.mul(3))
      const preUserUsdt = await usdtToken.balanceOf(user1.address)
      const preUserBtc = await btcToken.balanceOf(user1.address)

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      const preWooppUsdtSize = await wooPP.poolSize(usdtToken.address)
      const preBtcSize = await wooPP.poolSize(btcToken.address)

      const quoteAmount = await wooPP.querySellBase(btcToken.address, baseAmount)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))
      await wooPP.connect(user1).sellBase(btcToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)

      const wppUsdtSize = await wooPP.poolSize(usdtToken.address)
      expect(preWooppUsdtSize.sub(wppUsdtSize)).to.eq(quoteAmount)

      const userUsdt = await usdtToken.balanceOf(user1.address)
      expect(preWooppUsdtSize.sub(wppUsdtSize)).to.eq(userUsdt.sub(preUserUsdt))

      const btcSize = await wooPP.poolSize(btcToken.address)
      expect(btcSize.sub(preBtcSize)).to.eq(baseAmount)

      const userBtc = await btcToken.balanceOf(user1.address)
      expect(btcSize.sub(preBtcSize)).to.eq(preUserBtc.sub(userBtc))

      console.log('user1 usdt: ', utils.formatEther(preUserUsdt), utils.formatEther(userUsdt))
      console.log('user1 btc: ', utils.formatEther(preUserBtc), utils.formatEther(userBtc))

      console.log('owner usdt: ', utils.formatEther(await usdtToken.balanceOf(owner.address)))
      console.log('owner btc: ', utils.formatEther(await btcToken.balanceOf(owner.address)))

      console.log('wooPP usdt: ', utils.formatEther(preWooppUsdtSize), utils.formatEther(wppUsdtSize))
      console.log('wooPP btc: ', utils.formatEther(preBtcSize), utils.formatEther(btcSize))
    })

    it('sellBase accuracy2', async () => {
      await btcToken.mint(user1.address, ONE.mul(3))

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))
      for (let i = 0; i < 3; i += 1) {
        let quoteAmount = await wooPP.querySellBase(btcToken.address, baseAmount)

        let preUserUsdt = await usdtToken.balanceOf(user1.address)
        let preUserBtc = await btcToken.balanceOf(user1.address)

        let preWooppUsdtSize = await wooPP.poolSize(usdtToken.address)
        let preBtcSize = await wooPP.poolSize(btcToken.address)

        await wooPP.connect(user1).sellBase(btcToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)

        let wppUsdtSize = await wooPP.poolSize(usdtToken.address)
        expect(preWooppUsdtSize.sub(wppUsdtSize)).to.eq(quoteAmount)

        let userUsdt = await usdtToken.balanceOf(user1.address)
        expect(preWooppUsdtSize.sub(wppUsdtSize)).to.eq(userUsdt.sub(preUserUsdt))

        let btcSize = await wooPP.poolSize(btcToken.address)
        expect(btcSize.sub(preBtcSize)).to.eq(baseAmount)

        let userBtc = await btcToken.balanceOf(user1.address)
        expect(btcSize.sub(preBtcSize)).to.eq(preUserBtc.sub(userBtc))
      }
    })

    it('sellQuote accuracy1', async () => {
      await usdtToken.mint(user1.address, ONE.mul(100000))
      const preUserUsdt = await usdtToken.balanceOf(user1.address)
      const preUserBtc = await btcToken.balanceOf(user1.address)

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(999).div(1000)

      const preUsdtSize = await wooPP.poolSize(usdtToken.address)
      const preBtcSize = await wooPP.poolSize(btcToken.address)

      const baseAmount = await wooPP.querySellQuote(btcToken.address, quoteAmount)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))
      await wooPP.connect(user1).sellQuote(btcToken.address, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)

      const usdtSize = await wooPP.poolSize(usdtToken.address)
      expect(usdtSize.sub(preUsdtSize)).to.eq(quoteAmount)

      const userUsdt = await usdtToken.balanceOf(user1.address)
      expect(usdtSize.sub(preUsdtSize)).to.eq(preUserUsdt.sub(userUsdt))

      const btcSize = await wooPP.poolSize(btcToken.address)
      expect(preBtcSize.sub(btcSize)).to.eq(baseAmount)

      const userBtc = await btcToken.balanceOf(user1.address)
      expect(preBtcSize.sub(btcSize)).to.eq(userBtc.sub(preUserBtc))

      console.log('user1 usdt: ', utils.formatEther(preUserUsdt), utils.formatEther(userUsdt))
      console.log('user1 btc: ', utils.formatEther(preUserBtc), utils.formatEther(userBtc))

      console.log('owner usdt: ', utils.formatEther(await usdtToken.balanceOf(owner.address)))
      console.log('owner btc: ', utils.formatEther(await btcToken.balanceOf(owner.address)))

      console.log('wooPP usdt: ', utils.formatEther(preUsdtSize), utils.formatEther(usdtSize))
      console.log('wooPP btc: ', utils.formatEther(preBtcSize), utils.formatEther(btcSize))
    })

    it('sellQuote accuracy2', async () => {
      await usdtToken.mint(user1.address, ONE.mul(300000))

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(999).div(1000)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))
      for (let i = 0; i < 3; i += 1) {
        let preUserUsdt = await usdtToken.balanceOf(user1.address)
        let preUserBtc = await btcToken.balanceOf(user1.address)

        let preUsdtSize = await wooPP.poolSize(usdtToken.address)
        let preBtcSize = await wooPP.poolSize(btcToken.address)

        let baseAmount = await wooPP.querySellQuote(btcToken.address, quoteAmount)

        await wooPP.connect(user1).sellQuote(btcToken.address, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)

        let usdtSize = await wooPP.poolSize(usdtToken.address)
        expect(usdtSize.sub(preUsdtSize)).to.eq(quoteAmount)

        let userUsdt = await usdtToken.balanceOf(user1.address)
        expect(usdtSize.sub(preUsdtSize)).to.eq(preUserUsdt.sub(userUsdt))

        let btcSize = await wooPP.poolSize(btcToken.address)
        expect(preBtcSize.sub(btcSize)).to.eq(baseAmount)

        let userBtc = await btcToken.balanceOf(user1.address)
        expect(preBtcSize.sub(btcSize)).to.eq(userBtc.sub(preUserBtc))
      }
    })

    it('querySellBase reverted with zero addr', async () => {
      const baseAmount = ONE.mul(1)

      await expect(wooPP.querySellBase(ZERO_ADDR, baseAmount)).to.be.revertedWith('WooPP: baseToken_ZERO_ADDR')
    })

    it('querySellBase reverted with token not exist', async () => {
      let testToken = await deployContract(owner, TestToken, [])
      const baseAmount = ONE.mul(1)

      await expect(wooPP.querySellBase(testToken.address, baseAmount)).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('querySellBase reverted with quoteAmount greater than balance', async () => {
      let newWooPP = await deployContract(owner, WooPPArtifact, [
        usdtToken.address,
        wooracle.address,
        wooGuardian.address,
      ])

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await newWooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)

      let mintUsdtBalance = utils.parseEther('20000')
      let mintBtcBalance = utils.parseEther('1')
      await usdtToken.mint(newWooPP.address, mintUsdtBalance)
      await btcToken.mint(newWooPP.address, mintBtcBalance)

      const baseAmount = ONE.mul(1)

      await expect(newWooPP.querySellBase(btcToken.address, baseAmount)).to.be.revertedWith('WooPP: INSUFF_QUOTE')
    })

    it('querySellQuote reverted with zero addr', async () => {
      const quoteAmount = ONE.mul(50000)

      await expect(wooPP.querySellQuote(ZERO_ADDR, quoteAmount)).to.be.revertedWith('WooPP: baseToken_ZERO_ADDR')
    })

    it('querySellQuote reverted with token not exist', async () => {
      let testToken = await deployContract(owner, TestToken, [])
      const quoteAmount = ONE.mul(50000)

      await expect(wooPP.querySellBase(testToken.address, quoteAmount)).to.be.revertedWith(
        'WooPP: TOKEN_DOES_NOT_EXIST'
      )
    })

    it('querySellQuote reverted with baseAmount greater than balance', async () => {
      let newWooPP = await deployContract(owner, WooPPArtifact, [
        usdtToken.address,
        wooracle.address,
        wooGuardian.address,
      ])

      const threshold = 0
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await newWooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)

      let mintUsdtBalance = utils.parseEther('20000')
      let mintBtcBalance = utils.parseEther('1')
      await usdtToken.mint(newWooPP.address, mintUsdtBalance)
      await btcToken.mint(newWooPP.address, mintBtcBalance)

      const quoteAmount = ONE.mul(60000)

      await expect(newWooPP.querySellQuote(btcToken.address, quoteAmount)).to.be.revertedWith('WooPP: INSUFF_BASE')
    })

    it('sellBase reverted with zero addr', async () => {
      await btcToken.mint(user1.address, ONE.mul(3))

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))

      await expect(
        wooPP.connect(user1).sellBase(ZERO_ADDR, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: baseToken_ZERO_ADDR')

      await expect(
        wooPP.connect(user1).sellBase(btcToken.address, baseAmount, minQuoteAmount, ZERO_ADDR, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    })

    it('sellBase reverted with token not exist', async () => {
      let testToken = await deployContract(owner, TestToken, [])
      await testToken.mint(user1.address, ONE.mul(3))

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      await testToken.connect(user1).approve(wooPP.address, ONE.mul(100))

      await expect(
        wooPP.connect(user1).sellBase(testToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('sellBase reverted with quoteAmount less that minQuoteAmount', async () => {
      await btcToken.mint(user1.address, ONE.mul(3))

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(2)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))

      await expect(
        wooPP.connect(user1).sellBase(btcToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: quoteAmount<minQuoteAmount')
    })

    it('sellBase emit WooSwap event', async () => {
      await btcToken.mint(user1.address, ONE.mul(3))

      const baseAmount = ONE.mul(1)
      const minQuoteAmount = ONE.mul(BTC_PRICE).mul(999).div(1000)

      const quoteAmount = await wooPP.querySellBase(btcToken.address, baseAmount)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))

      await expect(
        wooPP.connect(user1).sellBase(btcToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)
      )
        .to.emit(wooPP, 'WooSwap')
        .withArgs(btcToken.address, usdtToken.address, baseAmount, quoteAmount, user1.address, user1.address)
    })

    it('sellQuote reverted with zero addr', async () => {
      await usdtToken.mint(user1.address, ONE.mul(100000))

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(999).div(1000)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))

      await expect(
        wooPP.connect(user1).sellQuote(ZERO_ADDR, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: baseToken_ZERO_ADDR')

      await expect(
        wooPP.connect(user1).sellQuote(btcToken.address, quoteAmount, minBaseAmount, ZERO_ADDR, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    })

    it('sellQuote reverted with token not exist', async () => {
      let testToken = await deployContract(owner, TestToken, [])
      await usdtToken.mint(user1.address, ONE.mul(100000))

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(999).div(1000)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))

      await expect(
        wooPP.connect(user1).sellQuote(testToken.address, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('sellQuote reverted with price exceeds limit', async () => {
      await usdtToken.mint(user1.address, ONE.mul(100000))

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(3)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))

      await expect(
        wooPP.connect(user1).sellQuote(btcToken.address, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: baseAmount<minBaseAmount')
    })

    it('sellQuote emit WooSwap event', async () => {
      await usdtToken.mint(user1.address, ONE.mul(100000))

      const quoteAmount = ONE.mul(100000)
      const minBaseAmount = ONE.mul(999).div(1000)

      const baseAmount = await wooPP.querySellQuote(btcToken.address, quoteAmount)

      await usdtToken.connect(user1).approve(wooPP.address, ONE.mul(1000000))

      await expect(
        wooPP.connect(user1).sellQuote(btcToken.address, quoteAmount, minBaseAmount, user1.address, ZERO_ADDR)
      )
        .to.emit(wooPP, 'WooSwap')
        .withArgs(usdtToken.address, btcToken.address, quoteAmount, baseAmount, user1.address, user1.address)
    })
  })

  describe('access control', () => {
    let wooPP: WooPP
    let wooracle: Contract
    let usdtToken: Contract
    let btcToken: Contract
    let wooToken: Contract

    before('deploy tokens & wooracle', async () => {
      usdtToken = await deployContract(owner, TestToken, [])
      btcToken = await deployContract(owner, TestToken, [])
      wooToken = await deployContract(owner, TestToken, [])
      wooracle = await deployMockContract(owner, IWooracle.abi)

      await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
      await wooracle.mock.price.withArgs(btcToken.address).returns(ONE.mul(BTC_PRICE), true)
      await wooracle.mock.state
        .withArgs(btcToken.address)
        .returns(
          ONE.mul(BTC_PRICE),
          BigNumber.from(10).pow(18).mul(1).div(10000),
          BigNumber.from(10).pow(9).mul(2),
          true
        )
    })

    beforeEach('deploy WooPP & Tokens', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        usdtToken.address,
        wooracle.address,
        wooGuardian.address,
      ])) as WooPP

      const threshold = 0
      // const lpFeeRate = BigNumber.from(10).pow(18).mul(1).div(1000)
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)

      await wooPP.connect(owner).setStrategist(user1.address, true)
      expect(await wooPP.isStrategist(user1.address)).to.be.equal(true)

      await usdtToken.mint(wooPP.address, WOOPP_USDT_BALANCE)
      await btcToken.mint(wooPP.address, WOOPP_BTC_BALANCE)
      await wooToken.mint(wooPP.address, WOOPP_WOO_BALANCE)
    })

    it('setStrategist', async () => {
      await wooPP.connect(owner).setStrategist(user2.address, true)
      expect(await wooPP.isStrategist(user2.address)).to.be.equal(true)
      await wooPP.connect(owner).setStrategist(user2.address, false)
      expect(await wooPP.isStrategist(user2.address)).to.be.equal(false)
    })

    it('Prevents non-strategists from setStrategist', async () => {
      await expect(wooPP.connect(user2).setStrategist(user2.address, true)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('Prevents zero addr from setStrategist', async () => {
      await expect(wooPP.connect(owner).setStrategist(ZERO_ADDR, true)).to.be.revertedWith(
        'WooPP: strategist_ZERO_ADDR'
      )
    })

    it('setStrategist emit StrategistUpdated event', async () => {
      await expect(wooPP.connect(owner).setStrategist(user2.address, true))
        .to.emit(wooPP, 'StrategistUpdated')
        .withArgs(user2.address, true)
      await expect(wooPP.connect(owner).setStrategist(user2.address, false))
        .to.emit(wooPP, 'StrategistUpdated')
        .withArgs(user2.address, false)
    })

    it('withdraw', async () => {
      expect(await btcToken.balanceOf(wooPP.address)).to.be.equal(WOOPP_BTC_BALANCE)
      expect(await btcToken.balanceOf(user1.address)).to.be.equal(0)
      await wooPP.withdraw(btcToken.address, user1.address, ONE)
      expect(await btcToken.balanceOf(user1.address)).to.be.equal(ONE)
    })

    it('Prevents zero addr from withdraw', async () => {
      await expect(wooPP.withdraw(ZERO_ADDR, user1.address, ONE)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
      await expect(wooPP.withdraw(btcToken.address, ZERO_ADDR, ONE)).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    })

    it('Prevents non-owners from withdraw', async () => {
      await expect(wooPP.connect(user2).withdraw(btcToken.address, user2.address, ONE)).to.be.revertedWith(
        'InitializableOwnable: NOT_OWNER'
      )
    })

    it('withdraw emit Withdraw event', async () => {
      await expect(wooPP.withdraw(btcToken.address, user1.address, ONE))
        .to.emit(wooPP, 'Withdraw')
        .withArgs(btcToken.address, user1.address, ONE)
    })

    it('withdrawAll', async () => {
      expect(await btcToken.balanceOf(wooPP.address)).to.be.equal(WOOPP_BTC_BALANCE)
      expect(await btcToken.balanceOf(user2.address)).to.be.equal(0)
      await wooPP.connect(owner).withdrawAll(btcToken.address, user2.address)
      expect(await btcToken.balanceOf(user2.address)).to.be.equal(WOOPP_BTC_BALANCE)
    })

    it('Prevents non-owners from withdrawAll', async () => {
      await expect(wooPP.connect(user2).withdrawAll(btcToken.address, user2.address)).to.be.revertedWith(
        'InitializableOwnable: NOT_OWNER'
      )
    })

    it('withdrawToOwner', async () => {
      expect(await btcToken.balanceOf(wooPP.address)).to.be.equal(WOOPP_BTC_BALANCE)
      expect(await btcToken.balanceOf(owner.address)).to.be.equal(0)
      await wooPP.connect(user1).withdrawAllToOwner(btcToken.address)
      expect(await btcToken.balanceOf(owner.address)).to.be.equal(WOOPP_BTC_BALANCE)
    })

    it('Prevents non-strategists from withdrawToOwner', async () => {
      await expect(wooPP.connect(user2).withdrawAllToOwner(btcToken.address)).to.be.revertedWith(
        'WooPP: NOT_STRATEGIST'
      )
    })

    it('Prevents zero addr from withdrawToOwner', async () => {
      await expect(wooPP.withdrawAllToOwner(ZERO_ADDR)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    })

    it('withdrawToOwner emit Withdraw event', async () => {
      const poolSize = await wooPP.poolSize(btcToken.address)
      await expect(wooPP.connect(user1).withdrawAllToOwner(btcToken.address))
        .to.emit(wooPP, 'Withdraw')
        .withArgs(btcToken.address, owner.address, poolSize)
    })

    it('setPairsInfo', async () => {
      let newPairsInfo = 'test'
      await wooPP.connect(user1).setPairsInfo(newPairsInfo)
      expect(await wooPP.pairsInfo()).to.be.equal(newPairsInfo)
    })

    it('Prevents non-strategists from setPairsInfo', async () => {
      let newPairsInfo = 'test'
      await expect(wooPP.connect(user2).setPairsInfo(newPairsInfo)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('setWooracle', async () => {
      let newWooracle = await deployMockContract(owner, IWooracle.abi)
      await wooPP.connect(user1).setWooracle(newWooracle.address)
      expect(await wooPP.wooracle()).to.be.equal(newWooracle.address)
    })

    it('Prevents non-strategists from setWooracle', async () => {
      let newWooracle = await deployMockContract(owner, IWooracle.abi)

      await expect(wooPP.connect(user2).setWooracle(newWooracle.address)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('Prevents zero addr from setWooracle', async () => {
      await expect(wooPP.connect(user1).setWooracle(ZERO_ADDR)).to.be.revertedWith('WooPP: newWooracle_ZERO_ADDR')
    })

    it('setWooracle emit WooracleUpdated event', async () => {
      let newWooracle = await deployMockContract(owner, IWooracle.abi)
      await expect(wooPP.connect(user1).setWooracle(newWooracle.address))
        .to.emit(wooPP, 'WooracleUpdated')
        .withArgs(newWooracle.address)
    })

    it('setRewardManager', async () => {
      await wooPP.connect(user1).setRewardManager(user2.address)
      expect(await wooPP.rewardManager()).to.be.equal(user2.address)
    })

    it('Prevents non-strategists from setRewardManager', async () => {
      await expect(wooPP.connect(user2).setRewardManager(user2.address)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('setRewardManager emit RewardManagerUpdated event', async () => {
      await expect(wooPP.connect(user1).setRewardManager(user2.address))
        .to.emit(wooPP, 'RewardManagerUpdated')
        .withArgs(user2.address)
    })

    it('setWooGuardian', async () => {
      await wooPP.connect(owner).setWooGuardian(wooGuardian.address)
      expect(await wooPP.wooGuardian()).to.be.equal(wooGuardian.address)
    })

    it('Prevents zero addr from setWooGuardian', async () => {
      await expect(wooPP.connect(owner).setWooGuardian(ZERO_ADDR)).to.be.revertedWith('WooPP: newWooGuardian_ZERO_ADDR')
    })

    it('Prevents non-strategists from setWooGuardian', async () => {
      await expect(wooPP.connect(user2).setWooGuardian(wooGuardian.address)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('setWooGuardian emit WooGuardianUpdated event', async () => {
      await expect(wooPP.connect(owner).setWooGuardian(wooGuardian.address))
        .to.emit(wooPP, 'WooGuardianUpdated')
        .withArgs(wooGuardian.address)
    })

    it('addBaseToken', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      await wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, R)
      let info = await wooPP.tokenInfo(wooToken.address)
      expect(await info.isValid).to.be.equal(true)
    })

    it('Prevents non-strategists from addBaseToken', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      await expect(wooPP.connect(user2).addBaseToken(wooToken.address, threshold, lpFeeRate, R)).to.be.revertedWith(
        'WooPP: NOT_STRATEGIST'
      )
    })

    it('addBaseToken reverted with zero addr', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      await expect(wooPP.addBaseToken(ZERO_ADDR, threshold, lpFeeRate, R)).to.be.revertedWith(
        'WooPP: BASE_TOKEN_ZERO_ADDR'
      )
    })

    it('addBaseToken reverted with base token invalid', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      await expect(wooPP.addBaseToken(usdtToken.address, threshold, lpFeeRate, R)).to.be.revertedWith(
        'WooPP: baseToken==quoteToken'
      )
    })

    it('addBaseToken reverted with threshold out of range', async () => {
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      let overRangeThreshold = BigNumber.from(2).pow(112)
      await expect(wooPP.addBaseToken(wooToken.address, overRangeThreshold, lpFeeRate, R)).to.be.revertedWith(
        'WooPP: THRESHOLD_OUT_OF_RANGE'
      )
    })

    it('addBaseToken reverted with lp fee rate out of range', async () => {
      let threshold = 0
      let R = BigNumber.from(0)

      let overRangeLpFeeRate = ONE.mul(2)
      await expect(wooPP.addBaseToken(wooToken.address, threshold, overRangeLpFeeRate, R)).to.be.revertedWith(
        'WooPP: LP_FEE_RATE_OUT_OF_RANGE'
      )
    })

    it('addBaseToken reverted with r out of range', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      let overRangeR = ONE.mul(2)
      await expect(wooPP.addBaseToken(wooToken.address, threshold, lpFeeRate, overRangeR)).to.be.revertedWith(
        'WooPP: R_OUT_OF_RANGE'
      )
    })

    it('addBaseToken reverted with token exist', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      await expect(wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R)).to.be.revertedWith(
        'WooPP: TOKEN_ALREADY_EXISTS'
      )
    })

    it('addBaseToken emit ParametersUpdated event', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      let testEventToken0 = await deployContract(owner, TestToken, [])
      await expect(wooPP.addBaseToken(testEventToken0.address, threshold, lpFeeRate, R))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(testEventToken0.address, threshold, lpFeeRate, R)
    })

    it('removeBaseToken', async () => {
      await wooPP.removeBaseToken(btcToken.address)
      let info = await wooPP.tokenInfo(btcToken.address)
      expect(info.isValid).to.be.equal(false)
    })

    it('Prevents non-strategists from removeBaseToken', async () => {
      await expect(wooPP.connect(user2).removeBaseToken(btcToken.address)).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('removeBaseToken reverted with zero addr', async () => {
      await expect(wooPP.removeBaseToken(ZERO_ADDR)).to.be.revertedWith('WooPP: BASE_TOKEN_ZERO_ADDR')
    })

    it('removeBaseToken reverted with token not exist', async () => {
      await expect(wooPP.removeBaseToken(wooToken.address)).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('removeBaseToken emit event', async () => {
      let threshold = 0
      let lpFeeRate = 0
      let R = BigNumber.from(0)

      let testEventToken0 = await deployContract(owner, TestToken, [])
      await wooPP.addBaseToken(testEventToken0.address, threshold, lpFeeRate, R)
      await expect(wooPP.removeBaseToken(testEventToken0.address))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(testEventToken0.address, 0, 0, 0)
    })

    it('tuneParameters', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      await wooPP.tuneParameters(btcToken.address, newThreshold, newLpFeeRate, newR)
      let info = await wooPP.tokenInfo(btcToken.address)
      expect(await info.threshold).to.be.equal(newThreshold)
      expect(await info.lpFeeRate).to.be.equal(newLpFeeRate)
      expect(await info.R).to.be.equal(newR)
    })

    it('Prevents non-strategists from tuneParameters', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      await expect(
        wooPP.connect(user2).tuneParameters(btcToken.address, newThreshold, newLpFeeRate, newR)
      ).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('tuneParameters reverted with zero addr', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      await expect(wooPP.tuneParameters(ZERO_ADDR, newThreshold, newLpFeeRate, newR)).to.be.revertedWith(
        'WooPP: token_ZERO_ADDR'
      )
    })

    it('tuneParameters reverted with threshold out of range', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      let overRangeThreshold = BigNumber.from(2).pow(112)
      await expect(wooPP.tuneParameters(btcToken.address, overRangeThreshold, newLpFeeRate, newR)).to.be.revertedWith(
        'WooPP: THRESHOLD_OUT_OF_RANGE'
      )
    })

    it('tuneParameters reverted with lp fee rate greater than one', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      let overRangeLpFeeRate = ONE.mul(2)
      await expect(wooPP.tuneParameters(btcToken.address, newThreshold, overRangeLpFeeRate, newR)).to.be.revertedWith(
        'WooPP: LP_FEE_RATE>1'
      )
    })

    it('tuneParameters reverted with R greater than one', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      let overRangeR = ONE.mul(2)
      await expect(wooPP.tuneParameters(btcToken.address, newThreshold, newLpFeeRate, overRangeR)).to.be.revertedWith(
        'WooPP: R>1'
      )
    })

    it('tuneParameters reverted with token dose not exist', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      await expect(wooPP.tuneParameters(wooToken.address, newThreshold, newLpFeeRate, newR)).to.be.revertedWith(
        'WooPP: TOKEN_DOES_NOT_EXIST'
      )
    })

    it('tuneParameters emit ParametersUpdated event', async () => {
      let newThreshold = ONE.div(2)
      let newLpFeeRate = ONE.div(2)
      let newR = ONE.div(2)

      await wooPP.addBaseToken(wooToken.address, 0, 0, 0)
      await expect(wooPP.tuneParameters(wooToken.address, newThreshold, newLpFeeRate, newR))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(wooToken.address, newThreshold, newLpFeeRate, newR)
    })

    it('Prevents non-strategists from pause', async () => {
      await expect(wooPP.connect(user2).pause()).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('Prevents non-strategists from unpause', async () => {
      await expect(wooPP.connect(user2).unpause()).to.be.revertedWith('WooPP: NOT_STRATEGIST')
    })

    it('paused accuracy1', async () => {
      expect(await wooPP.paused()).to.eq(false)
      await wooPP.pause()
      expect(await wooPP.paused()).to.eq(true)
    })

    it('paused accuracy2', async () => {
      expect(await wooPP.paused()).to.eq(false)
      await wooPP.pause()
      expect(await wooPP.paused()).to.eq(true)
      await wooPP.unpause()
      expect(await wooPP.paused()).to.eq(false)
    })

    it('paused revert1', async () => {
      await wooPP.pause()
      expect(await wooPP.paused()).to.eq(true)

      await expect(wooPP.querySellBase(btcToken.address, ONE)).to.be.revertedWith('Pausable: paused')

      await expect(wooPP.querySellQuote(btcToken.address, ONE.mul(50000))).to.be.revertedWith('Pausable: paused')

      // await wooPP.unpause()

      await expect(wooPP.sellBase(btcToken.address, ONE, ONE.mul(49900), owner.address, ZERO_ADDR)).to.be.revertedWith(
        'Pausable: paused'
      )

      await expect(wooPP.sellQuote(btcToken.address, ONE.mul(50500), ONE, owner.address, ZERO_ADDR)).to.be.revertedWith(
        'Pausable: paused'
      )
    })
  })
})
