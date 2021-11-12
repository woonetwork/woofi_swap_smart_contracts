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
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooStakingVault, TestToken } from '../typechain'
import WooStakingVaultArtifact from '../artifacts/contracts/WooStakingVault.sol/WooStakingVault.json'
import TestTokenArtifact from '../artifacts/contracts/test/TestErc20Token.sol/TestToken.json'

use(solidity)

const BN_1e18 = BigNumber.from(10).pow(18)
const BN_ZERO = BigNumber.from(0)
const WITHDRAW_FEE_PERIOD = BigNumber.from(86400).mul(3)

describe('WooStakingVault Normal Accuracy', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress

  let wooStakingVault: WooStakingVault
  let wooToken: TestToken

  before(async () => {
    ;[owner, user, treasury] = await ethers.getSigners()
    wooToken = (await deployContract(owner, TestTokenArtifact, [])) as TestToken
    // 1.mint woo token to user
    // 2.make sure user woo balance start with 0
    let mintWooBalance = BN_1e18.mul(1000)
    await wooToken.mint(user.address, mintWooBalance)
    expect(await wooToken.balanceOf(user.address)).to.eq(mintWooBalance)

    wooStakingVault = (await deployContract(owner, WooStakingVaultArtifact, [
      wooToken.address,
      treasury.address,
    ])) as WooStakingVault
  })

  it('Check state variables after contract initialized', async () => {
    expect(await wooStakingVault.stakedToken()).to.eq(wooToken.address)
    expect(await wooStakingVault.costSharePrice(user.address)).to.eq(BN_ZERO)
    let [reserveAmount, lastReserveWithdrawTime] = await wooStakingVault.userInfo(user.address)
    expect(reserveAmount).to.eq(BN_ZERO)
    expect(lastReserveWithdrawTime).to.eq(BN_ZERO)

    expect(await wooStakingVault.totalReserveAmount()).to.eq(BN_ZERO)
    expect(await wooStakingVault.withdrawFeePeriod()).to.eq(WITHDRAW_FEE_PERIOD)
    expect(await wooStakingVault.withdrawFee()).to.eq(BigNumber.from(10))
    expect(await wooStakingVault.treasury()).to.eq(treasury.address)
  })

  it('Share price should be 1e18 when xWOO non-supply', async () => {
    expect(await wooStakingVault.totalSupply()).to.eq(BN_ZERO)
    expect(await wooStakingVault.getPricePerFullShare()).to.eq(BN_1e18)
  })

  it('deposit', async () => {
    // approve wooStakingVault and deposit by user
    expect(await wooStakingVault.balance()).to.eq(BN_ZERO)
    let wooDeposit = BN_1e18.mul(100)
    await wooToken.connect(user).approve(wooStakingVault.address, wooDeposit)
    await wooStakingVault.connect(user).deposit(wooDeposit)
    // allowance will be 0 after safeTransferFrom(approve 100 and deposit 100 woo token above code)
    expect(await wooToken.allowance(user.address, wooStakingVault.address)).to.eq(BN_ZERO)
    // Check user costSharePrice and xWoo balance after deposit
    expect(await wooStakingVault.costSharePrice(user.address)).to.eq(BN_1e18)
    expect(await wooStakingVault.balanceOf(user.address)).to.eq(BN_1e18.mul(100))
  })

  it('Share price should be 2e18 when WOO balance is double xWOO totalSupply', async () => {
    expect(await wooStakingVault.totalSupply()).to.eq(BN_1e18.mul(100))
    // mint 100 WOO to wooStakingVault
    await wooToken.mint(wooStakingVault.address, BN_1e18.mul(100))
    expect(await wooStakingVault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))
  })

  it('reserveWithdraw', async () => {
    // continue by deposit, user woo balance: BN_1e18.mul(900)
    expect(await wooToken.balanceOf(user.address)).to.eq(BN_1e18.mul(900))
    // xWOO(_shares) balance: BN_1e18.mul(100)
    let reserveShares = BN_1e18.mul(100)
    expect(await wooStakingVault.balanceOf(user.address)).to.eq(reserveShares)
    // pre check before reserveWithdraw
    let sharePrice = await wooStakingVault.getPricePerFullShare()
    let currentReserveAmount = reserveShares.mul(sharePrice).div(BN_1e18)
    let poolBalance = await wooStakingVault.balance()
    expect(currentReserveAmount).to.eq(poolBalance)
    // make reserve to withdraw woo
    await wooStakingVault.connect(user).reserveWithdraw(reserveShares)
    // xWOO balance should be zero after reserveWithdraw
    expect(await wooStakingVault.balanceOf(user.address)).to.eq(BN_ZERO)
    // totalReserveAmount should add currentReserveAmount
    expect(await wooStakingVault.totalReserveAmount()).to.eq(currentReserveAmount)
    // userInfo update
    let [reserveAmount] = await wooStakingVault.userInfo(user.address)
    expect(reserveAmount).to.eq(currentReserveAmount)
    // can't confirm the block.timestamp, will be confirm on bsc testnet
  })

  it('balance should subtract totalReserveAmount', async () => {
    let totalReserveAmount = await wooStakingVault.totalReserveAmount()
    expect(totalReserveAmount).to.not.eq(BN_ZERO)
    let totalWOOBalance = await wooToken.balanceOf(wooStakingVault.address)
    expect(await wooStakingVault.balance()).to.eq(totalWOOBalance.sub(totalReserveAmount))
  })

  it('withdraw', async () => {
    // user woo balance: BN_1e18.mul(900)
    let userWooBalance = await wooToken.balanceOf(user.address)
    expect(userWooBalance).to.eq(BN_1e18.mul(900))
    // continue by reserveWithdraw, user.reserveAmount: BN_1e18.mul(100)
    let [withdrawAmount] = await wooStakingVault.userInfo(user.address)
    let currentWithdrawFee = withdrawAmount.mul(BigNumber.from(10)).div(BigNumber.from(10000))
    await wooStakingVault.connect(user).withdraw()
    // treasury will receive fee after withdraw during 3 days
    expect(await wooToken.balanceOf(treasury.address)).to.eq(currentWithdrawFee)
    // withdrawAmount will subtract fee and transfer to user
    expect(await wooToken.balanceOf(user.address)).to.eq(userWooBalance.add(withdrawAmount).sub(currentWithdrawFee))

    expect(await wooStakingVault.totalReserveAmount()).to.eq(BN_ZERO)

    let [reserveAmount] = await wooStakingVault.userInfo(user.address)
    expect(reserveAmount).to.eq(BN_ZERO)
  })
})

describe('WooStakingVault Complex Accuracy', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let newTreasury: SignerWithAddress

  let wooStakingVault: WooStakingVault
  let wooToken: TestToken

  before(async () => {
    ;[owner, user, treasury, newTreasury] = await ethers.getSigners()
    wooToken = (await deployContract(owner, TestTokenArtifact, [])) as TestToken
    // 1.mint woo token to user
    // 2.make sure user woo balance start with 0
    let mintWooBalance = BN_1e18.mul(1000)
    await wooToken.mint(user.address, mintWooBalance)
    expect(await wooToken.balanceOf(user.address)).to.eq(mintWooBalance)

    wooStakingVault = (await deployContract(owner, WooStakingVaultArtifact, [
      wooToken.address,
      treasury.address,
    ])) as WooStakingVault
  })

  /**
   * TODO(@merlin)
   * deposit by multi-users
   * mint WOO after deposit
   * check share price change
   * reserveWithdraw by multi-users
   * withdraw by multi-users
   * check balance and totalReserveAmount correct or not
   */
})

describe('WooStakingVault Access Control & Require Check', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress
  let newTreasury: SignerWithAddress

  let wooStakingVault: WooStakingVault
  let wooToken: TestToken

  let onlyOwnerRevertedMessage: string
  let setWithdrawFeePeriodExceedMessage: string
  let setWithdrawFeeExceedMessage: string
  let whenNotPausedRevertedMessage: string
  let whenPausedRevertedMessage: string

  before(async () => {
    ;[owner, user, treasury, newTreasury] = await ethers.getSigners()
    wooToken = (await deployContract(owner, TestTokenArtifact, [])) as TestToken
    // 1.mint woo token to user
    // 2.make sure user woo balance start with 0
    let mintWooBalance = BN_1e18.mul(1000)
    await wooToken.mint(user.address, mintWooBalance)
    expect(await wooToken.balanceOf(user.address)).to.eq(mintWooBalance)

    wooStakingVault = (await deployContract(owner, WooStakingVaultArtifact, [
      wooToken.address,
      treasury.address,
    ])) as WooStakingVault

    onlyOwnerRevertedMessage = 'Ownable: caller is not the owner'
    setWithdrawFeePeriodExceedMessage = 'WooStakingVault: withdrawFeePeriod cannot be more than MAX_WITHDRAW_FEE_PERIOD'
    setWithdrawFeeExceedMessage = 'WooStakingVault: withdrawFee cannot be more than MAX_WITHDRAW_FEE'
    whenNotPausedRevertedMessage = 'Pausable: paused'
    whenPausedRevertedMessage = 'Pausable: not paused'
  })

  it('Only owner able to setWithdrawFeePeriod', async () => {
    let withdrawFeePeriod = BigNumber.from(86400) // 1 days
    await expect(wooStakingVault.connect(user).setWithdrawFeePeriod(withdrawFeePeriod)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await wooStakingVault.connect(owner).setWithdrawFeePeriod(withdrawFeePeriod)
    expect(await wooStakingVault.withdrawFeePeriod()).to.eq(withdrawFeePeriod)
  })

  it('New withdrawFeePeriod can not exceed MAX_WITHDRAW_FEE_PERIOD when setWithdrawFeePeriod', async () => {
    let maxWithdrawFeePeriod = await wooStakingVault.MAX_WITHDRAW_FEE_PERIOD()
    let newWithdrawFeePeriod = maxWithdrawFeePeriod.add(BigNumber.from(86400)) // add 1 days
    await expect(wooStakingVault.connect(owner).setWithdrawFeePeriod(newWithdrawFeePeriod)).to.be.revertedWith(
      setWithdrawFeePeriodExceedMessage
    )
  })

  it('Only owner able to setWithdrawFee', async () => {
    let withdrawFee = BigNumber.from(20) // 0.2%
    await expect(wooStakingVault.connect(user).setWithdrawFee(withdrawFee)).to.be.revertedWith(onlyOwnerRevertedMessage)
    await wooStakingVault.connect(owner).setWithdrawFee(withdrawFee)
    expect(await wooStakingVault.withdrawFee()).to.eq(withdrawFee)
  })

  it('New withdrawFee can not exceed MAX_WITHDRAW_FEE when setWithdrawFee', async () => {
    let maxWithdrawFee = await wooStakingVault.MAX_WITHDRAW_FEE()
    let newWithdrawFee = maxWithdrawFee.add(BigNumber.from(10)) // add 0.1%
    await expect(wooStakingVault.connect(owner).setWithdrawFee(newWithdrawFee)).to.be.revertedWith(
      setWithdrawFeeExceedMessage
    )
  })

  it('Only owner able to setTreasury', async () => {
    await expect(wooStakingVault.connect(user).setTreasury(newTreasury.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await wooStakingVault.connect(owner).setTreasury(newTreasury.address)
    expect(await wooStakingVault.treasury()).to.eq(newTreasury.address)
  })

  it('Only owner able to pause', async () => {
    await expect(wooStakingVault.connect(user).pause()).to.be.revertedWith(onlyOwnerRevertedMessage)
    await wooStakingVault.connect(owner).pause()

    let wooDeposit = BN_1e18.mul(100)
    await wooToken.connect(user).approve(wooStakingVault.address, wooDeposit)
    // deposit will be reverted when contract is paused
    await expect(wooStakingVault.connect(user).deposit(wooDeposit)).to.be.revertedWith(whenNotPausedRevertedMessage)
    // reserveWithdraw will be reverted when contract is paused
    await expect(wooStakingVault.connect(user).reserveWithdraw(BN_ZERO)).to.be.revertedWith(
      whenNotPausedRevertedMessage
    )
    // withdraw will be reverted when contract is paused
    await expect(wooStakingVault.connect(user).withdraw()).to.be.revertedWith(whenNotPausedRevertedMessage)
    // getPricePerFullShare will be reverted when contract is paused
    await expect(wooStakingVault.getPricePerFullShare()).to.be.revertedWith(whenNotPausedRevertedMessage)
    // balance will be reverted when contract is paused
    await expect(wooStakingVault.balance()).to.be.revertedWith(whenNotPausedRevertedMessage)
  })

  it('Only owner able to unpause', async () => {
    // make sure contract is paused now
    expect(await wooStakingVault.paused()).to.eq(true)
    // start to unpause
    await expect(wooStakingVault.connect(user).unpause()).to.be.revertedWith(onlyOwnerRevertedMessage)
    await wooStakingVault.connect(owner).unpause()
    expect(await wooStakingVault.paused()).to.eq(false)
    // unpause will be reverted when contract is working
    await expect(wooStakingVault.unpause()).to.be.revertedWith(whenPausedRevertedMessage)
  })
})
