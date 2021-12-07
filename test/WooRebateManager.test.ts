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
import IWooPP from '../build/IWooPP.json'
import IWooRebateManager from '../build/IWooRebateManager.json'
import IWooVaultManager from '../build/IWooVaultManager.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { WooFeeManager, IERC20, WooRebateManager } from '../typechain'
import WooRebateManagerArtifact from '../artifacts/contracts/WooRebateManager.sol/WooRebateManager.json'

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const BTC_PRICE = 60000
const WOO_PRICE = 1.2

const ONE = BigNumber.from(10).pow(18)
const FEE_RATE = utils.parseEther('0.001')

const REBATE_RATE1 = utils.parseEther('0.1')
const REBATE_RATE2 = utils.parseEther('0.12')
const REBATE_RATE3 = utils.parseEther('0.05')

const MOCK_REWARD_AMOUNT = utils.parseEther('0')

describe('WooRebateManager', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let broker: SignerWithAddress

  let rebateManager: WooRebateManager
  let btcToken: Contract
  let usdtToken: Contract
  let wooToken: Contract
  let wooPP: Contract

  before('Deploy ERC20', async () => {
    ;[owner, user1, broker] = await ethers.getSigners()
    btcToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    wooPP = await deployMockContract(owner, IWooPP.abi)
    await wooPP.mock.quoteToken.returns(usdtToken.address)
    await wooPP.mock.querySellQuote.returns(MOCK_REWARD_AMOUNT)
    await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)
    // await rebateManager.mock.addRebate.returns()

    // vaultManager = await deployMockContract(owner, IWooVaultManager.abi)
    // await vaultManager.mock.addReward.returns()
  })

  describe('ctor, init & basic func', () => {
    beforeEach('Deploy WooRebateManager', async () => {
      rebateManager = (await deployContract(owner, WooRebateManagerArtifact, [
        usdtToken.address,
        wooToken.address,
      ])) as WooRebateManager
    })

    it('ctor', async () => {
      expect(await rebateManager._OWNER_()).to.eq(owner.address)
    })

    it('Init fields', async () => {
      expect(await rebateManager.quoteToken()).to.eq(usdtToken.address)
      expect(await rebateManager.rewardToken()).to.eq(wooToken.address)
    })

    it('Set rebateRate', async () => {
      expect(await rebateManager.rebateRate(broker.address)).to.eq(0)
      await rebateManager.setRebateRate(broker.address, REBATE_RATE1)
      expect(await rebateManager.rebateRate(broker.address)).to.eq(REBATE_RATE1)
    })

    it('Set rebateRate revert1', async () => {
      await expect(rebateManager.setRebateRate(ZERO_ADDR, REBATE_RATE1)).to.be.revertedWith(
        'WooRebateManager: brokerAddr_ZERO_ADDR'
      )
    })

    it('Set rebateRate revert2', async () => {
      await expect(rebateManager.setRebateRate(broker.address, utils.parseEther('1.000000001'))).to.be.revertedWith(
        'WooRebateManager: INVALID_USER_REWARD_RATE'
      )
    })

    it('Set rebateRate event', async () => {
      await expect(rebateManager.setRebateRate(broker.address, REBATE_RATE1))
        .to.emit(rebateManager, 'RebateRateUpdated')
        .withArgs(broker.address, REBATE_RATE1)

      await expect(rebateManager.setRebateRate(broker.address, REBATE_RATE2))
        .to.emit(rebateManager, 'RebateRateUpdated')
        .withArgs(broker.address, REBATE_RATE2)
    })
  })

  describe('rebate', () => {
    let quoteToken: Contract

    beforeEach('Deploy WooRebateManager', async () => {
      rebateManager = (await deployContract(owner, WooRebateManagerArtifact, [
        usdtToken.address,
        wooToken.address,
      ])) as WooRebateManager

      await rebateManager.setWooPP(wooPP.address)
      await usdtToken.mint(owner.address, 1000)
    })

    it('addRebate acc1', async () => {
      expect(await usdtToken.balanceOf(owner.address)).to.equal(1000)
      expect(await usdtToken.balanceOf(rebateManager.address)).to.equal(0)
      expect(await usdtToken.balanceOf(broker.address)).to.equal(0)

      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)

      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      expect(await usdtToken.balanceOf(owner.address)).to.equal(1000 - rebateAmount)
      expect(await usdtToken.balanceOf(rebateManager.address)).to.equal(rebateAmount)
      expect(await usdtToken.balanceOf(broker.address)).to.equal(0)
    })

    it('pendingRebateInUSDT', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      const amount2 = 200
      await usdtToken.approve(rebateManager.address, amount2)
      await rebateManager.addRebate(broker.address, amount2)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount + amount2)

      const amount3 = 100
      await usdtToken.approve(rebateManager.address, amount3)
      await rebateManager.addRebate(broker.address, amount3)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount + amount2 + amount3)
    })

    it('pendingRebateInUSDT with claim pending', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      const amount2 = 200
      await usdtToken.approve(rebateManager.address, amount2)
      await rebateManager.addRebate(broker.address, amount2)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount + amount2)

      await rebateManager.connect(broker).claimRebate()

      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)
    })

    it('pendingRebateInWOO', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)
      await rebateManager.pendingRebateInWOO(broker.address)

      const amount2 = 200
      await usdtToken.approve(rebateManager.address, amount2)
      await rebateManager.addRebate(broker.address, amount2)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount + amount2)
      await rebateManager.pendingRebateInWOO(broker.address)
    })

    it('claimRebate', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      await rebateManager.connect(broker).claimRebate()

      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)
    })

    it('claimRebate revert', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      await wooPP.mock.sellQuote.returns(utils.parseEther('1'))

      await expect(rebateManager.connect(broker).claimRebate()).to.be.revertedWith(
        'WooRebateManager: woo amount INSUFF'
      )

      await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)
    })

    it('claimRebate event', async () => {
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(0)

      const rebateAmount = 300
      await usdtToken.approve(rebateManager.address, rebateAmount)
      await rebateManager.addRebate(broker.address, rebateAmount)
      expect(await rebateManager.pendingRebateInUSDT(broker.address)).to.equal(rebateAmount)

      await expect(rebateManager.connect(broker).claimRebate())
        .to.emit(rebateManager, 'ClaimReward')
        .withArgs(broker.address, MOCK_REWARD_AMOUNT)
    })
  })
})
