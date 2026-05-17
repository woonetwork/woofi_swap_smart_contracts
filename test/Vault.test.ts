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
import { BigNumber, Contract, utils } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, solidity, MockProvider } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { TestToken, Vault, WooAccessManager, VoidStrategy, IStrategy, VoidStrategy__factory } from '../typechain'
import TestTokenArtifact from '../artifacts/contracts/test/TestErc20Token.sol/TestToken.json'
import VaultArtifact from '../artifacts/contracts/earn/Vault.sol/Vault.json'
import VoidStrategyArtifact from '../artifacts/contracts/earn/strategies/VoidStrategy.sol/VoidStrategy.json'
import WooAccessManagerArtifact from '../artifacts/contracts/WooAccessManager.sol/WooAccessManager.json'
import IStrategyArtifact from '../artifacts/contracts/interfaces/IStrategy.sol/IStrategy.json'

use(solidity)

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const BN_TEN = BigNumber.from(10)
const BN_1e18 = BN_TEN.pow(18)
const BN_ZERO = BigNumber.from(0)

describe('Vault Normal Accuracy', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let treasury: SignerWithAddress

  let want: TestToken
  let token1: TestToken
  let vault: Vault
  let accessManager: WooAccessManager
  let strategy: VoidStrategy
  let strategy2: VoidStrategy

  beforeEach(async () => {
    ;[owner, user, treasury] = await ethers.getSigners()

    want = (await deployContract(owner, TestTokenArtifact, [])) as TestToken
    let mintWantBalance = BN_1e18.mul(1000)
    await want.mint(user.address, mintWantBalance)
    expect(await want.balanceOf(user.address)).to.eq(mintWantBalance)

    token1 = (await deployContract(owner, TestTokenArtifact, [])) as TestToken

    accessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager
    await accessManager.setVaultAdmin(owner.address, true)

    vault = (await deployContract(owner, VaultArtifact, [want.address, accessManager.address])) as Vault
    strategy = (await deployContract(owner, VoidStrategyArtifact, [
      vault.address,
      accessManager.address,
    ])) as VoidStrategy
    strategy2 = (await deployContract(owner, VoidStrategyArtifact, [
      vault.address,
      accessManager.address,
    ])) as VoidStrategy
  })

  it('Check state variables after contract initialized', async () => {
    // Vault
    expect(await vault.want()).to.eq(want.address)
  })

  it('Share price should be 1e18 when xWant non-supply', async () => {
    expect(await vault.totalSupply()).to.eq(BN_ZERO)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18)
  })

  it('deposit with no strategy', async () => {
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
    expect(await want.balanceOf(vault.address)).to.eq(BN_1e18.mul(100))
    expect(await want.balanceOf(strategy.address)).to.eq(BN_ZERO)
  })

  it('deposit with strategy', async () => {
    await vault.setupStrat(strategy.address)
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
    expect(await want.balanceOf(strategy.address)).to.eq(BN_1e18.mul(100))

    expect(await vault.balance()).to.eq(BN_1e18.mul(100))
  })

  it('Share price should be 2e18 when want balance is double xWant totalSupply', async () => {
    await vault.setupStrat(strategy.address)

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)

    expect(await vault.totalSupply()).to.eq(wantDeposited)
    expect(await vault.costSharePrice(user.address)).to.eq(BN_1e18)

    // harvest 100 more wants to strategy(equal to Strategy function `harvest()`)
    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))

    // harvest 100 more wants to strategy(equal to Strategy function `harvest()`)
    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(3))
  })

  it('withdraw1', async () => {
    await vault.setupStrat(strategy.address)

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(1))

    let userWantBalance = await want.balanceOf(user.address)
    let shares = await vault.balanceOf(user.address)
    await vault.connect(user).withdraw(shares)
    expect(await want.balanceOf(user.address)).to.eq(userWantBalance.add(shares.mul(1)))
  })

  it('withdraw2', async () => {
    await vault.setupStrat(strategy.address)

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(1))

    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))

    let userWantBalance = await want.balanceOf(user.address)
    let shares = await vault.balanceOf(user.address)
    await vault.connect(user).withdraw(shares)
    expect(await want.balanceOf(user.address)).to.eq(userWantBalance.add(shares.mul(2)))
  })

  it('withdraw3 with fee', async () => {
    await vault.setupStrat(strategy.address)

    await strategy.setWithdrawalTreasury(treasury.address)
    await strategy.setWithdrawalFee(100) // 1% withdrawal fee

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(1))

    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))

    let userWantBalance = await want.balanceOf(user.address)
    let shares = await vault.balanceOf(user.address)
    await vault.connect(user).withdraw(shares)

    const expectedBal = userWantBalance.add(shares.mul(2).mul(99).div(100)) // 1% withdrawal fee
    expect(await want.balanceOf(user.address)).to.eq(expectedBal)
    expect(await want.balanceOf(treasury.address)).to.eq(BN_1e18.mul(2))
  })

  it('update strategy 1', async () => {
    await vault.setupStrat(strategy.address)

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(1))

    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))
    expect(await vault.available()).to.eq(0)
    expect(await vault.balance()).to.eq(BN_1e18.mul(200))

    expect(await vault.strategy()).to.eq(strategy.address)
    expect(await want.balanceOf(strategy.address)).to.eq(BN_1e18.mul(200))
    expect(await want.balanceOf(strategy2.address)).to.eq(BN_1e18.mul(0))

    await vault.proposeStrat(strategy2.address)
    expect((await vault.stratCandidate()).implementation).to.eq(strategy2.address)

    await expect(vault.upgradeStrat()).to.be.revertedWith('Vault: TIME_INVALID')
  })

  it('update strategy 2', async () => {
    await vault.setupStrat(strategy.address)

    let wantDeposited = BN_1e18.mul(100)
    await want.connect(user).approve(vault.address, wantDeposited)
    await vault.connect(user).deposit(wantDeposited)
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(1))

    await want.mint(strategy.address, BN_1e18.mul(100))
    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))
    expect(await vault.available()).to.eq(0)
    expect(await vault.balance()).to.eq(BN_1e18.mul(200))

    expect(await vault.strategy()).to.eq(strategy.address)
    expect(await want.balanceOf(strategy.address)).to.eq(BN_1e18.mul(200))
    expect(await want.balanceOf(strategy2.address)).to.eq(BN_1e18.mul(0))

    await vault.proposeStrat(strategy2.address)
    expect((await vault.stratCandidate()).implementation).to.eq(strategy2.address)

    await ethers.provider.send('evm_increaseTime', [3600 * 48 + 1])
    await ethers.provider.send('evm_mine', [])

    await vault.upgradeStrat()

    expect(await vault.strategy()).to.eq(strategy2.address)
    expect((await vault.stratCandidate()).implementation).to.eq(ZERO_ADDRESS)
    expect(await want.balanceOf(strategy.address)).to.eq(BN_1e18.mul(0))
    expect(await want.balanceOf(strategy2.address)).to.eq(BN_1e18.mul(200))

    expect(await vault.getPricePerFullShare()).to.eq(BN_1e18.mul(2))
    expect(await vault.available()).to.eq(0)
    expect(await vault.balance()).to.eq(BN_1e18.mul(200))
  })

  it('inCaseTokensGetStuck1', async () => {
    await expect(vault.inCaseTokensGetStuck(ZERO_ADDRESS)).to.be.revertedWith('Vault: stuckToken_ZERO_ADDR')
  })

  it('inCaseTokensGetStuck2', async () => {
    await expect(vault.inCaseTokensGetStuck(want.address)).to.be.revertedWith('Vault: stuckToken_NOT_WANT')
  })

  it('inCaseTokensGetStuck3', async () => {
    const bal = ethers.utils.parseEther('1000')
    await token1.mint(vault.address, bal)

    expect(await token1.balanceOf(vault.address)).to.equal(bal)
    expect(await token1.balanceOf(owner.address)).to.equal(0)

    await vault.inCaseTokensGetStuck(token1.address)

    expect(await token1.balanceOf(vault.address)).to.equal(0)
    expect(await token1.balanceOf(owner.address)).to.equal(bal)
  })

  it('inCaseNativeTokensGetStuck', async () => {
    await owner.sendTransaction({
      to: vault.address,
      value: 123456,
    })

    await vault.inCaseNativeTokensGetStuck()
  })
})
