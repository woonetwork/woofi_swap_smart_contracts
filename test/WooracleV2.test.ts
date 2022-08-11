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
import { ethers } from 'hardhat'
import { deployContract, MockProvider, solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooracleV2 } from '../typechain'
import WooracleArtifact from '../artifacts/contracts/WooracleV2.sol/WooracleV2.json'

async function getCurrentBlockTimestamp() {
  let blockNum = await ethers.provider.getBlockNumber()
  let block = await ethers.provider.getBlock(blockNum)
  return block.timestamp
}

async function checkWooracleTimestamp(wooracle: WooracleV2) {
  let currentBlockTimestamp = await getCurrentBlockTimestamp()
  expect(await wooracle.timestamp()).to.gte(currentBlockTimestamp)
}

describe('Wooracle', () => {
  let owner: SignerWithAddress
  let baseToken: SignerWithAddress
  let anotherBaseToken: SignerWithAddress
  let quoteToken: SignerWithAddress

  let wooracle: WooracleV2

  beforeEach(async () => {
    ;[owner, baseToken, anotherBaseToken, quoteToken] = await ethers.getSigners()
    wooracle = (await deployContract(owner, WooracleArtifact, [])) as WooracleV2
  })

  it('Init with correct owner', async () => {
    expect(await wooracle._OWNER_()).to.eq(owner.address)
  })
})