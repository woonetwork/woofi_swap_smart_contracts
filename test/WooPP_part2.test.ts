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
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

import WooPP from '../build/WooPP.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'

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

describe('WooPP Test Suite 2', () => {
  const [owner, user1, user2, priceOracle, quoteChainLinkRefOracle] = new MockProvider().getWallets()

  describe('', () => {
    let wooPP: Contract
    let quoteToken: Contract
    let baseToken1: Contract
    let baseToken2: Contract

    before('deploy ERC20', async () => {
      quoteToken = await deployContract(owner, TestToken, [])
      baseToken1 = await deployContract(owner, TestToken, [])
      baseToken2 = await deployContract(owner, TestToken, [])
    })

    beforeEach('deploy WooPP & Tokens', async () => {
      wooPP = await deployContract(owner, WooPP, [quoteToken.address, priceOracle.address, ZERO_ADDR])

      // await quoteToken.mint(wooPP.address, 10000);
      // await baseToken1.mint(wooPP.address, 10000);
      // await baseToken1.mint(owner.address, 1000);
      // await baseToken1.mint(user1.address, 100);
      // await baseToken1.mint(user2.address, 200);
    })

    it('sellBase accuracy1', async () => {
      // expect(await baseToken1.balanceOf(user1.address)).to.eq(0)
      // expect(await baseToken1.balanceOf(wooPP.address)).to.eq(10000)
      // await wooPP.withdraw(baseToken1.address, user1.address, 2000)
      // // await expect(() => wooPP.withdraw(baseToken1.address, user1.address, 2000))
      // //     .to.changeTokenBalances(baseToken1, [wooPP, user1], [-2000, 2000]);
      // expect(await baseToken1.balanceOf(user1.address)).to.eq(2000)
      // expect(await baseToken1.balanceOf(wooPP.address)).to.eq(8000)
    })

    // it('sellBase revert1', async () => {
    //   await expect(wooPP.withdraw(ZERO_ADDR, user1.address, 100)).to.be.revertedWith('WooPP: token_ZERO_ADDR')
    // })

    // it('sellBase revert2', async () => {
    //   await expect(wooPP.withdraw(baseToken1.address, ZERO_ADDR, 100)).to.be.revertedWith('WooPP: to_ZERO_ADDR')
    // })

    // it('sellBase event1', async () => {
    //   await expect(wooPP.withdraw(baseToken1.address, user1.address, 111))
    //     .to.emit(wooPP, 'Withdraw')
    //     .withArgs(baseToken1.address, user1.address, 111)
    // })
  })

  // TODO: (@qinchao)
  // 1. only owner and strategist, access control unit tests
  // 2. sell, buy quote and base tokens
  // 3. query amount of quote and base tokens
})
