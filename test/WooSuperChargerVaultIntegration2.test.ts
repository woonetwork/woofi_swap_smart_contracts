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

import { expect, use, util } from 'chai'
import { Contract, utils, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import TestToken from '../build/TestToken.json'
import WFTM from '../build/WFTM.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import {
  WooFeeManager,
  IERC20,
  WooVaultManager,
  WooAccessManager,
  WooSuperChargerVault,
  WooLendingManager,
  WooWithdrawManager,
  WOOFiVaultV2,
  VoidStrategy,
} from '../typechain'

import WooAccessManagerArtifact from '../artifacts/contracts/WooAccessManager.sol/WooAccessManager.json'
import WooSuperChargerVaultArtifact from '../artifacts/contracts/earn/WooSuperChargerVault.sol/WooSuperChargerVault.json'
import WooLendingManagerArtifact from '../artifacts/contracts/earn/WooLendingManager.sol/WooLendingManager.json'
import WooWithdrawManagerArtifact from '../artifacts/contracts/earn/WooWithdrawManager.sol/WooWithdrawManager.json'
import WFTMArtifact from '../artifacts/contracts/test/WFTM.sol/WFTM.json'

import WOOFiVaultV2Artifact from '../artifacts/contracts/earn/VaultV2.sol/WOOFiVaultV2.json'
import VoidStrategyArtifact from '../artifacts/contracts/earn/strategies/VoidStrategy.sol/VoidStrategy.json'
import { access } from 'fs'

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const TREASURY_ADDR = '0x815D4517427Fc940A90A5653cdCEA1544c6283c9'
const RATE = 30

const ONE = BigNumber.from(10).pow(18)
const FEE_RATE = utils.parseEther('0.001')

const MOCK_REWARD_AMOUNT = utils.parseEther('0')

describe('WooSuperChargerVault WFTM', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let wooPP: SignerWithAddress
  let vault2: SignerWithAddress
  let vault3: SignerWithAddress

  let accessManager: WooAccessManager
  let reserveVault: WOOFiVaultV2
  let strategy: VoidStrategy

  let superChargerVault: WooSuperChargerVault
  let lendingManager: WooLendingManager
  let withdrawManager: WooWithdrawManager

  let want: Contract
  let wftm: Contract
  let usdcToken: Contract
  // let provider

  before('Tests Init', async () => {
    // provider = await ethers.getDefaultProvider()
    ;[owner, user1, wooPP, vault2, vault3] = await ethers.getSigners()
    usdcToken = await deployContract(owner, TestToken, [])
    wftm = await deployContract(owner, WFTM, [])

    want = wftm

    accessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager

    reserveVault = (await deployContract(owner, WOOFiVaultV2Artifact, [
      wftm.address,
      want.address,
      accessManager.address,
    ])) as WOOFiVaultV2

    strategy = (await deployContract(owner, VoidStrategyArtifact, [
      reserveVault.address,
      accessManager.address,
    ])) as VoidStrategy

    await wftm.mint(owner.address, utils.parseEther('10000'))
    await usdcToken.mint(owner.address, utils.parseEther('5000'))
  })

  describe('ctor, init & basic func', () => {
    beforeEach('Deploy WooVaultManager', async () => {
      superChargerVault = (await deployContract(owner, WooSuperChargerVaultArtifact, [
        wftm.address,
        want.address,
        accessManager.address,
      ])) as WooSuperChargerVault

      lendingManager = (await deployContract(owner, WooLendingManagerArtifact, [])) as WooLendingManager
      await lendingManager.init(
        wftm.address,
        want.address,
        accessManager.address,
        wooPP.address,
        superChargerVault.address
      )

      withdrawManager = (await deployContract(owner, WooWithdrawManagerArtifact, [])) as WooWithdrawManager
      await withdrawManager.init(wftm.address, want.address, accessManager.address, superChargerVault.address)

      await superChargerVault.init(reserveVault.address, lendingManager.address, withdrawManager.address)
    })

    it('Verify ctor & init', async () => {
      expect(await superChargerVault.treasury()).to.eq(TREASURY_ADDR)
      expect(await superChargerVault.instantWithdrawFeeRate()).to.eq(30)
      expect(await superChargerVault.instantWithdrawCap()).to.eq(0)
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(0)

      expect(await superChargerVault.isSettling()).to.eq(false)
      expect(await superChargerVault.available()).to.eq(0)
      expect(await superChargerVault.balance()).to.eq(0)
      expect(await superChargerVault.reserveBalance()).to.eq(0)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.getPricePerFullShare()).to.eq(utils.parseEther('1.0'))
    })

    it('Integration Test: status, deposit, instant withdraw', async () => {
      let amount = utils.parseEther('80')
      await want.approve(superChargerVault.address, amount)
      await superChargerVault.deposit(amount, { value: amount })

      // Check vault statu
      console.log(utils.formatEther(await superChargerVault.balanceOf(owner.address)))
      console.log(utils.formatEther(await superChargerVault.balance()))
      console.log(utils.formatEther(await superChargerVault.available()))
      console.log(utils.formatEther(await superChargerVault.reserveBalance()))
      console.log(utils.formatEther(await superChargerVault.debtBalance()))
      console.log(utils.formatEther(await superChargerVault.getPricePerFullShare()))

      expect(await superChargerVault.costSharePrice(owner.address)).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.balanceOf(owner.address)).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.available()).to.eq(0)
      expect(await superChargerVault.getPricePerFullShare()).to.eq(utils.parseEther('1.0'))

      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(0)

      // Deposit

      let amount1 = utils.parseEther('20')
      await want.approve(superChargerVault.address, amount1)
      await superChargerVault.deposit(amount1, { value: amount1 })
      amount = amount.add(amount1)

      console.log(utils.formatEther(await superChargerVault.balanceOf(owner.address)))
      console.log(utils.formatEther(await superChargerVault.balance()))
      console.log(utils.formatEther(await superChargerVault.available()))
      console.log(utils.formatEther(await superChargerVault.reserveBalance()))
      console.log(utils.formatEther(await superChargerVault.debtBalance()))
      console.log(utils.formatEther(await superChargerVault.getPricePerFullShare()))

      expect(await superChargerVault.costSharePrice(owner.address)).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.balanceOf(owner.address)).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.available()).to.eq(0)

      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(0)

      await expect(superChargerVault.deposit(0)).to.be.revertedWith('WooSuperChargerVault: !amount')
      await expect(superChargerVault.instantWithdraw(0)).to.be.revertedWith('WooSuperChargerVault: !amount')
      await expect(superChargerVault.instantWithdraw(amount.div(2))).to.be.revertedWith(
        'WooSuperChargerVault: OUT_OF_CAP'
      )

      // InstantWithdraw

      // let bal1 = await want.balanceOf(owner.address)
      let bal1 = await ethers.provider.getBalance(owner.address)
      let instantWithdrawAmount = amount.div(20) // instant withdraw = 100 / 20 = 5
      await superChargerVault.instantWithdraw(instantWithdrawAmount)
      // let bal2 = await want.balanceOf(owner.address)
      let bal2 = await ethers.provider.getBalance(owner.address)

      let rate = await superChargerVault.instantWithdrawFeeRate()
      let fee = instantWithdrawAmount.mul(rate).div(10000)
      console.log('rate, fee: ', rate.toNumber(), utils.formatEther(fee))

      let treasury_balance = await ethers.provider.getBalance(TREASURY_ADDR)

      expect(treasury_balance).to.eq(fee)
      console.log('treasury balance: ', utils.formatEther(treasury_balance))

      let userReceived = instantWithdrawAmount.sub(fee)
      expect(bal2.sub(bal1).div(ONE)).to.eq(userReceived.div(ONE))

      // Double check the status

      amount = amount.sub(instantWithdrawAmount)
      expect(await superChargerVault.costSharePrice(owner.address)).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.balanceOf(owner.address)).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.available()).to.eq(0)

      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(instantWithdrawAmount)

      // Instant withdraw all capped amount
      instantWithdrawAmount = amount.div(10).sub(instantWithdrawAmount)
      amount = amount.sub(instantWithdrawAmount)
      await superChargerVault.instantWithdraw(instantWithdrawAmount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)

      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(amount.div(10))
    })

    it('Integration Test: request withdraw, borrow, weekly settle, withdraw', async () => {
      // Steps:
      // 1. user deposits 100 usdc
      // 2. request withdraw 40 usdc
      // 3. borrow 20 + 30 usdc
      // 4. weekly settle
      // 5. repaid weekly amount

      let amount = utils.parseEther('100')
      await want.approve(superChargerVault.address, amount)
      await superChargerVault.deposit(amount, { value: amount })

      let rwAmount = utils.parseEther('40')
      await superChargerVault.approve(superChargerVault.address, rwAmount)
      await superChargerVault.requestWithdraw(rwAmount)

      expect(await superChargerVault.isSettling()).to.eq(false)
      expect(await superChargerVault.requestedTotalAmount()).to.eq(rwAmount)
      expect(await superChargerVault.requestedWithdrawAmount(owner.address)).to.eq(rwAmount)

      // Check lending manager status
      await lendingManager.setBorrower(owner.address, true)
      await lendingManager.setInterestRate(1000) // APR - 10%

      // Borrow - 50 in total
      await lendingManager.borrow(utils.parseEther('20')) // borrow 20 want token
      await lendingManager.borrow(utils.parseEther('30')) // borrow 30 want token

      expect((await superChargerVault.debtBalance()).div(ONE)).to.eq(50)
      expect((await superChargerVault.balance()).div(ONE)).to.eq(100)
      expect((await superChargerVault.requestedTotalAmount()).div(ONE)).to.eq(40)

      console.log('superCharger balance: ', utils.formatEther(await superChargerVault.balance()))
      console.log('superCharger reserveBalance: ', utils.formatEther(await superChargerVault.reserveBalance()))

      console.log('lendingManager debt: ', utils.formatEther(await lendingManager.debt()))
      console.log('lendingManager weeklyRepayAmount: ', utils.formatEther(await lendingManager.weeklyRepayAmount()))

      // Settle

      await superChargerVault.startWeeklySettle()

      expect(await superChargerVault.isSettling()).to.eq(true)
      expect((await superChargerVault.requestedTotalAmount()).div(ONE)).to.eq(40)
      expect(await lendingManager.weeklyRepayAmount()).to.eq(0)

      // Repay

      let repayAmount = await lendingManager.weeklyRepayAmount()
      await want.approve(lendingManager.address, repayAmount)
      await lendingManager.repayWeekly()

      await superChargerVault.endWeeklySettle()

      expect(await superChargerVault.isSettling()).to.eq(false)
      expect(await lendingManager.weeklyRepayAmount()).to.eq(0)

      expect((await superChargerVault.debtBalance()).div(ONE)).to.eq(50)
      expect((await superChargerVault.requestedTotalAmount()).div(ONE)).to.eq(0)

      expect((await withdrawManager.withdrawAmount(owner.address)).div(ONE)).to.eq(40)

      console.log('share_price: ', utils.formatEther(await superChargerVault.getPricePerFullShare()))
      console.log('balance: ', utils.formatEther(await superChargerVault.balance()))

      // Request 30 again

      rwAmount = utils.parseEther('30')
      await superChargerVault.approve(superChargerVault.address, rwAmount)
      await superChargerVault.requestWithdraw(rwAmount)

      // Settle

      await superChargerVault.startWeeklySettle()

      expect(await superChargerVault.isSettling()).to.eq(true)
      expect((await superChargerVault.requestedTotalAmount()).div(ONE)).to.eq(30)
      expect((await superChargerVault.debtBalance()).div(ONE)).to.eq(50)
      expect((await lendingManager.weeklyRepayAmount()).div(ONE)).to.eq(23)

      // Repay 23 usdc

      repayAmount = await lendingManager.weeklyRepayAmount()
      await want.approve(lendingManager.address, repayAmount)
      await lendingManager.repayWeekly()

      await superChargerVault.endWeeklySettle()

      expect(await superChargerVault.isSettling()).to.eq(false)
      expect(await lendingManager.weeklyRepayAmount()).to.eq(0)

      expect((await superChargerVault.debtBalance()).div(ONE)).to.eq(50 - 23)
      expect((await superChargerVault.requestedTotalAmount()).div(ONE)).to.eq(0)

      expect((await withdrawManager.withdrawAmount(owner.address)).div(ONE)).to.eq(40 + 30)

      // Withdraw

      let bal1 = await ethers.provider.getBalance(owner.address)
      await withdrawManager.withdraw()
      let bal2 = await ethers.provider.getBalance(owner.address)
      let gas = utils.parseEther('0.001')
      expect(bal2.sub(bal1).add(gas).div(ONE)).to.eq(40 + 30)
    })

    it('Integration Test: migrate reserve vault', async () => {
      let amount = utils.parseEther('80')
      await want.approve(superChargerVault.address, amount)
      await superChargerVault.deposit(amount, { value: amount })

      expect(await superChargerVault.costSharePrice(owner.address)).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.balanceOf(owner.address)).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.available()).to.eq(0)
      expect(await superChargerVault.getPricePerFullShare()).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(0)

      // Deposit

      let amount1 = utils.parseEther('50')
      await want.approve(superChargerVault.address, amount1)
      await superChargerVault.deposit(amount1, { value: amount1 })
      amount = amount.add(amount1)

      console.log(utils.formatEther(await superChargerVault.balanceOf(owner.address)))
      console.log(utils.formatEther(await superChargerVault.balance()))
      console.log(utils.formatEther(await superChargerVault.available()))
      console.log(utils.formatEther(await superChargerVault.reserveBalance()))
      console.log(utils.formatEther(await superChargerVault.debtBalance()))
      console.log(utils.formatEther(await superChargerVault.getPricePerFullShare()))

      expect(await superChargerVault.costSharePrice(owner.address)).to.eq(utils.parseEther('1.0'))
      expect(await superChargerVault.balanceOf(owner.address)).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
      expect(await superChargerVault.debtBalance()).to.eq(0)
      expect(await superChargerVault.available()).to.eq(0)
      expect(await superChargerVault.instantWithdrawCap()).to.eq(amount.div(10))
      expect(await superChargerVault.instantWithdrawnAmount()).to.eq(0)

      // Total reserve vault: 130 tokens

      let newVault = (await deployContract(owner, WOOFiVaultV2Artifact, [
        wftm.address,
        want.address,
        accessManager.address,
      ])) as WOOFiVaultV2

      let newStrat = (await deployContract(owner, VoidStrategyArtifact, [
        newVault.address,
        accessManager.address,
      ])) as VoidStrategy

      expect(await newVault.balance()).to.eq(0)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)

      await superChargerVault.migrateReserveVault(newVault.address)

      expect(await newVault.balance()).to.eq(amount)
      expect(await superChargerVault.balance()).to.eq(amount)
      expect(await superChargerVault.reserveBalance()).to.eq(amount)
    })
  })
})
