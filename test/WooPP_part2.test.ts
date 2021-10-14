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
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

import WooPP from '../build/WooPP.json'
import IERC20 from '../build/IERC20.json'
import IWooracle from '../build/IWooracle.json'
import TestToken from '../build/TestToken.json'
import { basename } from 'path/posix'

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
  const [owner, user1, user2] = new MockProvider().getWallets()

  describe('', () => {
    let wooPP: Contract
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
      await wooracle.mock.getPrice.withArgs(btcToken.address).returns(ONE.mul(BTC_PRICE), true)
      await wooracle.mock.getState
        .withArgs(btcToken.address)
        .returns(
          ONE.mul(BTC_PRICE),
          BigNumber.from(10).pow(18).mul(1).div(10000),
          BigNumber.from(10).pow(9).mul(2),
          true
        )

      // await usdtToken.mint(owner.address, ONE.mul(100000));
      // await btcToken.mint(owner.address, ONE.mul(1));
    })

    beforeEach('deploy WooPP & Tokens', async () => {
      wooPP = await deployContract(owner, WooPP, [usdtToken.address, wooracle.address, ZERO_ADDR])

      const threshold = 0
      // const lpFeeRate = BigNumber.from(10).pow(18).mul(1).div(1000)
      const lpFeeRate = 0
      const R = BigNumber.from(0)
      await wooPP.addBaseToken(btcToken.address, threshold, lpFeeRate, R, ZERO_ADDR)

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

      const preUsdtSize = await wooPP.poolSize(usdtToken.address)
      const preBtcSize = await wooPP.poolSize(btcToken.address)

      const quoteAmount = await wooPP.querySellBase(btcToken.address, baseAmount)

      await btcToken.connect(user1).approve(wooPP.address, ONE.mul(100))
      await wooPP
        .connect(user1)
        .sellBase(btcToken.address, baseAmount, minQuoteAmount, user1.address, user1.address, ZERO_ADDR)

      const usdtSize = await wooPP.poolSize(usdtToken.address)
      expect(preUsdtSize.sub(usdtSize)).to.eq(quoteAmount)

      const userUsdt = await usdtToken.balanceOf(user1.address)
      expect(preUsdtSize.sub(usdtSize)).to.eq(userUsdt.sub(preUserUsdt))

      const btcSize = await wooPP.poolSize(btcToken.address)
      expect(btcSize.sub(preBtcSize)).to.eq(baseAmount)

      const userBtc = await btcToken.balanceOf(user1.address)
      expect(btcSize.sub(preBtcSize)).to.eq(preUserBtc.sub(userBtc))

      console.log('user1 usdt: ', utils.formatEther(preUserUsdt), utils.formatEther(userUsdt))
      console.log('user1 btc: ', utils.formatEther(preUserBtc), utils.formatEther(userBtc))

      console.log('owner usdt: ', utils.formatEther(await usdtToken.balanceOf(owner.address)))
      console.log('owner btc: ', utils.formatEther(await btcToken.balanceOf(owner.address)))

      console.log('wooPP usdt: ', utils.formatEther(preUsdtSize), utils.formatEther(usdtSize))
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
      await wooPP
        .connect(user1)
        .sellQuote(
          btcToken.address,
          quoteAmount,
          minBaseAmount,
          user1.address,
          user1.address,
          ZERO_ADDR)

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

    // it('sellBase revert1', async () => {
    //   await expect(wooPP.withdraw(ZERO_ADDR, user1.address, 100)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    // })

    // it('sellBase revert2', async () => {
    //   await expect(wooPP.withdraw(baseToken1.address, ZERO_ADDR, 100)).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    // })

    // it('sellBase event1', async () => {
    //   await expect(wooPP.withdraw(baseToken1.address, user1.address, 111))
    //     .to.emit(wooPP, 'Withdraw')
    //     .withArgs(baseToken1.address, user1.address, 111)
    // })
  })

  // TODO: (@qinchao)
  // 1. only owner and strategist, access control unit tests
  // 2. sell, buy quote and base tokens
  // 3. query amount of quote and base tokens
})
