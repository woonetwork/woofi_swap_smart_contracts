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
import IWooracle from '../build/IWooracle.json'
import WooPP from '../build/WooPP.json'
import IWooPP from '../build/IWooPP.json'
import IWooRewardManager from '../build/IWooRewardManager.json'
// import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import IWooGuardian from '../build/IWooGuardian.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooFeeManager } from '../typechain'
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

describe('WooFeeManager Info', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress

  let feeManager: Contract
  let btcToken: Contract
  let usdtToken: Contract
  let wooPP: Contract
  let rewardManager: Contract

  before('Deploy ERC20', async () => {
    ;[owner, user1] = await ethers.getSigners()
    btcToken = await deployContract(owner, TestToken, [])
    usdtToken = await deployContract(owner, TestToken, [])
  })

  describe('ctor, init & basic func', () => {
    beforeEach('Deploy WooFeeManager', async () => {
      wooPP = await deployMockContract(owner, IWooPP.abi)
      rewardManager = await deployMockContract(owner, IWooRewardManager.abi)
      feeManager = (await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address,
        rewardManager.address,
      ])) as WooFeeManager
    })

    it('ctor', async () => {
      expect(await feeManager._OWNER_()).to.eq(owner.address)
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
      rewardManager = await deployMockContract(owner, IWooRewardManager.abi)
      feeManager = (await deployContract(owner, WooFeeManagerArtifact, [
        usdtToken.address,
        rewardManager.address,
      ])) as WooFeeManager

      await quoteToken.mint(feeManager.address, 30000)
      await quoteToken.mint(owner.address, 100)
    })

    it('withdraw accuracy1', async () => {
      expect(await quoteToken.balanceOf(user1.address)).to.eq(0)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(30000)

      await feeManager.withdraw(quoteToken.address, user1.address, 2000)

      expect(await quoteToken.balanceOf(user1.address)).to.eq(2000)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(28000)
    })

    it('withdraw revert1', async () => {
      await expect(feeManager.withdraw(ZERO_ADDR, user1.address, 100)).to.be.revertedWith(
        'WooFeeManager: token_ZERO_ADDR'
      )
    })

    it('withdraw revert2', async () => {
      await expect(feeManager.withdraw(quoteToken.address, ZERO_ADDR, 100)).to.be.revertedWith(
        'WooFeeManager: to_ZERO_ADDR'
      )
    })

    it('withdraw event1', async () => {
      await expect(feeManager.withdraw(quoteToken.address, user1.address, 111))
        .to.emit(feeManager, 'Withdraw')
        .withArgs(quoteToken.address, user1.address, 111)
    })

    it('withdrawAll accuracy1', async () => {
      expect(await quoteToken.balanceOf(user1.address)).to.eq(0)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(30000)

      await feeManager.withdrawAll(quoteToken.address, user1.address)

      expect(await quoteToken.balanceOf(user1.address)).to.eq(30000)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(0)
    })

    it('withdrawAllToOwner accuracy1', async () => {
      expect(await quoteToken.balanceOf(owner.address)).to.eq(100)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(30000)

      await feeManager.withdrawAllToOwner(quoteToken.address)

      expect(await quoteToken.balanceOf(owner.address)).to.eq(100 + 30000)
      expect(await quoteToken.balanceOf(feeManager.address)).to.eq(0)
    })

    it('withdrawAllToOwner revert1', async () => {
      await expect(feeManager.withdrawAllToOwner(ZERO_ADDR)).to.be.revertedWith('WooFeeManager: token_ZERO_ADDR')
    })

    it('withdrawAllToOwner event1', async () => {
      const amount = await quoteToken.balanceOf(feeManager.address)
      await expect(feeManager.withdrawAllToOwner(quoteToken.address))
        .to.emit(feeManager, 'Withdraw')
        .withArgs(quoteToken.address, owner.address, amount)
    })
  })
})
