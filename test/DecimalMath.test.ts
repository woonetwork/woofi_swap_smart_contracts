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
import DecimalMath from '../build/DecimalMathTest.json'
import { ethers } from 'hardhat'
// import { Decimal } from 'decimal.js'

use(solidity)

const {
    BigNumber,
    constants: { MaxUint256 },
} = ethers

const POW_8 = BigNumber.from(10).pow(8)
const POW_9 = BigNumber.from(10).pow(9)
const ONE = BigNumber.from(10).pow(18)
const ONE2 = BigNumber.from(10).pow(36)
const ONE3 = BigNumber.from(10).pow(52)

describe('DecimalMath', () => {
    const [owner, user, quoteToken] = new MockProvider().getWallets()

    describe('#test functional methods', () => {
        let decimalMath: Contract

        before('deploy DecimalMath', async () => {
            decimalMath = await deployContract(owner, DecimalMath, []);
        })

        it('mulFloor accuracy', async () => {
            expect(await decimalMath.mulFloor(ONE.mul(10), ONE.mul(2))).to.eq(ONE.mul(20))
            expect(await decimalMath.mulFloor(ONE.mul(77), ONE.mul(1))).to.eq(ONE.mul(77))
            expect(await decimalMath.mulFloor(ONE.mul(0), ONE.mul(12))).to.eq(ONE.mul(0))
        })

        it('mulFloor corner cases', async () => {
            expect(await decimalMath.mulFloor(0, ONE.mul(2))).to.eq(0)
            expect(await decimalMath.mulFloor(1, ONE.mul(1))).to.eq(1)
            expect(await decimalMath.mulFloor(2, ONE.mul(12))).to.eq(24)
        })

        it('mulFloor floor cases', async () => {
            expect(await decimalMath.mulFloor(POW_8.mul(3), POW_9.mul(3))).to.eq(0)
            expect(await decimalMath.mulFloor(POW_8.mul(4), POW_9.mul(3))).to.eq(1)
            expect(await decimalMath.mulFloor(POW_8.mul(3), POW_9.mul(5))).to.eq(1)
            expect(await decimalMath.mulFloor(POW_8.mul(3), POW_9.mul(6))).to.eq(1)
            expect(await decimalMath.mulFloor(POW_8.mul(4), POW_9.mul(5))).to.eq(2)
            expect(await decimalMath.mulFloor(POW_8.mul(4), POW_9.mul(6))).to.eq(2)
        })

        it('mulFloor floor cases', async () => {
            expect(await decimalMath.mulFloor(POW_8.mul(11), POW_9.mul(3))).to.eq(3)
            expect(await decimalMath.mulFloor(POW_8.mul(22), POW_9.mul(3))).to.eq(6)
            expect(await decimalMath.mulFloor(POW_8.mul(11), POW_9.mul(11))).to.eq(12)
            expect(await decimalMath.mulFloor(POW_8.mul(23), POW_9.mul(57))).to.eq(131)
        })

        it('mulFloor overflow cases', async () => {
            await expect(decimalMath.mulFloor(ONE3, ONE2)).to.be.reverted
        })

        ////////////////////////////////////////////////////////////

        it('mulCeil accuracy', async () => {
            expect(await decimalMath.mulCeil(ONE.mul(10), ONE.mul(2))).to.eq(ONE.mul(20))
            expect(await decimalMath.mulCeil(ONE.mul(77), ONE.mul(1))).to.eq(ONE.mul(77))
            expect(await decimalMath.mulCeil(ONE.mul(0), ONE.mul(12))).to.eq(ONE.mul(0))
        })

        it('mulCeil corner cases', async () => {
            expect(await decimalMath.mulCeil(0, ONE.mul(2))).to.eq(0)
            expect(await decimalMath.mulCeil(1, ONE.mul(1))).to.eq(1)
            expect(await decimalMath.mulCeil(2, ONE.mul(12))).to.eq(24)
        })

        it('mulCeil floor cases', async () => {
            expect(await decimalMath.mulCeil(POW_8.mul(0), POW_9.mul(1))).to.eq(0)
            expect(await decimalMath.mulCeil(POW_8.mul(2), POW_9.mul(1))).to.eq(1)
            expect(await decimalMath.mulCeil(POW_8.mul(5), POW_9.mul(1))).to.eq(1)
            expect(await decimalMath.mulCeil(POW_8.mul(3), POW_9.mul(2))).to.eq(1)
            expect(await decimalMath.mulCeil(POW_8.mul(4), POW_9.mul(3))).to.eq(2)
            expect(await decimalMath.mulCeil(POW_8.mul(3), POW_9.mul(5))).to.eq(2)
            expect(await decimalMath.mulCeil(POW_8.mul(3), POW_9.mul(6))).to.eq(2)
            expect(await decimalMath.mulCeil(POW_8.mul(4), POW_9.mul(5))).to.eq(2)
            expect(await decimalMath.mulCeil(POW_8.mul(4), POW_9.mul(6))).to.eq(3)
            expect(await decimalMath.mulCeil(POW_8.mul(2), POW_9.mul(13))).to.eq(3)
            expect(await decimalMath.mulCeil(POW_8.mul(3), POW_9.mul(12))).to.eq(4)
        })

        it('mulCeil floor cases', async () => {
            expect(await decimalMath.mulCeil(POW_8.mul(11), POW_9.mul(3))).to.eq(4)
            expect(await decimalMath.mulCeil(POW_8.mul(22), POW_9.mul(3))).to.eq(7)
            expect(await decimalMath.mulCeil(POW_8.mul(11), POW_9.mul(11))).to.eq(13)
            expect(await decimalMath.mulCeil(POW_8.mul(23), POW_9.mul(57))).to.eq(132)
            expect(await decimalMath.mulCeil(POW_8.mul(55), POW_9.mul(57))).to.eq(314)
        })

        it('mulCeil overflow cases', async () => {
            await expect(decimalMath.mulCeil(ONE3, ONE2)).to.be.reverted
        })

        ////////////////////////////////////////////////////////////

        it('divFloor accuracy', async () => {
            expect(await decimalMath.divFloor(ONE.mul(2), ONE.mul(2))).to.eq(ONE.mul(1))
            expect(await decimalMath.divFloor(ONE.mul(3), ONE.mul(2))).to.eq(ONE.mul(15).div(10))
            expect(await decimalMath.divFloor(ONE.mul(10), ONE.mul(2))).to.eq(ONE.mul(5))
            expect(await decimalMath.divFloor(ONE.mul(9), ONE.mul(2))).to.eq(ONE.mul(45).div(10))
            expect(await decimalMath.divFloor(ONE.mul(77), ONE.mul(11))).to.eq(ONE.mul(7))
        })

        it('divFloor corner cases', async () => {
            expect(await decimalMath.divFloor(ONE.mul(0), ONE.mul(12))).to.eq(ONE.mul(0))
            expect(await decimalMath.divFloor(0, ONE.mul(2))).to.eq(0)
            expect(await decimalMath.divFloor(1, ONE.mul(1))).to.eq(1)
            expect(await decimalMath.divFloor(2, ONE.mul(12))).to.eq(0)
        })

        it('divFloor floor cases', async () => {
            expect(await decimalMath.divFloor(1, ONE.mul(2))).to.eq(0)
            expect(await decimalMath.divFloor(10, ONE.mul(3))).to.eq(3)
            expect(await decimalMath.divFloor(12, ONE.mul(3))).to.eq(4)
            expect(await decimalMath.divFloor(20, ONE.mul(3))).to.eq(6)
            expect(await decimalMath.divFloor(20, ONE.mul(5))).to.eq(4)
            expect(await decimalMath.divFloor(20, ONE.mul(6))).to.eq(3)
            expect(await decimalMath.divFloor(3484572, ONE.mul(485))).to.eq(7184)
        })

        it('divFloor error cases', async () => {
            await expect(decimalMath.divFloor(ONE, 0)).to.be.reverted
        })

        ////////////////////////////////////////////////////////////

        it('divCeil accuracy', async () => {
            expect(await decimalMath.divCeil(ONE.mul(2), ONE.mul(2))).to.eq(ONE.mul(1))
            expect(await decimalMath.divCeil(ONE.mul(3), ONE.mul(2))).to.eq(ONE.mul(15).div(10))
            expect(await decimalMath.divCeil(ONE.mul(10), ONE.mul(2))).to.eq(ONE.mul(5))
            expect(await decimalMath.divCeil(ONE.mul(9), ONE.mul(2))).to.eq(ONE.mul(45).div(10))
            expect(await decimalMath.divCeil(ONE.mul(77), ONE.mul(11))).to.eq(ONE.mul(7))
        })

        it('divCeil corner cases', async () => {
            expect(await decimalMath.divCeil(ONE.mul(0), ONE.mul(12))).to.eq(ONE.mul(0))
            expect(await decimalMath.divCeil(0, ONE.mul(2))).to.eq(0)
            expect(await decimalMath.divCeil(1, ONE.mul(1))).to.eq(1)
            expect(await decimalMath.divCeil(2, ONE.mul(12))).to.eq(1)
        })

        it('divCeil floor cases', async () => {
            expect(await decimalMath.divCeil(1, ONE.mul(2))).to.eq(1)
            expect(await decimalMath.divCeil(10, ONE.mul(3))).to.eq(4)
            expect(await decimalMath.divCeil(12, ONE.mul(3))).to.eq(4)
            expect(await decimalMath.divCeil(20, ONE.mul(3))).to.eq(7)
            expect(await decimalMath.divCeil(20, ONE.mul(5))).to.eq(4)
            expect(await decimalMath.divCeil(20, ONE.mul(6))).to.eq(4)
            expect(await decimalMath.divCeil(3484572, ONE.mul(485))).to.eq(7185)
        })

        it('divCeil error cases', async () => {
            await expect(decimalMath.divCeil(ONE, 0)).to.be.reverted
        })

        ////////////////////////////////////////////////////////////

        it('reciprocalFloor accuracy', async () => {
            expect(await decimalMath.reciprocalFloor(ONE.mul(1))).to.eq(ONE.mul(1))
            expect(await decimalMath.reciprocalFloor(ONE.mul(2))).to.eq(ONE.mul(5).div(10))
            expect(await decimalMath.reciprocalFloor(ONE.mul(3))).to.eq(ONE.mul(1).div(3))
            expect(await decimalMath.reciprocalFloor(ONE.mul(4))).to.eq(ONE.mul(25).div(100))
            expect(await decimalMath.reciprocalFloor(ONE.mul(5))).to.eq(ONE.mul(2).div(10))
            expect(await decimalMath.reciprocalFloor(ONE.mul(7))).to.eq(ONE.mul(1).div(7))
            expect(await decimalMath.reciprocalFloor(ONE.mul(10))).to.eq(ONE.mul(1).div(10))
        })

        it('reciprocalFloor corner cases', async () => {
            expect(await decimalMath.reciprocalFloor(1)).to.eq(ONE2)
            expect(await decimalMath.reciprocalFloor(2)).to.eq(ONE2.div(2))
            expect(await decimalMath.reciprocalFloor(3)).to.eq(ONE2.div(3))
            expect(await decimalMath.reciprocalFloor(ONE2)).to.eq(1)
        })

        it('reciprocalFloor floor cases', async () => {
            expect(await decimalMath.reciprocalFloor(ONE2.div(10))).to.eq(10)
            expect(await decimalMath.reciprocalFloor(ONE2.div(10).mul(2))).to.eq(5)
            expect(await decimalMath.reciprocalFloor(ONE2.div(10).mul(3))).to.eq(3)
            expect(await decimalMath.reciprocalFloor(ONE2.div(10).mul(4))).to.eq(2)
            expect(await decimalMath.reciprocalFloor(ONE2.div(10).mul(5))).to.eq(2)
            expect(await decimalMath.reciprocalFloor(ONE2.div(10).mul(6))).to.eq(1)
            expect(await decimalMath.reciprocalFloor(ONE2.div(100).mul(3))).to.eq(33)
        })

        it('reciprocalFloor error cases', async () => {
            await expect(decimalMath.reciprocalFloor(0)).to.be.reverted
        })

        ////////////////////////////////////////////////////////////

        it('reciprocalCeil accuracy', async () => {
            expect(await decimalMath.reciprocalCeil(ONE.mul(1))).to.eq(ONE.mul(1))
            expect(await decimalMath.reciprocalCeil(ONE.mul(2))).to.eq(ONE.mul(5).div(10))
            expect(await decimalMath.reciprocalCeil(ONE.mul(3))).to.eq(ONE.mul(1).div(3).add(1))
            expect(await decimalMath.reciprocalCeil(ONE.mul(4))).to.eq(ONE.mul(25).div(100))
            expect(await decimalMath.reciprocalCeil(ONE.mul(5))).to.eq(ONE.mul(2).div(10))
            expect(await decimalMath.reciprocalCeil(ONE.mul(7))).to.eq(ONE.mul(1).div(7).add(1))
            expect(await decimalMath.reciprocalCeil(ONE.mul(10))).to.eq(ONE.mul(1).div(10))
        })

        it('reciprocalCeil corner cases', async () => {
            expect(await decimalMath.reciprocalCeil(1)).to.eq(ONE2)
            expect(await decimalMath.reciprocalCeil(2)).to.eq(ONE2.div(2))
            expect(await decimalMath.reciprocalCeil(3)).to.eq(ONE2.div(3).add(1))
            expect(await decimalMath.reciprocalCeil(ONE2)).to.eq(1)
        })

        it('reciprocalCeil floor cases', async () => {
            expect(await decimalMath.reciprocalCeil(ONE2.div(10))).to.eq(10)
            expect(await decimalMath.reciprocalCeil(ONE2.div(10).mul(2))).to.eq(5)
            expect(await decimalMath.reciprocalCeil(ONE2.div(10).mul(3))).to.eq(4)
            expect(await decimalMath.reciprocalCeil(ONE2.div(10).mul(4))).to.eq(3)
            expect(await decimalMath.reciprocalCeil(ONE2.div(10).mul(5))).to.eq(2)
            expect(await decimalMath.reciprocalCeil(ONE2.div(10).mul(6))).to.eq(2)
            expect(await decimalMath.reciprocalCeil(ONE2.div(100).mul(3))).to.eq(34)
        })

        it('reciprocalCeil error cases', async () => {
            await expect(decimalMath.reciprocalCeil(0)).to.be.reverted
        })
    })
})
