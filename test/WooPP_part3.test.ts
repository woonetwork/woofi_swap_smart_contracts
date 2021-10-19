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
