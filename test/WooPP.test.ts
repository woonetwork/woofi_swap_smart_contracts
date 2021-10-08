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
import { deployContract, MockProvider, solidity } from 'ethereum-waffle'
import WooPP from '../build/WooPP.json'
import InitializableOwnable from '../build/InitializableOwnable.json'
import IWooPP from '../build/IWooPP.json'

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

describe('WooPP', () => {
  const [owner, user, quoteToken, priceOracle, quoteChainLinkRefOracle] = new MockProvider().getWallets()

  describe('#ctor and init', () => {
    let wooPP: Contract

    before('deploy WooPP', async () => {
      wooPP = await deployContract(owner, WooPP, [quoteToken.address, priceOracle.address, ZERO_ADDR])
    })

    it('ctor', async () => {
      expect(await wooPP._OWNER_()).to.eq(owner.address)
    })

    it('init', async () => {
      expect(await wooPP.quoteToken()).to.eq(quoteToken.address)
      expect(await wooPP.priceOracle()).to.eq(priceOracle.address)
    })

    it('tokenInfo', async () => {
      const quoteInfo = await wooPP.tokenInfo(quoteToken.address)
      expect(quoteInfo.isValid).to.eq(true)
      expect(quoteInfo.chainlinkRefOracle).to.eq(ZERO_ADDR)
      expect(quoteInfo.reserve).to.eq(0)
      expect(quoteInfo.threshold).to.eq(0)
      expect(quoteInfo.lastResetTimestamp).to.eq(0)
      expect(quoteInfo.lpFeeRate).to.eq(0)
      expect(quoteInfo.R).to.eq(0)
      expect(quoteInfo.target).to.eq(0)
      expect(quoteInfo.refPriceFixCoeff).to.eq(0)
    })
  })

  // TODO: add more test cases.
})
