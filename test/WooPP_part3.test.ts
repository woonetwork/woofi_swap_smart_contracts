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
import WooGuardian from '../build/WooGuardian.json'
import TestToken from '../build/TestToken.json'
import AggregatorV3Interface from '../build/AggregatorV3Interface.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooPP } from '../typechain'
import WooPPArtifact from '../artifacts/contracts/WooPP.sol/WooPP.json'

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const BTC_PRICE = 65122
const WOO_PRICE = 1.3

const ONE = BigNumber.from(10).pow(18)

const WOOPP_BTC_BALANCE = utils.parseEther('100') // 100 btc
const WOOPP_USDT_BALANCE = utils.parseEther('10000000') // 10 million usdt
const WOOPP_WOO_BALANCE = utils.parseEther('5000000') // 5 million woo

describe('WooPP Test Suite 3', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress

  let wooracle: Contract
  let usdtToken: Contract
  let btcToken: Contract
  let wooToken: Contract
  let wooGuardian: Contract

  let usdtChainLinkRefOracle: Contract
  let btcChainLinkRefOracle: Contract
  let wooChainLinkRefOracle: Contract

  before('deploy tokens & wooracle', async () => {
    ;[owner, user1] = await ethers.getSigners()
    usdtToken = await deployContract(owner, TestToken, [])
    btcToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    wooracle = await deployMockContract(owner, IWooracle.abi)
    await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
    await wooracle.mock.price.withArgs(btcToken.address).returns(ONE.mul(BTC_PRICE), true)
    await wooracle.mock.state
      .withArgs(btcToken.address)
      .returns(ONE.mul(BTC_PRICE), BigNumber.from(10).pow(18).mul(1).div(10000), BigNumber.from(10).pow(9).mul(2), true)
    await wooracle.mock.state
      .withArgs(usdtToken.address)
      .returns(ONE, BigNumber.from(10).pow(18).mul(1).div(10000), BigNumber.from(10).pow(9).mul(2), true)

    wooGuardian = await deployContract(owner, WooGuardian, [utils.parseEther('0.01')])

    usdtChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await usdtChainLinkRefOracle.mock.decimals.returns(8)
    await usdtChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419103431'),
      BigNumber.from('100000974'), // 1.00 usdt
      BigNumber.from('1634749403'),
      BigNumber.from('1634749403'),
      BigNumber.from('36893488147419103431')
    )

    btcChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await btcChainLinkRefOracle.mock.decimals.returns(8)
    await btcChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419150348'),
      BigNumber.from('6512226000000'), // 65122 usdt
      BigNumber.from('1634801897'),
      BigNumber.from('1634801897'),
      BigNumber.from('36893488147419150348')
    )

    wooChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await wooChainLinkRefOracle.mock.decimals.returns(8)
    await wooChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419122884'),
      BigNumber.from('129952890'), // 1.29 usdt
      BigNumber.from('1634799201'),
      BigNumber.from('1634799201'),
      BigNumber.from('36893488147419122884')
    )

    await wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
    await wooGuardian.setToken(btcToken.address, btcChainLinkRefOracle.address)
    await wooGuardian.setToken(wooToken.address, wooChainLinkRefOracle.address)
  })

  describe('Swap test with guardian', () => {
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

      await usdtToken.mint(wooPP.address, WOOPP_USDT_BALANCE)
      await btcToken.mint(wooPP.address, WOOPP_BTC_BALANCE)
      await wooToken.mint(wooPP.address, WOOPP_WOO_BALANCE)
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
      const quoteAmount = ONE.mul(BTC_PRICE)
      const minBaseAmount = ONE.mul(999).div(1000)

      const baseBigAmount = await wooPP.querySellQuote(btcToken.address, quoteAmount)

      console.log('Swap btc_price usdt for BTC: ', utils.formatEther(baseBigAmount))

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

    it('sellBase with quote and revert', async () => {
      await usdtToken.mint(user1.address, ONE.mul(1000000))
      const preUserUsdt = await usdtToken.balanceOf(user1.address)
      const preUserBtc = await usdtToken.balanceOf(user1.address)

      const baseAmount = ONE.mul(1000)
      const minQuoteAmount = ONE.mul(998)

      await expect(
        wooPP.connect(user1).sellBase(usdtToken.address, baseAmount, minQuoteAmount, user1.address, ZERO_ADDR)
      ).to.be.revertedWith('WooPP: baseToken==quoteToken')
    })
  })
})
