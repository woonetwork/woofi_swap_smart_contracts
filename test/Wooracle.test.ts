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
import { deployContract, MockProvider, solidity } from 'ethereum-waffle'
// import Wooracle from '../build/Wooracle.json'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Wooracle } from '../typechain'
import WooracleArtifact from '../artifacts/contracts/Wooracle.sol/Wooracle.json'

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const BN_1e18 = BigNumber.from(10).pow(18)
const BN_2e18 = BN_1e18.mul(2)
const BN_1e8 = BigNumber.from(10).pow(8)
const BN_2e8 = BN_1e8.mul(2)
const ZERO = 0

async function getCurrentBlockTimestamp() {
  let blockNum = await ethers.provider.getBlockNumber()
  let block = await ethers.provider.getBlock(blockNum)
  return block.timestamp
}

async function checkWooracleTimestamp(wooracle: Wooracle) {
  let currentBlockTimestamp = await getCurrentBlockTimestamp()
  expect(await wooracle.timestamp()).to.gte(currentBlockTimestamp)
}

describe('Wooracle', () => {
  let owner: SignerWithAddress
  let baseToken: SignerWithAddress
  let anotherBaseToken: SignerWithAddress
  let quoteToken: SignerWithAddress

  let wooracle: Wooracle

  beforeEach(async () => {
    ;[owner, baseToken, anotherBaseToken, quoteToken] = await ethers.getSigners()
    wooracle = (await deployContract(owner, WooracleArtifact, [])) as Wooracle
  })

  it('Init with correct owner', async () => {
    expect(await wooracle._OWNER_()).to.eq(owner.address)
  })

  it('Init state variables', async () => {
    let initStableDuration = 300
    expect(await wooracle.staleDuration()).to.eq(initStableDuration)
    expect(await wooracle.timestamp()).to.eq(ZERO)
    expect(await wooracle.quoteToken()).to.eq(ZERO_ADDR)
  })

  it('setquoteToken', async () => {
    await wooracle.setQuoteToken(quoteToken.address)
    expect(await wooracle.quoteToken()).to.eq(quoteToken.address)
  })

  it('setStaleDuration', async () => {
    let newStableDuration = 500
    await wooracle.setStaleDuration(newStableDuration)
    expect(await wooracle.staleDuration()).to.eq(newStableDuration)
  })

  it('postPrice', async () => {
    let info = await wooracle.infos(baseToken.address)
    expect(info.price).to.eq(ZERO)

    await wooracle.postPrice(baseToken.address, BN_1e8)
    await checkWooracleTimestamp(wooracle)
    info = await wooracle.infos(baseToken.address)
    expect(info.price).to.eq(BN_1e8)

    await wooracle.postPrice(baseToken.address, ZERO)
    await checkWooracleTimestamp(wooracle)
    info = await wooracle.infos(baseToken.address)
    expect(info.price).to.eq(ZERO)
  })

  it('postPriceList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
    }

    await wooracle.postPriceList(bases, newPrices)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(newPrices[i])
    }

    await wooracle.postPriceList(bases, [ZERO, ZERO])
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
    }
  })

  it('postPriceList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e8, BN_2e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
    }

    await expect(wooracle.postPriceList(bases, newPrices)).to.be.revertedWith('Wooracle: length_INVALID')
  })

  it('postSpread', async () => {
    let info = await wooracle.infos(baseToken.address)
    expect(info.spread).to.eq(ZERO)
    await wooracle.postSpread(baseToken.address, BN_1e8)
    await checkWooracleTimestamp(wooracle)
    info = await wooracle.infos(baseToken.address)
    expect(info.spread).to.eq(BN_1e8)
  })

  it('postSpreadList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newSpreads = [BN_1e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(baseToken.address)
      expect(info.spread).to.eq(ZERO)
    }

    await wooracle.postSpreadList(bases, newSpreads)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.spread).to.eq(newSpreads[i])
    }
  })

  it('postSpreadList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newSpreads = [BN_1e8, BN_2e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(baseToken.address)
      expect(info.spread).to.eq(ZERO)
    }

    await expect(wooracle.postSpreadList(bases, newSpreads)).to.be.revertedWith('Wooracle: length_INVALID')
  })

  it('postState', async () => {
    const info = await wooracle.infos(baseToken.address)
    expect(info.price).to.eq(ZERO)
    expect(info.spread).to.eq(ZERO)
    expect(info.coeff).to.eq(ZERO)

    await wooracle.postState(baseToken.address, BN_2e8, BN_1e18, BN_1e18)
    await checkWooracleTimestamp(wooracle)

    const info2 = await wooracle.infos(baseToken.address)
    expect(info2.price).to.eq(BN_2e8)
    expect(info2.spread).to.eq(BN_1e18)
    expect(info2.coeff).to.eq(BN_1e18)

    let [priceNow, spreadNow, coeffNow, isfeasible] = await wooracle.state(baseToken.address)
    expect(isfeasible).to.eq(true)
    expect(priceNow).to.eq(BN_2e8)
    expect(spreadNow).to.eq(BN_1e18)
    expect(coeffNow).to.eq(BN_1e18)

    await wooracle.postState(baseToken.address, ZERO, BN_1e8, BN_1e8)
    await checkWooracleTimestamp(wooracle)
    expect(await wooracle.isFeasible(baseToken.address)).to.eq(false)
  })

  it('postStateList', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e8, BN_2e8]
    let newSpreads = [BN_1e8, BN_2e8]
    let newCoeffs = [BN_1e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
      expect(info.spread).to.eq(ZERO)
      expect(info.coeff).to.eq(ZERO)
    }

    await wooracle.postStateList(bases, newPrices, newSpreads, newCoeffs)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(newPrices[i])
      expect(info.spread).to.eq(newSpreads[i])
      expect(info.coeff).to.eq(newCoeffs[i])
    }

    await wooracle.postStateList(bases, [ZERO, ZERO], newSpreads, newCoeffs)
    await checkWooracleTimestamp(wooracle)
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
    }
  })

  it('postStateList reverted with length invalid', async () => {
    let bases = [baseToken.address, anotherBaseToken.address]
    let newPrices = [BN_1e8, BN_2e8, BN_2e8]
    let newSpreads = [BN_1e8, BN_2e8]
    let newCoeffs = [BN_1e8, BN_2e8]
    for (let i = 0; i < bases.length; i += 1) {
      let info = await wooracle.infos(bases[i])
      expect(info.price).to.eq(ZERO)
      expect(info.spread).to.eq(ZERO)
      expect(info.coeff).to.eq(ZERO)
    }

    await expect(wooracle.postStateList(bases, newPrices, newSpreads, newCoeffs)).to.be.revertedWith(
      'Wooracle: length_INVALID'
    )
  })

  it('price function', async () => {
    await wooracle.postPrice(baseToken.address, BN_2e18)
    let [priceNow, isfeasible] = await wooracle.price(baseToken.address)
    expect(isfeasible).to.eq(true)
    expect(priceNow).to.eq(BN_2e18)
  })

  it('state function', async () => {
    await wooracle.postState(baseToken.address, BN_1e8, BN_1e18, BN_1e18)
    let [priceNow, spreadNow, coeffNow, isfeasible] = await wooracle.state(baseToken.address)
    expect(isfeasible).to.eq(true)
    expect(priceNow).to.eq(BN_1e8)
    expect(spreadNow).to.eq(BN_1e18)
    expect(coeffNow).to.eq(BN_1e18)
  })
})
