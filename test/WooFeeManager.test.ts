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
import IWooFeeManager from '../build/IWooFeeManager.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import {WooFeeManager, IERC20, WooRebateManager, WooAccessManager} from '../typechain'
import WooFeeManagerArtifact from '../artifacts/contracts/WooFeeManager.sol/WooFeeManager.json'
import WooAccessManagerArtifact from "../artifacts/contracts/WooAccessManager.sol/WooAccessManager.json";

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const BTC_PRICE = 60000
const WOO_PRICE = 1.05

const ONE = BigNumber.from(10).pow(18)
const FEE_RATE = utils.parseEther('0.001')
const REBATE_RATE = utils.parseEther('0.1')

describe('WooFeeManager Info', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let broker: SignerWithAddress

  let feeManager: WooFeeManager
  let btcToken: Contract
  let usdtToken: Contract
  let wooPP: Contract
  let rebateManager: Contract
  let vaultManager: Contract
  let wooAccessManager: Contract

  before('Deploy ERC20', async () => {
    ;[owner, user1, broker] = await ethers.getSigners()
    btcToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])

    rebateManager = await deployMockContract(owner, IWooRebateManager.abi)
    await rebateManager.mock.rebateRate.returns(REBATE_RATE)
    await rebateManager.mock.addRebate.returns()

    vaultManager = await deployMockContract(owner, IWooVaultManager.abi)
    await vaultManager.mock.addReward.returns()

    wooAccessManager = await deployMockContract(owner, IWooFeeManager.abi)
  })

  describe('ctor, init & basic func', () => {
    beforeEach('Deploy WooFeeManager', async () => {
      wooPP = await deployMockContract(owner, IWooPP.abi)
      feeManager = (await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address,
        rebateManager.address,
        vaultManager.address,
        wooAccessManager.address,
      ])) as WooFeeManager
    })

    it('ctor', async () => {
      expect(await feeManager._OWNER_()).to.eq(owner.address)
    })

    it('Get fee rate', async () => {
      expect(await feeManager.feeRate(btcToken.address)).to.eq(0)
      expect(await feeManager.feeRate(usdtToken.address)).to.eq(0)
    })

    it('Set fee rate', async () => {
      await feeManager.setFeeRate(btcToken.address, FEE_RATE)
      expect(await feeManager.feeRate(btcToken.address)).to.eq(FEE_RATE)
    })

    it('Set fee rate revert', async () => {
      await expect(feeManager.setFeeRate(btcToken.address, ONE)).to.be.revertedWith('WooFeeManager: FEE_RATE>1%')
    })
  })

  describe('withdraw', () => {
    let quoteToken: Contract

    beforeEach('deploy WooFeeManager', async () => {
      quoteToken = await deployContract(owner, TestToken, [])

      wooPP = await deployMockContract(owner, IWooPP.abi)
      feeManager = (await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address,
        rebateManager.address,
        vaultManager.address,
        wooAccessManager.address,
      ])) as WooFeeManager

      await quoteToken.mint(feeManager.address, 30000)
      await quoteToken.mint(owner.address, 100)
    })

    it('emergencyWithdraw accuracy1', async () => {
      expect(await quoteToken.balanceOf(user1.address)).to.eq(0)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(30000)

      await feeManager.emergencyWithdraw(quoteToken.address, user1.address)

      expect(await quoteToken.balanceOf(user1.address)).to.eq(30000)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(0)
    })

    it('emergencyWithdraw revert1', async () => {
      await expect(feeManager.emergencyWithdraw(ZERO_ADDR, user1.address)).to.be.revertedWith(
        'WooFeeManager: token_ZERO_ADDR'
      )
    })

    it('emergencyWithdraw revert2', async () => {
      await expect(feeManager.emergencyWithdraw(quoteToken.address, ZERO_ADDR)).to.be.revertedWith(
        'WooFeeManager: to_ZERO_ADDR'
      )
    })

    it('emergencyWithdraw event1', async () => {
      const amount = await quoteToken.balanceOf(feeManager.address)
      await expect(feeManager.emergencyWithdraw(quoteToken.address, user1.address))
        .to.emit(feeManager, 'Withdraw')
        .withArgs(quoteToken.address, user1.address, amount)
    })
  })

  describe('collectFee', () => {
    beforeEach('deploy WooFeeManager', async () => {
      wooPP = await deployMockContract(owner, IWooPP.abi)

      feeManager = (await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address,
        rebateManager.address,
        vaultManager.address,
        wooAccessManager.address
      ])) as WooFeeManager

      feeManager.setRebateManager(rebateManager.address)
      feeManager.setVaultManager(vaultManager.address)

      await usdtToken.mint(feeManager.address, 30000)
      await usdtToken.mint(owner.address, 100000)
    })

    it('collectFee accuracy1', async () => {
      const ownerBalance = await usdtToken.balanceOf(owner.address)
      const feeManagerBalance = await usdtToken.balanceOf(feeManager.address)
      const rebateManagerBalance = await usdtToken.balanceOf(rebateManager.address)
      const vaultManagerBalance = await usdtToken.balanceOf(vaultManager.address)
      const brokerBalance = await usdtToken.balanceOf(broker.address)

      expect(ownerBalance).to.equal(100000)
      expect(feeManagerBalance).to.equal(30000)
      expect(rebateManagerBalance).to.equal(0)
      expect(vaultManagerBalance).to.equal(0)
      expect(brokerBalance).to.equal(0)

      await usdtToken.approve(feeManager.address, 100)
      await feeManager.collectFee(100, broker.address)

      expect(await usdtToken.balanceOf(owner.address)).to.eq(ownerBalance.sub(100))
      expect(await usdtToken.balanceOf(feeManager.address)).to.eq(feeManagerBalance.add(100))
    })
  })
})

describe('WooFeeManager Access Control', () => {
  let owner: SignerWithAddress
  let admin: SignerWithAddress
  let user: SignerWithAddress

  let wooFeeManager: WooFeeManager
  let token: Contract
  let rebateManager: SignerWithAddress
  let newRebateManager: SignerWithAddress
  let vaultManager: SignerWithAddress
  let newVaultManager: SignerWithAddress
  let wooAccessManager: WooAccessManager
  let newWooAccessManager: WooAccessManager

  let onlyOwnerRevertedMessage: string
  let onlyAdminRevertedMessage: string

  let mintToken = BigNumber.from(30000)

  before(async () => {
    ;[owner, admin, user, rebateManager, newRebateManager, vaultManager, newVaultManager] = await ethers.getSigners()
    token = await deployContract(owner, TestToken, [])
    wooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager
    await wooAccessManager.setFeeAdmin(admin.address, true)
    newWooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager

    wooFeeManager = (await deployContract(owner, WooFeeManagerArtifact, [
      token.address, rebateManager.address, vaultManager.address, wooAccessManager.address
    ])) as WooFeeManager

    await token.mint(wooFeeManager.address, mintToken)

    onlyOwnerRevertedMessage = 'InitializableOwnable: NOT_OWNER'
    onlyAdminRevertedMessage = 'WooFeeManager: NOT_ADMIN'
  })

  it('Only admin able to setFeeRate', async () => {
    expect(await wooFeeManager.feeRate(token.address)).to.eq(BigNumber.from(0))
    let newFeeRate = ONE.div(BigNumber.from(100))
    expect(await wooAccessManager.isFeeAdmin(user.address)).to.eq(false)
    await expect(wooFeeManager.connect(user).setFeeRate(token.address, newFeeRate)).to.be.revertedWith(
      onlyAdminRevertedMessage
    )
    expect(await wooAccessManager.isFeeAdmin(admin.address)).to.eq(true)
    await wooFeeManager.connect(admin).setFeeRate(token.address, newFeeRate)
    expect(await wooFeeManager.feeRate(token.address)).to.eq(newFeeRate)

    newFeeRate = newFeeRate.div(BigNumber.from(10))
    await wooFeeManager.connect(owner).setFeeRate(token.address, newFeeRate)
    expect(await wooFeeManager.feeRate(token.address)).to.eq(newFeeRate)
  })

  it('Only admin able to setRebateManager', async () => {
    expect(await wooFeeManager.rebateManager()).to.eq(rebateManager.address)
    await expect(wooFeeManager.connect(user).setRebateManager(newRebateManager.address)).to.be.revertedWith(
      onlyAdminRevertedMessage
    )
    await wooFeeManager.connect(admin).setRebateManager(newRebateManager.address)
    expect(await wooFeeManager.rebateManager()).to.eq(newRebateManager.address)

    await wooFeeManager.connect(owner).setRebateManager(rebateManager.address)
    expect(await wooFeeManager.rebateManager()).to.eq(rebateManager.address)
  })

  it('Only admin able to setVaultManager', async () => {
    expect(await wooFeeManager.vaultManager()).to.eq(vaultManager.address)
    await expect(wooFeeManager.connect(user).setVaultManager(newVaultManager.address)).to.be.revertedWith(
      onlyAdminRevertedMessage
    )
    await wooFeeManager.connect(admin).setVaultManager(newVaultManager.address)
    expect(await wooFeeManager.vaultManager()).to.eq(newVaultManager.address)

    await wooFeeManager.connect(owner).setVaultManager(vaultManager.address)
    expect(await wooFeeManager.vaultManager()).to.eq(vaultManager.address)
  })

  it('Only admin able to setVaultRewardRate', async () => {
    let newVaultRewardRate = ONE.div(BigNumber.from(10))
    await expect(wooFeeManager.connect(user).setVaultRewardRate(newVaultRewardRate)).to.be.revertedWith(
      onlyAdminRevertedMessage
    )

    await wooFeeManager.connect(admin).setVaultRewardRate(newVaultRewardRate)

    newVaultRewardRate = newVaultRewardRate.div(BigNumber.from(10))
    await wooFeeManager.connect(admin).setVaultRewardRate(newVaultRewardRate)
  })

  it('Only owner able to emergencyWithdraw', async () => {
    expect(await token.balanceOf(user.address)).to.eq(BigNumber.from(0))
    await expect(wooFeeManager.connect(user).emergencyWithdraw(token.address, user.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    expect(await token.balanceOf(user.address)).to.eq(BigNumber.from(0))

    expect(await token.balanceOf(admin.address)).to.eq(BigNumber.from(0))
    await expect(wooFeeManager.connect(admin).emergencyWithdraw(token.address, admin.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    expect(await token.balanceOf(admin.address)).to.eq(BigNumber.from(0))

    expect(await token.balanceOf(owner.address)).to.eq(BigNumber.from(0))
    await wooFeeManager.connect(owner).emergencyWithdraw(token.address, owner.address)
    expect(await token.balanceOf(owner.address)).to.eq(mintToken)
  })

  it('Only owner able to setWooAccessManager', async () => {
    expect(await wooFeeManager.wooAccessManager()).to.eq(wooAccessManager.address)
    await expect(wooFeeManager.connect(user).setWooAccessManager(newWooAccessManager.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await expect(wooFeeManager.connect(admin).setWooAccessManager(newWooAccessManager.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await wooFeeManager.connect(owner).setWooAccessManager(newWooAccessManager.address)
    expect(await wooFeeManager.wooAccessManager()).to.eq(newWooAccessManager.address)
  })
})
