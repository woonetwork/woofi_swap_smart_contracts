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
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, MockProvider, solidity } from 'ethereum-waffle'
import Wooracle from '../build/Wooracle.json'

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const BN_1e18 = BigNumber.from(10).pow(18)
const BN_2e18 = BN_1e18.mul(2)
const ZERO = 0

async function getCurrentBlockTimestamp() {
  let blockNum = await ethers.provider.getBlockNumber()
  let block = await ethers.provider.getBlock(blockNum)
  return block.timestamp
}

async function checkWooracleTimestamp(wooracle: Contract) {
  let currentBlockTimestamp = await getCurrentBlockTimestamp()
  expect(await wooracle.timestamp()).to.gte(currentBlockTimestamp)
}

describe('Wooracle', () => {
  let mockProvider = new MockProvider()
  const [owner, user, baseToken, anotherBaseToken, quoteToken] = mockProvider.getWallets()
  let wooracle: Contract

  beforeEach(async () => {
    wooracle = await deployContract(owner, Wooracle, [])
  })

  it('Init with correct owner', async () => {
    expect(await wooracle._OWNER_()).to.eq(owner.address)
  })

  it('Init state variables', async () => {
    let initStableDuration = 300
    expect(await wooracle.staleDuration()).to.eq(initStableDuration)
    expect(await wooracle.timestamp()).to.eq(ZERO)
    expect(await wooracle.quoteAddr()).to.eq(ZERO_ADDR)
  })

  it('setQuoteAddr', async () => {
    await wooracle.setQuoteAddr(quoteToken.address)
    expect(await wooracle.quoteAddr()).to.eq(quoteToken.address)
  })

  it('setStaleDuration', async () => {
    let newStableDuration = 500
    await wooracle.setStaleDuration(newStableDuration)
    expect(await wooracle.staleDuration()).to.eq(newStableDuration)
  })

  it('postPrice', async () => {
    expect(await wooracle.isValid(baseToken.address)).to.eq(false)
    expect(await wooracle.price(baseToken.address)).to.eq(ZERO)

    await wooracle.postPrice(baseToken.address, BN_1e18)
    await checkWooracleTimestamp(wooracle)
    expect(await wooracle.isValid(baseToken.address)).to.eq(true)
    expect(await wooracle.price(baseToken.address)).to.eq(BN_1e18)
  })

  it('postPriceList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.isValid(bases[i])).to.eq(false)
      expect(await wooracle.price(bases[i])).to.eq(ZERO)
    }

    await wooracle.postPriceList(bases, newPrices)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.isValid(bases[i])).to.eq(true)
      expect(await wooracle.price(bases[i])).to.eq(newPrices[i])
    }
  })

  it('postPriceList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e18, BN_2e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.isValid(bases[i])).to.eq(false)
      expect(await wooracle.price(bases[i])).to.eq(ZERO)
    }

    await expect(wooracle.postPriceList(bases, newPrices)).to.be.revertedWith('Wooracle: length_INVALID')
  })

  it('postSpread', async () => {
    expect(await wooracle.spread(baseToken.address)).to.eq(ZERO)
    await wooracle.postSpread(baseToken.address, BN_1e18)
    await checkWooracleTimestamp(wooracle)
    expect(await wooracle.spread(baseToken.address)).to.eq(BN_1e18)
  })

  it('postSpreadList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newSpreads = [BN_1e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.spread(bases[i])).to.eq(ZERO)
    }

    await wooracle.postSpreadList(bases, newSpreads)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.spread(bases[i])).to.eq(newSpreads[i])
    }
  })

  it('postSpreadList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newSpreads = [BN_1e18, BN_2e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.spread(bases[i])).to.eq(ZERO)
    }

    await expect(wooracle.postSpreadList(bases, newSpreads)).to.be.revertedWith('Wooracle: length_INVALID')
  })

  it('postState', async () => {
    expect(await wooracle.price(baseToken.address)).to.eq(ZERO)
    expect(await wooracle.spread(baseToken.address)).to.eq(ZERO)
    expect(await wooracle.coeff(baseToken.address)).to.eq(ZERO)
    expect(await wooracle.isValid(baseToken.address)).to.eq(false)

    await wooracle.postState(baseToken.address, BN_1e18, BN_1e18, BN_1e18)
    await checkWooracleTimestamp(wooracle)
    expect(await wooracle.price(baseToken.address)).to.eq(BN_1e18)
    expect(await wooracle.spread(baseToken.address)).to.eq(BN_1e18)
    expect(await wooracle.coeff(baseToken.address)).to.eq(BN_1e18)
    expect(await wooracle.isValid(baseToken.address)).to.eq(true)
  })

  it('postStateList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e18, BN_2e18]
    let newSpreads = [BN_1e18, BN_2e18]
    let newCoeffs = [BN_1e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.price(bases[i])).to.eq(ZERO)
      expect(await wooracle.spread(bases[i])).to.eq(ZERO)
      expect(await wooracle.coeff(bases[i])).to.eq(ZERO)
      expect(await wooracle.isValid(bases[i])).to.eq(false)
    }

    await wooracle.postStateList(bases, newPrices, newSpreads, newCoeffs)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.price(bases[i])).to.eq(newPrices[i])
      expect(await wooracle.spread(bases[i])).to.eq(newSpreads[i])
      expect(await wooracle.coeff(bases[i])).to.eq(newCoeffs[i])
      expect(await wooracle.isValid(bases[i])).to.eq(true)
    }
  })

  it('postStateList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e18, BN_2e18, BN_2e18]
    let newSpreads = [BN_1e18, BN_2e18]
    let newCoeffs = [BN_1e18, BN_2e18]
    for (let i = 0; i < bases.length; i += 1) {
      expect(await wooracle.price(bases[i])).to.eq(ZERO)
      expect(await wooracle.spread(bases[i])).to.eq(ZERO)
      expect(await wooracle.coeff(bases[i])).to.eq(ZERO)
      expect(await wooracle.isValid(bases[i])).to.eq(false)
    }

    await expect(wooracle.postStateList(bases, newPrices, newSpreads, newCoeffs)).to.be.revertedWith('Wooracle: length_INVALID')
  })

  it('getPrice', async () => {
    await wooracle.postPrice(baseToken.address, BN_1e18)
    let [priceNow, _] = await wooracle.getPrice(baseToken.address)
    expect(priceNow).to.eq(BN_1e18)
  })

  it('getState', async () => {
    await wooracle.postState(baseToken.address, BN_1e18, BN_1e18, BN_1e18)
    let [priceNow, spreadNow, coeffNow, _] = await wooracle.getState(baseToken.address)
    expect(priceNow).to.eq(BN_1e18)
    expect(spreadNow).to.eq(BN_1e18)
    expect(coeffNow).to.eq(BN_1e18)
  })
})
