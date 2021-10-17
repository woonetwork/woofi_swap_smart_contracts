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
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
*/

import { expect, use } from 'chai'
import { Contract, utils, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import Wooracle from '../build/Wooracle.json'
import WooPP from '../build/WooPP.json'
import IWooPP from '../build/IWooPP.json'
import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'

use(solidity)

const {
  BigNumber,
  constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const ONE = BigNumber.from(10).pow(18)

describe('WooRouter', () => {
  const [owner, user, approveTarget, swapTarget] = new MockProvider().getWallets()

  describe('ctor, init & basic func', () => {
    let wooracle: Contract
    let wooPP: Contract
    let wooRouter: Contract
    let baseToken: Contract
    let quoteToken: Contract
    let wooToken: Contract

    before('Deploy ERC20', async () => {
      baseToken = await deployContract(owner, TestToken, [])
      quoteToken = await deployContract(owner, TestToken, [])
      wooToken = await deployContract(owner, TestToken, [])
    })

    beforeEach('Deploy WooRouter', async () => {
      wooracle = await deployContract(owner, Wooracle, [])
      wooPP = await deployContract(owner, WooPP, [quoteToken.address, wooracle.address, ZERO_ADDR])
      wooRouter = await deployContract(owner, WooRouter, [WBNB_ADDR, wooPP.address])
    })

    it('Init with correct owner', async () => {
      expect(await wooRouter.owner()).to.eq(owner.address)
    })

    it('Init state variables', async () => {
      expect(await wooRouter.quoteToken()).to.eq(quoteToken.address)
      expect(await wooRouter.wooPool()).to.eq(wooPP.address)
    })

    it('Ctor revert', async () => {
      await expect((wooRouter = await deployContract(owner, WooRouter, [ZERO_ADDR, wooPP.address]))).to.be.revertedWith(
        'WooRouter: weth_ZERO_ADDR'
      )
    })

    it('ETH', async () => {
      expect(await wooRouter.WETH()).to.eq(WBNB_ADDR)
    })

    it('quoteToken accuracy1', async () => {
      expect(await wooRouter.quoteToken()).to.eq(await wooPP.quoteToken())
    })

    it('quoteToken accuracy2', async () => {
      expect(await wooRouter.quoteToken()).to.eq(await wooPP.quoteToken())

      let newWooPP = await deployMockContract(owner, IWooPP.abi)
      await newWooPP.mock.quoteToken.returns(wooToken.address)
      await wooRouter.setPool(newWooPP.address)
      expect(await wooRouter.quoteToken()).to.eq(wooToken.address)
    })

    it('setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      await wooRouter.setPool(anotherWooPP.address)
      expect(await wooRouter.quoteToken()).to.eq(anotherQuoteToken.address)
      expect(await wooRouter.wooPool()).to.eq(anotherWooPP.address)
    })

    it('setPool revert1', async () => {
      await expect(wooRouter.setPool(ZERO_ADDR)).to.be.revertedWith('WooRouter: newPool_ADDR_ZERO')
    })

    it('setPool revert2', async () => {
      let newWooPP = await deployMockContract(owner, IWooPP.abi)
      await newWooPP.mock.quoteToken.returns(ZERO_ADDR)
      await expect(wooRouter.setPool(newWooPP.address)).to.be.revertedWith('WooRouter: quoteToken_ADDR_ZERO')
    })

    it('Emit WooPoolChanged when setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      await wooRouter.setPool(anotherWooPP.address)
      await expect(wooRouter.setPool(anotherWooPP.address))
        .to.emit(wooRouter, 'WooPoolChanged')
        .withArgs(anotherWooPP.address)
    })

    it('Prevents non-owners from setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      expect(wooRouter.connect(user).setPool(anotherWooPP.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('setWhitelisted', async () => {
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
      await wooRouter.setWhitelisted(user.address, true)
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(true)
      await wooRouter.setWhitelisted(user.address, false)
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
    })

    it('Prevents zero addr from setWhitelisted', async () => {
      expect(await wooRouter.isWhitelisted(ZERO_ADDR)).to.eq(false)
      expect(wooRouter.setWhitelisted(ZERO_ADDR, true)).to.be.revertedWith('WooRouter: target_ADDR_ZERO')
      expect(wooRouter.setWhitelisted(ZERO_ADDR, false)).to.be.revertedWith('WooRouter: target_ADDR_ZERO')
    })

    it('Prevents non-owners from setWhitelisted', async () => {
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
      expect(wooRouter.connect(user).setWhitelisted(user.address, true)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
      expect(wooRouter.connect(user).setWhitelisted(user.address, false)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('rescueFunds', async () => {
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(owner.address)).to.eq(ZERO)

      let mintBalance = 10000
      await baseToken.mint(wooRouter.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(mintBalance)

      await wooRouter.connect(owner).rescueFunds(baseToken.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(owner.address)).to.eq(mintBalance)
    })

    it('Prevents zero addr as token addr from rescueFunds', async () => {
      expect(wooRouter.rescueFunds(ZERO_ADDR, ZERO)).to.be.revertedWith('WooRouter: token_ADDR_ZERO')
    })

    it('Prevents non-owners from rescueFunds', async () => {
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)

      let mintBalance = 10000
      await baseToken.mint(wooRouter.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(mintBalance)

      expect(wooRouter.connect(user).rescueFunds(baseToken.address, mintBalance)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
      expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)
    })

    it('Receive accuracy1', async () => {
      await expect(
        user.sendTransaction({
          to: wooRouter.address,
          gasPrice: 10,
          value: 100000,
        })
      ).to.be.reverted
    })

    it('Receive accuracy2', async () => {
      await expect(
        user.sendTransaction({
          to: wooRouter.address,
          gasPrice: 10,
          value: 100000,
        })
      ).to.be.reverted
    })

    it('Prevents user directly send ETH', async () => {
      await expect(
        user.sendTransaction({
          to: wooRouter.address,
          gasPrice: 10,
          value: 100000,
        })
      ).to.be.reverted
    })

    it('Receive accuracy', async () => {
      await expect(
        user.sendTransaction({
          to: wooRouter.address,
          gasPrice: 10,
          value: 100000,
        })
      ).to.be.reverted

      await wooRouter.setWhitelisted(user.address, true)
      await user.sendTransaction({
        to: wooRouter.address,
        gasPrice: 10,
        value: 100000,
      })

      await wooRouter.setWhitelisted(user.address, false)
      await expect(
        user.sendTransaction({
          to: wooRouter.address,
          gasPrice: 10,
          value: 100000,
        })
      ).to.be.reverted
    })
  })

  describe('core func', () => {
    let wooracle: Contract
    let wooPP: Contract
    let wooRouter: Contract
    let baseToken: Contract
    let quoteToken: Contract

    before('Deploy ERC20', async () => {
      baseToken = await deployContract(owner, TestToken, [])
      quoteToken = await deployContract(owner, TestToken, [])
    })

    beforeEach('Deploy WooRouter', async () => {
      wooracle = await deployContract(owner, Wooracle, [])
      wooPP = await deployContract(owner, WooPP, [quoteToken.address, wooracle.address, ZERO_ADDR])
      wooRouter = await deployContract(owner, WooRouter, [WBNB_ADDR, wooPP.address])
    })

    it('sellBase', async () => {
      // TODO waiting for WooPP.test.ts swap code
      //   expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)
      //   let mintBaseAmount = 10000
      //   await baseToken.mint(wooPP.address, mintBaseAmount)
      //   let minQuoteAmount = 0
      //   await wooRouter.sellBase(baseToken.address, mintBaseAmount, minQuoteAmount, user.address, user.address)
    })
  })

  describe('WooPP Paused', () => {
    let wooracle: Contract
    let wooPP: Contract
    let wooRouter: Contract
    let baseToken: Contract
    let quoteToken: Contract

    before('Deploy ERC20', async () => {
      baseToken = await deployContract(owner, TestToken, [])
      quoteToken = await deployContract(owner, TestToken, [])
    })

    beforeEach('Deploy WooRouter', async () => {
      wooracle = await deployContract(owner, Wooracle, [])
      wooPP = await deployContract(owner, WooPP, [quoteToken.address, wooracle.address, ZERO_ADDR])
      wooRouter = await deployContract(owner, WooRouter, [WBNB_ADDR, wooPP.address])

      await baseToken.mint(wooPP.address, ONE.mul(3))
      await quoteToken.mint(wooPP.address, ONE.mul(50000).mul(3))

      await baseToken.mint(user.address, ONE)
      await quoteToken.mint(user.address, ONE.mul(55000))
    })

    it('Woopp paused revert1', async () => {
      await wooPP.pause()
      expect(await wooPP.paused()).to.eq(true)

      await baseToken.connect(user).approve(wooRouter.address, ONE.mul(3))
      await quoteToken.connect(user).approve(wooRouter.address, ONE.mul(60000))

      await expect(
        wooRouter
          .connect(user)
          .swap(quoteToken.address, baseToken.address, ONE.mul(50500), ONE, user.address, ZERO_ADDR)
      ).to.be.revertedWith('Pausable: paused')

      await expect(
        wooRouter.connect(user).sellBase(baseToken.address, ONE, ONE.mul(50000 - 500), user.address, ZERO_ADDR)
      ).to.be.revertedWith('Pausable: paused')

      await expect(
        wooRouter.connect(user).sellQuote(baseToken.address, ONE.mul(50000 + 500), ONE, user.address, ZERO_ADDR)
      ).to.be.revertedWith('Pausable: paused')
    })
  })
})
