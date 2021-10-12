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
import { Contract } from 'ethers'
import {deployContract, deployMockContract, MockProvider, solidity} from 'ethereum-waffle'
import Wooracle from '../build/Wooracle.json'
import WooPP from '../build/WooPP.json'
import WooRouter from '../build/WooRouter.json'
import IERC20 from "../build/IERC20.json"
import TestToken from "../build/TestToken.json";

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const ZERO = 0

describe('WooRouter', () => {
  const [owner, user] = new MockProvider().getWallets()

  describe('ctor, init & basic func', () => {
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
      wooRouter = await deployContract(owner, WooRouter, [wooPP.address])
    })

    it('Init with correct owner', async () => {
      expect(await wooRouter.owner()).to.eq(owner.address)
    })

    it('Init state variables', async () => {
      expect(await wooRouter.quoteToken()).to.eq(quoteToken.address)
      expect(await wooRouter.wooPool()).to.eq(wooPP.address)
    })

    it('setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      await wooRouter.setPool(anotherWooPP.address)
      expect(await wooRouter.quoteToken()).to.eq(anotherQuoteToken.address)
      expect(await wooRouter.wooPool()).to.eq(anotherWooPP.address)
    })

    it('Emit WooPoolChanged when setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      await wooRouter.setPool(anotherWooPP.address)
      await expect(wooRouter.setPool(anotherWooPP.address)).to.emit(wooRouter, 'WooPoolChanged').withArgs(anotherWooPP.address)
    })

    it('Prevents non-owners from setPool', async () => {
      let anotherQuoteToken = await deployMockContract(owner, IERC20.abi)
      let anotherWooPP = await deployContract(owner, WooPP, [anotherQuoteToken.address, wooracle.address, ZERO_ADDR])
      expect(wooRouter.connect(user).setPool(anotherWooPP.address)).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('setWhitelisted', async() => {
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
      await wooRouter.setWhitelisted(user.address, true)
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(true)
      await wooRouter.setWhitelisted(user.address, false)
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
    })

    it('Prevents zero addr from setWhitelisted', async() => {
      expect(await wooRouter.isWhitelisted(ZERO_ADDR)).to.eq(false)
      expect(wooRouter.setWhitelisted(ZERO_ADDR, true)).to.be.revertedWith('WooRouter: target_ADDR_ZERO')
      expect(wooRouter.setWhitelisted(ZERO_ADDR, false)).to.be.revertedWith('WooRouter: target_ADDR_ZERO')
    })

    it('Prevents non-owners from setWhitelisted', async() => {
      expect(await wooRouter.isWhitelisted(user.address)).to.eq(false)
      expect(wooRouter.connect(user).setWhitelisted(user.address, true)).to.be.revertedWith('Ownable: caller is not the owner')
      expect(wooRouter.connect(user).setWhitelisted(user.address, false)).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('rescueFunds', async() => {
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(owner.address)).to.eq(ZERO)

      let mintBalance = 10000
      await baseToken.mint(wooRouter.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(mintBalance)

      await wooRouter.connect(owner).rescueFunds(baseToken.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(owner.address)).to.eq(mintBalance)
    })

    it('Prevents zero addr as token addr from rescueFunds', async() => {
      expect(wooRouter.rescueFunds(ZERO_ADDR, ZERO)).to.be.revertedWith('WooRouter: token_ADDR_ZERO')
    })

    it('Prevents non-owners from rescueFunds', async() => {
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(ZERO)
      expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)

      let mintBalance = 10000
      await baseToken.mint(wooRouter.address, mintBalance)
      expect(await baseToken.balanceOf(wooRouter.address)).to.eq(mintBalance)

      expect(wooRouter.connect(user).rescueFunds(baseToken.address, mintBalance)).to.be.revertedWith('Ownable: caller is not the owner')
      expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)
    })

    it('destroy', async() => {
      await wooRouter.destroy()
      expect(wooRouter.quoteToken()).to.be.revertedWith('')
    })

    it('Prevents non-owners from destroy', async() => {
      expect(wooRouter.connect(user).destroy()).to.be.revertedWith('Ownable: caller is not the owner')
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
      wooRouter = await deployContract(owner, WooRouter, [wooPP.address])
    })

    it('sellBase', async () => {
      // TODO waiting for WooPP.test.ts swap code
      expect(await baseToken.balanceOf(user.address)).to.eq(ZERO)
      let mintBaseAmount = 10000
      await baseToken.mint(wooPP.address, mintBaseAmount)

      let minQuoteAmount = 0
      await wooRouter.sellBase(
        baseToken.address,
        mintBaseAmount,
        minQuoteAmount,
        user.address,
        user.address
      )
    })
  })
})
