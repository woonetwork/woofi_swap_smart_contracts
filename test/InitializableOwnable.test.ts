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
import InitializableOwnable from '../build/InitializableOwnable.json'

use(solidity)

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

describe('InitializableOwnable', () => {
  const [owner, anotherOwner, user, quoteToken] = new MockProvider().getWallets()
  let initOwnable: Contract

  beforeEach(async () => {
    initOwnable = await deployContract(owner, InitializableOwnable, [])
  })

  it('_OWNER_ should be zero address when deployed', async () => {
    expect(await initOwnable._OWNER_()).to.eq(ZERO_ADDR)
  })

  it('_NEW_OWNER_ should be zero address when deployed', async () => {
    expect(await initOwnable._NEW_OWNER_()).to.eq(ZERO_ADDR)
  })

  it('initOwner', async () => {
    await initOwnable.initOwner(owner.address)
    expect(await initOwnable._OWNER_()).to.eq(owner.address)
  })

  it('transferOwnership', async () => {
    await initOwnable.initOwner(owner.address)
    await initOwnable.transferOwnership(anotherOwner.address)
    expect(await initOwnable._NEW_OWNER_()).to.eq(anotherOwner.address)
  })

  it('Prevents non-owners from transferring', async () => {
    await expect(initOwnable.transferOwnership(owner.address)).to.be.revertedWith('NOT_OWNER')
  })

  it('claimOwnership', async () => {
    await initOwnable.initOwner(owner.address)
    await initOwnable.transferOwnership(anotherOwner.address)
    expect(await initOwnable._NEW_OWNER_()).to.eq(anotherOwner.address)
    await initOwnable.connect(anotherOwner).claimOwnership()
    expect(await initOwnable._OWNER_()).to.eq(anotherOwner.address)
    expect(await initOwnable._NEW_OWNER_()).to.eq(ZERO_ADDR)
  })

  it('Prevents invalid claiming', async () => {
    await initOwnable.initOwner(owner.address)
    await initOwnable.transferOwnership(anotherOwner.address)
    expect(await initOwnable._NEW_OWNER_()).to.eq(anotherOwner.address)
    await expect(initOwnable.connect(owner).claimOwnership()).to.be.revertedWith('INVALID_CLAIM')
  })
})
