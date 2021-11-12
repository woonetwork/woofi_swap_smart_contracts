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

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const BN_1e18 = BigNumber.from(10).pow(18)
const BN_ZERO = BigNumber.from(0)
const WITHDRAW_FEE_PERIOD = BigNumber.from(86400).mul(3)

describe('WooStakingVault', () => {
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
    let [reserveAmount, _] = await wooStakingVault.userInfo(user.address)
    expect(reserveAmount).to.eq(currentReserveAmount)
    // can't confirm the block.timestamp, will be confirm on bsc testnet
  })

  it('withdraw', async () => {
    // user woo balance: BN_1e18.mul(900)
    let userWooBalance = await wooToken.balanceOf(user.address)
    expect(userWooBalance).to.eq(BN_1e18.mul(900))
    // continue by reserveWithdraw, user.reserveAmount: BN_1e18.mul(100)
    let withdrawAmount = BN_1e18.mul(100)
    let currentWithdrawFee = withdrawAmount.mul(BigNumber.from(10)).div(BigNumber.from(10000))
    await wooStakingVault.connect(user).withdraw()
    // treasury will receive fee after withdraw during 3 days
    expect(await wooToken.balanceOf(treasury.address)).to.eq(currentWithdrawFee)
    // withdrawAmount will subtract fee and transfer to user
    expect(await wooToken.balanceOf(user.address)).to.eq(userWooBalance.add(withdrawAmount).sub(currentWithdrawFee))

    expect(await wooStakingVault.totalReserveAmount()).to.eq(BN_ZERO)
    let [reserveAmount, _] = await wooStakingVault.userInfo(user.address)
    expect(reserveAmount).to.eq(BN_ZERO)
  })
})
