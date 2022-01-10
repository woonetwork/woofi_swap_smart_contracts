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
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { TestToken, Vault, Controller } from '../typechain'
import TestTokenArtifact from '../artifacts/contracts/test/TestErc20Token.sol/TestToken.json'
import ControllerArtifact from '../artifacts/contracts/controller.sol/controller.json'
import VaultArtifact from '../artifacts/contracts/vault.sol/vault.json'
import IStrategyArtifact from '../artifacts/contracts/interfaces/IStrategy.sol/IStrategy.json'

use(solidity)

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const BN_TEN = BigNumber.from(10)
const BN_1e18 = BN_TEN.pow(18)
const BN_ZERO = BigNumber.from(0)

describe('Vault Normal Accuracy', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress

  let want: TestToken
  let controller: Controller
  let vault: Vault
  let strategy: Contract

  before(async () => {
    ;[owner, user] = await ethers.getSigners()
    want = (await deployContract(owner, TestTokenArtifact, [])) as TestToken
    let mintWantBalance = BN_1e18.mul(1000)
    await want.mint(user.address, mintWantBalance)
    expect(await want.balanceOf(user.address)).to.eq(mintWantBalance)

    controller = (await deployContract(owner, ControllerArtifact, [])) as Controller
    vault = (await deployContract(owner, VaultArtifact, [want.address, controller.address])) as Vault

    strategy = await deployMockContract(owner, IStrategyArtifact.abi)
    await strategy.mock.want.returns(want.address)
    await strategy.mock.beforeDeposit.returns()
    await strategy.mock.deposit.returns()
    await strategy.mock.withdraw.returns()
    // await strategy.mock.withdrawAll.returns(10000)
    await strategy.mock.balanceOf.returns(0)

    await controller.setVault(want.address, vault.address)
    await controller.setStrategy(want.address, strategy.address)
  })

  it('Check state variables after contract initialized', async () => {
    // Vault
    expect(await vault.want()).to.eq(want.address)
    expect(await vault.controller()).to.eq(controller.address)

    // Controller
    expect(await controller.vaults(want.address)).to.eq(vault.address)
    expect(await controller.strategies(want.address)).to.eq(strategy.address)
  })

  it('Share price should be 1e18 when xWant non-supply', async () => {
    expect(await vault.totalSupply()).to.eq(BN_ZERO)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18)
  })

  it('deposit', async () => {
    // approve vault and deposit by user
    expect(await vault.balance()).to.eq(BN_ZERO)
    let wantDeposit = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposit)
    await vault.connect(user).deposit(wantDeposit)
    // allowance will be 0 after safeTransferFrom(approve 100 and deposit 100 want above code)
    expect(await want.allowance(user.address, vault.address)).to.eq(BN_ZERO)
    // Check user costSharePrice and xWant balance after deposit
    expect(await vault.costSharePrice(user.address)).to.eq(BN_1e18)
    expect(await vault.balanceOf(user.address)).to.eq(BN_1e18.mul(100))
    // Check want balance in three contract
    expect(await want.balanceOf(vault.address)).to.eq(BN_ZERO)
    expect(await want.balanceOf(controller.address)).to.eq(BN_ZERO)
    expect(await want.balanceOf(strategy.address)).to.eq(BN_1e18.mul(100))
    // Vault function: `balance()` should include total balance above three contract
    await strategy.mock.balanceOf.returns(BN_1e18.mul(100)) // mock return 100 after pass above code
    expect(await vault.balance()).to.eq(BN_1e18.mul(100))
  })

  it('Share price should be 2e18 when want balance is double xWant totalSupply', async () => {
    expect(await vault.totalSupply()).to.eq(BN_1e18.mul(100))
    // mint 100 want to strategy(equal to Strategy function `harvest()`)
    await want.mint(strategy.address, BN_1e18.mul(100))
    await strategy.mock.balanceOf.returns(BN_1e18.mul(200))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))
  })

  it('withdraw', async () => {
    // user want balance: BN_1e18.mul(900)
    let userWantBalance = await want.balanceOf(user.address)
    expect(userWantBalance).to.eq(BN_1e18.mul(900))
    // user hold 100 shares(xWant), equal to 200 want meantime
    let shares = await vault.balanceOf(user.address)
    await vault.connect(user).withdraw(shares) // nothing happen because can't custom strategy withdraw logic
    expect(await want.balanceOf(user.address)).to.eq(userWantBalance)
  })
})
