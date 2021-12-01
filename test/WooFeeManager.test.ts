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
import WooFeeManagerArtifact from '../artifacts/contracts/WooFeeManager.sol/WooFeeManager.json'

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

  before('Deploy ERC20', async () => {
    ;[owner, user1, broker] = await ethers.getSigners()
    btcToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])

    rebateManager = await deployMockContract(owner, IWooRebateManager.abi)
    await rebateManager.mock.rebateRate.returns(REBATE_RATE)
    await rebateManager.mock.addRebate.returns()

    vaultManager = await deployMockContract(owner, IWooVaultManager.abi)
    await vaultManager.mock.addReward.returns()
  })

  describe('ctor, init & basic func', () => {

    beforeEach('Deploy WooFeeManager', async () => {
      wooPP = await deployMockContract(owner, IWooPP.abi)
      feeManager = await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address
      ]) as WooFeeManager
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
        usdtToken.address
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
        usdtToken.address
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
