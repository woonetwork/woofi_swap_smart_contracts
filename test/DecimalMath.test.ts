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


import { expect, use } from 'chai';
import { Contract } from 'ethers';
import { deployContract, MockProvider, solidity } from 'ethereum-waffle';
import Wooracle from '../build/Wooracle.json';

use(solidity);

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

describe('Wooracle', () => {
    const [owner, user, quoteToken] = new MockProvider().getWallets();

    describe('#ctor and setters', () => {

        let DecimalMath: Contract;

        beforeEach('deploy test oracle', async () => {
            // wooracle = await deployContract(owner, Wooracle, []);
        })

        // it('init', async () => {
        //     expect(await wooracle._OWNER_()).to.eq(owner.address)
        // })

        // it('init fields', async () => {
        //     expect(await wooracle.staleDuration()).to.eq(300)
        //     expect(await wooracle.timestamp()).to.eq(0)
        //     expect(await wooracle.quoteAddr()).to.eq(ZERO_ADDR)
        // })

        // it('setQuoteAddr', async () => {
        //     expect(await wooracle.quoteAddr()).to.eq(ZERO_ADDR)
        //     await wooracle.setQuoteAddr(quoteToken.address)
        //     expect(await wooracle.quoteAddr()).to.eq(quoteToken.address)
        // })
    });

    // TODO: add more test cases.
});
