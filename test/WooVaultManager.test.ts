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
import IWooVaultManager from '../build/IWooVaultManager.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { WooFeeManager, IERC20, WooVaultManager, WooAccessManager } from '../typechain'
import WooVaultManagerArtifact from '../artifacts/contracts/WooVaultManager.sol/WooVaultManager.json'
import WooAccessManagerArtifact from '../artifacts/contracts/WooAccessManager.sol/WooAccessManager.json'

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

describe('WooVaultManager', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let vault1: SignerWithAddress
  let vault2: SignerWithAddress
  let vault3: SignerWithAddress

  let vaultManager: WooVaultManager
  let wooAccessManager: WooAccessManager
  let btcToken: Contract
  let usdtToken: Contract
  let wooToken: Contract
  let wooPP: Contract

  before('Deploy ERC20', async () => {
    ;[owner, user1, vault1, vault2, vault3] = await ethers.getSigners()
    btcToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    wooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager

    wooPP = await deployMockContract(owner, IWooPP.abi)
    await wooPP.mock.quoteToken.returns(usdtToken.address)
    await wooPP.mock.querySellQuote.returns(MOCK_REWARD_AMOUNT)
    await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)
    // await vaultManager.mock.addRebate.returns()

    // vaultManager = await deployMockContract(owner, IWooVaultManager.abi)
    // await vaultManager.mock.addReward.returns()
    await usdtToken.mint(owner.address, 10000)
  })

  describe('ctor, init & basic func', () => {
    beforeEach('Deploy WooVaultManager', async () => {
      vaultManager = (await deployContract(owner, WooVaultManagerArtifact, [
        usdtToken.address,
        wooToken.address,
        wooAccessManager.address,
      ])) as WooVaultManager

      await vaultManager.setWooPP(wooPP.address)
    })

    it('ctor', async () => {
      expect(await vaultManager._OWNER_()).to.eq(owner.address)
    })

    it('Init fields', async () => {
      expect(await vaultManager.quoteToken()).to.eq(usdtToken.address)
      expect(await vaultManager.rewardToken()).to.eq(wooToken.address)
    })

    it('Set vaultWeight', async () => {
      expect(await vaultManager.totalWeight()).to.eq(0)

      const weight1 = 100
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault1.address, weight1)
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(weight1)
      expect(await vaultManager.totalWeight()).to.eq(weight1)

      const weight2 = 100
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault2.address, weight2)
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(weight2)
      expect(await vaultManager.totalWeight()).to.eq(weight1 + weight2)
    })

    it('Set vaultWeight acc2', async () => {
      expect(await vaultManager.totalWeight()).to.eq(0)

      let vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(0)

      const weight1 = 100
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault1.address, weight1)
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(weight1)
      expect(await vaultManager.totalWeight()).to.eq(weight1)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(1)

      const weight2 = 100
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault2.address, weight2)
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(weight2)
      expect(await vaultManager.totalWeight()).to.eq(weight1 + weight2)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(2)
      expect(vaults[0]).to.eq(vault1.address)
      expect(vaults[1]).to.eq(vault2.address)
    })

    it('Set vaultWeight acc3', async () => {
      expect(await vaultManager.totalWeight()).to.eq(0)

      let vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(0)

      const weight1 = 100
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault1.address, weight1)
      expect(await vaultManager.vaultWeight(vault1.address)).to.eq(weight1)
      expect(await vaultManager.totalWeight()).to.eq(weight1)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(1)

      const weight2 = 100
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(0)
      await vaultManager.setVaultWeight(vault2.address, weight2)
      expect(await vaultManager.vaultWeight(vault2.address)).to.eq(weight2)
      expect(await vaultManager.totalWeight()).to.eq(weight1 + weight2)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(2)
      expect(vaults[0]).to.eq(vault1.address)
      expect(vaults[1]).to.eq(vault2.address)

      await vaultManager.setVaultWeight(vault1.address, 0)
      expect(await vaultManager.totalWeight()).to.eq(0 + weight2)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(1)
      expect(vaults[0]).to.eq(vault2.address)

      await vaultManager.setVaultWeight(vault1.address, 100)
      expect(await vaultManager.totalWeight()).to.eq(100 + weight2)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(2)

      await vaultManager.setVaultWeight(vault1.address, 0)
      await vaultManager.setVaultWeight(vault2.address, 0)
      expect(await vaultManager.totalWeight()).to.eq(0)
      vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(0)
    })

    it('Set rebateRate revert1', async () => {
      await expect(vaultManager.setVaultWeight(ZERO_ADDR, 100)).to.be.revertedWith(
        'WooVaultManager: vaultAddr_ZERO_ADDR'
      )
    })

    it('addReward acc1', async () => {
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      expect(await usdtToken.balanceOf(owner.address)).to.equal(10000)
      expect(await usdtToken.balanceOf(vaultManager.address)).to.equal(0)

      const rewardAmount = 300
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      expect(await usdtToken.balanceOf(owner.address)).to.equal(10000 - rewardAmount)
      expect(await usdtToken.balanceOf(vaultManager.address)).to.equal(rewardAmount)

      expect(await vaultManager.pendingReward(vault1.address)).to.equal((rewardAmount * 20) / 100)
      expect(await vaultManager.pendingReward(vault2.address)).to.equal((rewardAmount * 80) / 100)

      const vaults = await vaultManager.allVaults()
      expect(vaults.length).to.eq(2)
    })

    it('pendingAllReward acc1', async () => {
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      expect(await vaultManager.pendingAllReward()).to.equal(0)

      const rewardAmount = 300
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      expect(await vaultManager.pendingAllReward()).to.equal(rewardAmount)
      expect(await usdtToken.balanceOf(vaultManager.address)).to.equal(rewardAmount)
    })

    it('pendingReward acc1', async () => {
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      expect(await vaultManager.pendingReward(vault1.address)).to.equal(0)
      expect(await vaultManager.pendingReward(vault2.address)).to.equal(0)

      const rewardAmount = 300
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      expect(await vaultManager.pendingReward(vault1.address)).to.equal((rewardAmount * 20) / 100)
      expect(await vaultManager.pendingReward(vault2.address)).to.equal((rewardAmount * 80) / 100)
    })

    it('pendingReward revert1', async () => {
      await expect(vaultManager.pendingReward(ZERO_ADDR)).to.be.revertedWith('WooVaultManager: vaultAddr_ZERO_ADDR')
    })

    it('distributeAllReward acc0', async () => {
      const rewardAmount = 100
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      await vaultManager.distributeAllReward()

      // Nothing happened since no weight (No exception should happen here)
    })

    it('distributeAllReward acc1', async () => {
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      await vaultManager.distributeAllReward()
    })

    it('distributeAllReward acc2', async () => {
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      const rewardAmount = 100
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      expect(await vaultManager.pendingReward(vault1.address)).to.equal((rewardAmount * 20) / 100)
      expect(await vaultManager.pendingReward(vault2.address)).to.equal((rewardAmount * 80) / 100)

      await wooToken.mint(vaultManager.address, 1000)
      await vaultManager.distributeAllReward()
    })

    it('distributeAllReward revert1', async () => {
      await wooPP.mock.sellQuote.returns(utils.parseEther('1.2'))

      await vaultManager.setVaultWeight(vault1.address, 20)

      const rewardAmount = 100
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      await expect(vaultManager.distributeAllReward()).to.be.revertedWith('WooVaultManager: woo amount INSUFF')

      await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)
    })

    it('distributeAllReward event', async () => {
      await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)
      await vaultManager.setVaultWeight(vault1.address, 20)
      await vaultManager.setVaultWeight(vault2.address, 80)

      const rewardAmount = 100
      await usdtToken.approve(vaultManager.address, rewardAmount)
      await vaultManager.addReward(rewardAmount)

      await expect(vaultManager.distributeAllReward())
        .to.emit(vaultManager, 'RewardDistributed')
        .withArgs(vault1.address, 0)

      await expect(vaultManager.distributeAllReward())
        .to.emit(vaultManager, 'RewardDistributed')
        .withArgs(vault2.address, 0)
    })
  })
})

describe('WooVaultManager Access Control', () => {
  let owner: SignerWithAddress
  let admin: SignerWithAddress
  let user: SignerWithAddress
  let vault: SignerWithAddress

  let wooVaultManager: WooVaultManager
  let wooAccessManager: WooAccessManager
  let newWooAccessManager: WooAccessManager
  let usdtToken: Contract
  let wooToken: Contract
  let wooPP: Contract
  let newWooPP: Contract

  let mintUSDT = BigNumber.from(30000)

  let onlyOwnerRevertedMessage: string
  let onlyAdminRevertedMessage: string

  before(async () => {
    ;[owner, admin, user, vault] = await ethers.getSigners()
    usdtToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    wooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager
    await wooAccessManager.setVaultAdmin(admin.address, true)
    newWooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager

    wooPP = await deployMockContract(owner, IWooPP.abi)
    await wooPP.mock.quoteToken.returns(usdtToken.address)
    await wooPP.mock.querySellQuote.returns(MOCK_REWARD_AMOUNT)
    await wooPP.mock.sellQuote.returns(MOCK_REWARD_AMOUNT)

    newWooPP = await deployMockContract(owner, IWooPP.abi)
    await newWooPP.mock.quoteToken.returns(usdtToken.address)

    wooVaultManager = (await deployContract(owner, WooVaultManagerArtifact, [
      usdtToken.address,
      wooToken.address,
      wooAccessManager.address,
    ])) as WooVaultManager

    await usdtToken.mint(owner.address, mintUSDT)

    onlyOwnerRevertedMessage = 'InitializableOwnable: NOT_OWNER'
    onlyAdminRevertedMessage = 'WooVaultManager: NOT_ADMIN'
  })

  it('Only admin able to setVaultWeight', async () => {
    let weight = BigNumber.from(100)
    expect(await wooAccessManager.isVaultAdmin(user.address)).to.eq(false)
    await expect(wooVaultManager.connect(user).setVaultWeight(vault.address, weight)).to.be.revertedWith(
      onlyAdminRevertedMessage
    )

    expect(await wooAccessManager.isVaultAdmin(admin.address)).to.eq(true)
    await wooVaultManager.connect(admin).setVaultWeight(vault.address, weight)
    expect(await wooVaultManager.vaultWeight(vault.address)).to.eq(weight)

    weight = BigNumber.from(200)
    await wooVaultManager.connect(owner).setVaultWeight(vault.address, weight)
    expect(await wooVaultManager.vaultWeight(vault.address)).to.eq(weight)
  })

  it('Only admin able to distributeAllReward', async () => {
    // @qc TODO Wrong code that need to be fixed
    expect(await usdtToken.balanceOf(owner.address)).to.eq(mintUSDT)
    let rewardAmount = BigNumber.from(100)
    await usdtToken.connect(owner).approve(wooVaultManager.address, rewardAmount)
    await wooVaultManager.connect(owner).addReward(rewardAmount)
    expect(await usdtToken.balanceOf(wooVaultManager.address)).to.eq(rewardAmount)

    expect(await wooAccessManager.isVaultAdmin(user.address)).to.eq(false)
    await expect(wooVaultManager.connect(user).distributeAllReward()).to.be.revertedWith(onlyAdminRevertedMessage)

    expect(await wooAccessManager.isVaultAdmin(admin.address)).to.eq(true)
    await wooVaultManager.connect(admin).distributeAllReward()
    expect(await usdtToken.balanceOf(wooVaultManager.address)).to.eq(BigNumber.from(0))

    await usdtToken.mint(wooVaultManager.address, mintUSDT)
    expect(await usdtToken.balanceOf(wooVaultManager.address)).to.eq(mintUSDT)
    await wooVaultManager.connect(owner).distributeAllReward()
    expect(await usdtToken.balanceOf(wooVaultManager.address)).to.eq(BigNumber.from(0))
  })

  it('Only admin able to setWooPP', async () => {
    expect(await wooAccessManager.isVaultAdmin(user.address)).to.eq(false)
    await expect(wooVaultManager.connect(user).setWooPP(newWooPP.address)).to.be.revertedWith(onlyAdminRevertedMessage)

    expect(await wooAccessManager.isVaultAdmin(admin.address)).to.eq(true)
    await wooVaultManager.connect(admin).setWooPP(newWooPP.address)

    await wooVaultManager.connect(owner).setWooPP(wooPP.address)
  })

  it('Only owner able to setWooAccessManager', async () => {
    expect(await wooVaultManager.wooAccessManager()).to.eq(wooAccessManager.address)
    await expect(wooVaultManager.connect(user).setWooAccessManager(newWooAccessManager.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await expect(wooVaultManager.connect(admin).setWooAccessManager(newWooAccessManager.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await wooVaultManager.connect(owner).setWooAccessManager(newWooAccessManager.address)
    expect(await wooVaultManager.wooAccessManager()).to.eq(newWooAccessManager.address)
  })

  it('Only owner able to emergencyWithdraw', async () => {
    await expect(wooVaultManager.connect(user).emergencyWithdraw(usdtToken.address, user.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await expect(wooVaultManager.connect(admin).emergencyWithdraw(usdtToken.address, admin.address)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await wooVaultManager.connect(owner).emergencyWithdraw(usdtToken.address, owner.address)
  })
})
