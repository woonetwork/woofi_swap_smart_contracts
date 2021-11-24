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
import { Contract } from 'ethers'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

// import WooPP from '../build/WooPP.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'
import IWooracle from '../build/IWooracle.json'
import IWooFeeManager from '../build/IWooFeeManager.json'
import IWooGuardian from '../build/IWooGuardian.json'
import AggregatorV3Interface from '../build/AggregatorV3Interface.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooPP, IWooFeeManager__factory } from '../typechain'
import WooPPArtifact from '../artifacts/contracts/WooPP.sol/WooPP.json'

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

const POW_8 = BigNumber.from(10).pow(8)
const POW_9 = BigNumber.from(10).pow(9)
const ONE = BigNumber.from(10).pow(18)
const OVERFLOW_UINT112 = BigNumber.from(10).pow(32).mul(52)
const OVERFLOW_UINT64 = BigNumber.from(10).pow(18).mul(19)
const POW_18 = BigNumber.from(10).pow(18)

describe('WooPP Test Suite 1', () => {
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let wooracle: SignerWithAddress

  let quoteToken: Contract
  let feeManager: Contract
  let wooGuardian: Contract
  let baseToken1: Contract
  let baseToken2: Contract

  before('deploy ERC20', async () => {
    ;[owner, user1, wooracle] = await ethers.getSigners()
    quoteToken = await deployMockContract(owner, IERC20.abi)
    baseToken1 = await deployMockContract(owner, IERC20.abi)
    baseToken2 = await deployMockContract(owner, IERC20.abi)
    feeManager = await deployMockContract(owner, IWooFeeManager.abi)
    wooGuardian = await deployMockContract(owner, IWooGuardian.abi)
  })

  describe('#ctor, init & info', () => {
    let wooPP: WooPP

    beforeEach('deploy WooPP', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooracle.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP
    })

    it('ctor', async () => {
      expect(await wooPP._OWNER_()).to.eq(owner.address)
    })

    it('ctor failure1', async () => {
      await expect(
        deployContract(owner, WooPPArtifact, [ZERO_ADDR, wooracle.address, feeManager.address, wooGuardian.address])
      ).to.be.revertedWith('WooPP: INVALID_QUOTE')
    })

    it('ctor failure2', async () => {
      await expect(
        deployContract(owner, WooPPArtifact, [quoteToken.address, ZERO_ADDR, feeManager.address, wooGuardian.address])
      ).to.be.revertedWith('WooPP: newWooracle_ZERO_ADDR')
    })

    it('ctor failure3', async () => {
      await expect(
        deployContract(owner, WooPPArtifact, [quoteToken.address, wooracle.address, ZERO_ADDR, wooGuardian.address])
      ).to.be.revertedWith('WooPP: newFeeManager_ZERO_ADDR')
    })

    it('init', async () => {
      expect(await wooPP.quoteToken()).to.eq(quoteToken.address)
      expect(await wooPP.wooracle()).to.eq(wooracle.address)
    })

    it('tokenInfo', async () => {
      const quoteInfo = await wooPP.tokenInfo(quoteToken.address)
      expect(quoteInfo.isValid).to.eq(true)
      expect(quoteInfo.reserve).to.eq(0)
      expect(quoteInfo.threshold).to.eq(0)
      expect(quoteInfo.lastResetTimestamp).to.eq(0)
      expect(quoteInfo.R).to.eq(0)
      expect(quoteInfo.target).to.eq(0)
    })

    it('pairsInfo', async () => {
      expect(await wooPP.pairsInfo()).to.eq('')
      const pair = 'BNB/ETH/BTCB/WOO-USDT'
      await wooPP.setPairsInfo(pair)
      expect(await wooPP.pairsInfo()).to.eq(pair)
    })
  })

  describe('add and remove base token', () => {
    let wooPP: WooPP

    beforeEach('deploy WooPP', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooracle.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP
    })

    it('addBaseToken', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      const info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(1)
      expect(info.R).to.eq(2)
      expect(info.target).to.eq(1)
      expect(info.lastResetTimestamp).to.eq(0)
    })

    it('addBaseToken revert1', async () => {
      await expect(wooPP.addBaseToken(ZERO_ADDR, 1, 2)).to.be.revertedWith('WooPP: BASE_TOKEN_ZERO_ADDR')
    })

    it('addBaseToken revert2', async () => {
      await expect(wooPP.addBaseToken(quoteToken.address, 1, 2)).to.be.revertedWith('WooPP: baseToken==quoteToken')
    })

    it('addBaseToken revert3', async () => {
      await expect(wooPP.addBaseToken(baseToken1.address, OVERFLOW_UINT112, 2)).to.be.revertedWith(
        'WooPP: THRESHOLD_OUT_OF_RANGE'
      )
    })

    it('addBaseToken revert4', async () => {
      await expect(wooPP.addBaseToken(baseToken1.address, 1, OVERFLOW_UINT112)).to.be.revertedWith(
        'WooPP: R_OUT_OF_RANGE'
      )
    })

    it('addBaseToken revert5', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      const info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      await expect(wooPP.addBaseToken(baseToken1.address, 1, 2)).to.be.revertedWith('WooPP: TOKEN_ALREADY_EXISTS')
    })

    it('addBaseToken event1', async () => {
      await expect(wooPP.addBaseToken(baseToken1.address, 1, 2))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(baseToken1.address, 1, 2)
    })

    it('removeBaseToken', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(1)
      expect(info.R).to.eq(2)
      expect(info.target).to.eq(1)
      expect(info.lastResetTimestamp).to.eq(0)

      await wooPP.removeBaseToken(baseToken1.address)

      info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(false)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(0)
      expect(info.R).to.eq(0)
      expect(info.target).to.eq(0)
      expect(info.lastResetTimestamp).to.eq(0)
    })

    it('removeBaseToken revert1', async () => {
      await expect(wooPP.removeBaseToken(ZERO_ADDR)).to.be.revertedWith('WooPP: BASE_TOKEN_ZERO_ADDR')
    })

    it('removeBaseToken revert2', async () => {
      await expect(wooPP.removeBaseToken(baseToken1.address)).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('removeBaseToken event1', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)

      await expect(wooPP.removeBaseToken(baseToken1.address))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(baseToken1.address, 0, 0)
    })
  })

  describe('params tuning', () => {
    let wooPP: WooPP

    beforeEach('deploy WooPP', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooracle.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP
    })

    it('tuneParameters accuracy1', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(1)
      expect(info.R).to.eq(2)
      expect(info.target).to.eq(1)
      expect(info.lastResetTimestamp).to.eq(0)

      await wooPP.tuneParameters(baseToken1.address, 11, 22)

      info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.threshold).to.eq(11)
      expect(info.R).to.eq(22)
      expect(info.target).to.eq(11)
    })

    it('tuneParameters accuracy2', async () => {
      await wooPP.addBaseToken(baseToken1.address, 111, 222)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(111)
      expect(info.R).to.eq(222)
      expect(info.target).to.eq(111)
      expect(info.lastResetTimestamp).to.eq(0)

      await wooPP.tuneParameters(baseToken1.address, 11, 22)

      info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.threshold).to.eq(11)
      expect(info.R).to.eq(22)
      expect(info.target).to.eq(111)
    })

    it('tuneParameters accuracy3', async () => {
      await wooPP.addBaseToken(baseToken1.address, 111, 222)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)
      expect(info.reserve).to.eq(0)
      expect(info.threshold).to.eq(111)
      expect(info.R).to.eq(222)
      expect(info.target).to.eq(111)
      expect(info.lastResetTimestamp).to.eq(0)

      await wooPP.tuneParameters(baseToken1.address, 11, POW_18)

      info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.threshold).to.eq(11)
      expect(info.R).to.eq(POW_18)
      expect(info.target).to.eq(111)
    })

    it('tuneParameters revert1', async () => {
      await expect(wooPP.tuneParameters(ZERO_ADDR, 11, 22)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    })

    it('tuneParameters revert2', async () => {
      await expect(wooPP.tuneParameters(baseToken1.address, OVERFLOW_UINT112, 22)).to.be.revertedWith(
        'WooPP: THRESHOLD_OUT_OF_RANGE'
      )
    })

    it('tuneParameters revert3_1', async () => {
      await expect(wooPP.tuneParameters(baseToken1.address, 11, OVERFLOW_UINT64)).to.be.revertedWith('WooPP: R>1')
    })

    it('tuneParameters revert3_2', async () => {
      const R = POW_18.add(1)
      await expect(wooPP.tuneParameters(baseToken1.address, 11, R)).to.be.revertedWith('WooPP: R>1')
    })

    it('tuneParameters revert4', async () => {
      await expect(wooPP.tuneParameters(baseToken1.address, 11, 22)).to.be.revertedWith('WooPP: TOKEN_DOES_NOT_EXIST')
    })

    it('tuneParameters event1', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)

      await expect(wooPP.tuneParameters(baseToken1.address, 11, 22))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(baseToken1.address, 11, 22)
    })

    it('tuneParameters event1', async () => {
      await wooPP.addBaseToken(baseToken1.address, 1, 2)
      let info = await wooPP.tokenInfo(baseToken1.address)
      expect(info.isValid).to.eq(true)

      await expect(wooPP.tuneParameters(baseToken1.address, 11, 22))
        .to.emit(wooPP, 'ParametersUpdated')
        .withArgs(baseToken1.address, 11, 22)
    })
  })

  describe('admin & strategist', () => {
    let wooPP: WooPP
    let quoteToken: Contract
    let baseToken1: Contract
    let baseToken2: Contract

    before('deploy ERC20', async () => {
      quoteToken = await deployMockContract(owner, IERC20.abi)
      baseToken1 = await deployMockContract(owner, IERC20.abi)
      baseToken2 = await deployMockContract(owner, IERC20.abi)
    })

    beforeEach('deploy WooPP', async () => {
      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooracle.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP
    })

    it('isStrategist accuracy1', async () => {
      let isStrategist = await wooPP.isStrategist(baseToken1.address)
      expect(isStrategist).to.eq(false)
    })

    it('setStrategist accuracy1', async () => {
      let isStrategist = await wooPP.isStrategist(baseToken2.address)
      expect(isStrategist).to.eq(false)

      await wooPP.setStrategist(baseToken2.address, true)
      isStrategist = await wooPP.isStrategist(baseToken2.address)
      expect(isStrategist).to.eq(true)
    })

    it('setStrategist accuracy2', async () => {
      let isStrategist = await wooPP.isStrategist(baseToken2.address)
      expect(isStrategist).to.eq(false)

      await wooPP.setStrategist(baseToken2.address, true)
      isStrategist = await wooPP.isStrategist(baseToken2.address)
      expect(isStrategist).to.eq(true)

      await wooPP.setStrategist(baseToken2.address, false)
      isStrategist = await wooPP.isStrategist(baseToken2.address)
      expect(isStrategist).to.eq(false)
    })

    it('setStrategist revert1', async () => {
      await expect(wooPP.setStrategist(ZERO_ADDR, true)).to.be.revertedWith('WooPP: strategist_ZERO_ADDR')
    })

    it('setStrategist event1', async () => {
      await expect(wooPP.setStrategist(baseToken1.address, true))
        .to.emit(wooPP, 'StrategistUpdated')
        .withArgs(baseToken1.address, true)
    })
  })

  describe('withdraw', () => {
    let wooPP: WooPP
    let quoteToken: Contract
    let baseToken1: Contract
    let wooOracle1: Contract

    before('deploy ERC20', async () => {
      wooOracle1 = await deployMockContract(owner, IWooracle.abi)
    })

    beforeEach('deploy WooPP', async () => {
      quoteToken = await deployContract(owner, TestToken, [])
      baseToken1 = await deployContract(owner, TestToken, [])

      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooOracle1.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP

      await quoteToken.mint(wooPP.address, 30000)
      await baseToken1.mint(wooPP.address, 10000)

      await baseToken1.mint(owner.address, 100)
    })

    it('withdraw accuracy1', async () => {
      expect(await baseToken1.balanceOf(user1.address)).to.eq(0)
      expect(await baseToken1.balanceOf(wooPP.address)).to.eq(10000)

      await wooPP.withdraw(baseToken1.address, user1.address, 2000)

      // await expect(() => wooPP.withdraw(baseToken1.address, user1.address, 2000))
      //     .to.changeTokenBalances(baseToken1, [wooPP, user1], [-2000, 2000]);

      expect(await baseToken1.balanceOf(user1.address)).to.eq(2000)
      expect(await baseToken1.balanceOf(wooPP.address)).to.eq(8000)
    })

    it('withdraw revert1', async () => {
      await expect(wooPP.withdraw(ZERO_ADDR, user1.address, 100)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    })

    it('withdraw revert2', async () => {
      await expect(wooPP.withdraw(baseToken1.address, ZERO_ADDR, 100)).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    })

    it('withdraw event1', async () => {
      await expect(wooPP.withdraw(baseToken1.address, user1.address, 111))
        .to.emit(wooPP, 'Withdraw')
        .withArgs(baseToken1.address, user1.address, 111)
    })

    it('withdrawAllToOwner accuracy1', async () => {
      expect(await baseToken1.balanceOf(owner.address)).to.eq(100)
      expect(await baseToken1.balanceOf(wooPP.address)).to.eq(10000)

      await wooPP.withdrawAllToOwner(baseToken1.address)

      // await expect(() => wooPP.withdraw(baseToken1.address, user1.address, 2000))
      //     .to.changeTokenBalances(baseToken1, [wooPP, user1], [-2000, 2000]);

      expect(await baseToken1.balanceOf(owner.address)).to.eq(100 + 10000)
      expect(await baseToken1.balanceOf(wooPP.address)).to.eq(0)
    })

    it('withdrawAllToOwner revert1', async () => {
      await expect(wooPP.withdrawAllToOwner(ZERO_ADDR)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    })

    it('withdrawAllToOwner event1', async () => {
      const poolSize = await wooPP.poolSize(baseToken1.address)
      console.log(poolSize)
      await expect(wooPP.withdrawAllToOwner(baseToken1.address))
        .to.emit(wooPP, 'Withdraw')
        .withArgs(baseToken1.address, owner.address, poolSize)
    })
  })

  describe('fee manager and oracles', () => {
    let wooPP: WooPP
    let quoteToken: Contract
    let baseToken1: Contract
    let wooOracle1: Contract
    let wooOracle2: Contract
    let chainlinkOracle: Contract

    before('deploy ERC20', async () => {
      wooOracle1 = await deployMockContract(owner, IWooracle.abi)
      wooOracle2 = await deployMockContract(owner, IWooracle.abi)

      chainlinkOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
      await chainlinkOracle.mock.decimals.returns(18)
    })

    beforeEach('deploy WooPP', async () => {
      quoteToken = await deployContract(owner, TestToken, [])
      baseToken1 = await deployContract(owner, TestToken, [])

      wooPP = (await deployContract(owner, WooPPArtifact, [
        quoteToken.address,
        wooOracle1.address,
        feeManager.address,
        wooGuardian.address,
      ])) as WooPP

      await quoteToken.mint(wooPP.address, 30000)
      await baseToken1.mint(wooPP.address, 10000)

      await baseToken1.mint(owner.address, 100)
    })

    it('pooSize accuracy', async () => {
      expect(await wooPP.poolSize(quoteToken.address)).to.eq(30000)
      expect(await wooPP.poolSize(baseToken1.address)).to.eq(10000)
      await wooPP.withdrawAllToOwner(baseToken1.address)
      expect(await wooPP.poolSize(baseToken1.address)).to.eq(0)
    })

    it('wooracle accuracy', async () => {
      expect(await wooPP.wooracle()).to.eq(wooOracle1.address)
    })

    it('setWooracle accuracy', async () => {
      expect(await wooPP.wooracle()).to.eq(wooOracle1.address)
      await wooPP.setWooracle(wooOracle2.address)
      expect(await wooPP.wooracle()).to.eq(wooOracle2.address)
    })

    it('setWooracle revert1', async () => {
      await expect(wooPP.setWooracle(ZERO_ADDR)).to.be.revertedWith('WooPP: newWooracle_ZERO_ADDR')
    })

    it('setWooracle event1', async () => {
      await expect(wooPP.setWooracle(wooOracle2.address)).to.emit(wooPP, 'WooracleUpdated').withArgs(wooOracle2.address)
    })

    // --------------------------------------------

    it('feeManager accuracy', async () => {
      expect(await wooPP.feeManager()).to.eq(feeManager.address)
    })

    it('setFeeManager accuracy', async () => {
      expect(await wooPP.feeManager()).to.eq(feeManager.address)
      await wooPP.setFeeManager(feeManager.address)
      expect(await wooPP.feeManager()).to.eq(feeManager.address)
    })

    it('setFeeManager event1', async () => {
      await expect(wooPP.setFeeManager(feeManager.address))
        .to.emit(wooPP, 'FeeManagerUpdated')
        .withArgs(feeManager.address)
    })
  })
})
