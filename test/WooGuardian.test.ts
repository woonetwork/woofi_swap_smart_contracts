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
import { Contract, utils } from 'ethers'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'

// import WooPP from '../build/WooPP.json'
import WooGuardian from '../build/WooGuardian.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'
import IWooracle from '../build/IWooracle.json'
import IRewardManager from '../build/IRewardManager.json'
import AggregatorV3Interface from '../build/AggregatorV3Interface.json'

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

const DEFAULT_BOUND = utils.parseEther('0.01') // 1%

// Chainlink BSC: https://data.chain.link/bsc/mainnet/crypto-usd
// BTC: https://data.chain.link/bsc/mainnet/crypto-usd/btc-usd
// Woo: https://data.chain.link/bsc/mainnet/crypto-usd/woo-usd
// USDT: https://data.chain.link/bsc/mainnet/crypto-usd/usdt-usd

describe('WooGuardian Test Suite 1', () => {
  const [owner, user1, user2, wooracle] = new MockProvider().getWallets()

  let usdtToken: Contract
  let btcToken: Contract
  let wooToken: Contract

  let usdtChainLinkRefOracle: Contract
  let btcChainLinkRefOracle: Contract
  let wooChainLinkRefOracle: Contract

  before('deploy ERC20 & Prepare chainlink oracles', async () => {
    usdtToken = await deployContract(owner, TestToken, [])
    btcToken = await deployContract(owner, TestToken, [])
    wooToken = await deployContract(owner, TestToken, [])

    usdtChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await usdtChainLinkRefOracle.mock.decimals.returns(8)
    await usdtChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419103431'),
      BigNumber.from('100000974'), // 1.00 usdt
      BigNumber.from('1634749403'),
      BigNumber.from('1634749403'),
      BigNumber.from('36893488147419103431')
    )

    btcChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await btcChainLinkRefOracle.mock.decimals.returns(8)
    await btcChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419150348'),
      BigNumber.from('6512226000000'), // 65122 usdt
      BigNumber.from('1634801897'),
      BigNumber.from('1634801897'),
      BigNumber.from('36893488147419150348')
    )

    wooChainLinkRefOracle = await deployMockContract(owner, AggregatorV3Interface.abi)
    await wooChainLinkRefOracle.mock.decimals.returns(8)
    await wooChainLinkRefOracle.mock.latestRoundData.returns(
      BigNumber.from('36893488147419122884'),
      BigNumber.from('129952890'), // 1.29 usdt
      BigNumber.from('1634799201'),
      BigNumber.from('1634799201'),
      BigNumber.from('36893488147419122884')
    )
  })

  describe('check func acc and revert test', () => {
    let wooGuardian: Contract

    before('deploy WooGuardian', async () => {
      wooGuardian = await deployContract(owner, WooGuardian, [DEFAULT_BOUND])
      await wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      await wooGuardian.setToken(btcToken.address, btcChainLinkRefOracle.address)
      await wooGuardian.setToken(wooToken.address, wooChainLinkRefOracle.address)
    })

    it('ctor accuracy1', async () => {
      expect(await wooGuardian._OWNER_()).to.eq(owner.address)
    })

    it('ctor accuracy2', async () => {
      expect(await wooGuardian.priceBound()).to.eq(DEFAULT_BOUND)
    })

    it('checkSwapPrice btc/usdt accuracy1', async () => {
      await wooGuardian.checkSwapPrice(utils.parseEther('65122'), btcToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('65000'), btcToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('64700'), btcToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('65300'), btcToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('65500'), btcToken.address, usdtToken.address)
    })

    // 99% btc_price = 64,470.78
    it('checkSwapPrice btc/usdt < -0.1% revert', async () => {
      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('64470'), btcToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')

      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('64400'), btcToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')
    })

    // 101% btc_price = 65,773.22
    it('checkSwapPrice btc/usdt > 0.1% revert', async () => {
      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('65774'), btcToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')

      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('65800'), btcToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')
    })

    it('checkSwapPrice woo/usdt accuracy1', async () => {
      await wooGuardian.checkSwapPrice(utils.parseEther('1.2995'), wooToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('1.30'), wooToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('1.305'), wooToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('1.31'), wooToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('1.29'), wooToken.address, usdtToken.address)

      await wooGuardian.checkSwapPrice(utils.parseEther('1.295'), wooToken.address, usdtToken.address)
    })

    // 99% woo_price = 1.286505
    it('checkSwapPrice woo/usdt < -0.1% revert', async () => {
      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('1.2865'), wooToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')
    })

    // 101% woo_price = 1.312524
    it('checkSwapPrice woo/usdt > 0.1% revert', async () => {
      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('1.31253'), wooToken.address, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: PRICE_UNRELIABLE')
    })

    // ------ checkSwapAmount ------ //

    it('checkSwapAmount btc/usdt accuracy1', async () => {
      let fromAmount = 1.0
      let price = 65122
      let toAmount

      toAmount = fromAmount * price * 0.995
      await wooGuardian.checkSwapAmount(
        btcToken.address,
        usdtToken.address,
        utils.parseEther(fromAmount.toString()),
        utils.parseEther(toAmount.toString())
      )

      toAmount = fromAmount * price * 0.991
      await wooGuardian.checkSwapAmount(
        btcToken.address,
        usdtToken.address,
        utils.parseEther(fromAmount.toString()),
        utils.parseEther(toAmount.toString())
      )

      toAmount = fromAmount * price * 1.0099
      await wooGuardian.checkSwapAmount(
        btcToken.address,
        usdtToken.address,
        utils.parseEther(fromAmount.toString()),
        utils.parseEther(toAmount.toString())
      )

      toAmount = fromAmount * price * 1.0095
      await wooGuardian.checkSwapAmount(
        btcToken.address,
        usdtToken.address,
        utils.parseEther(fromAmount.toString()),
        utils.parseEther(toAmount.toString())
      )
    })

    // 99% btc_price = 64,470.78
    it('checkSwapAmount btc/usdt < -0.1% revert', async () => {
      let fromAmount = 1.0
      let price = 65122
      let toAmount

      toAmount = fromAmount * price * 0.899
      await expect(
        wooGuardian.checkSwapAmount(
          btcToken.address,
          usdtToken.address,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: TO_AMOUNT_UNRELIABLE')

      toAmount = fromAmount * price * 0.895
      await expect(
        wooGuardian.checkSwapAmount(
          btcToken.address,
          usdtToken.address,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: TO_AMOUNT_UNRELIABLE')
    })

    // 101% btc_price = 65,773.22
    it('checkSwapAmount btc/usdt > 0.1% revert', async () => {
      let fromAmount = 1.0
      let price = 65122
      let toAmount

      toAmount = fromAmount * price * 1.011
      await expect(
        wooGuardian.checkSwapAmount(
          btcToken.address,
          usdtToken.address,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: TO_AMOUNT_UNRELIABLE')

      toAmount = fromAmount * price * 1.015
      await expect(
        wooGuardian.checkSwapAmount(
          btcToken.address,
          usdtToken.address,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: TO_AMOUNT_UNRELIABLE')
    })
  })

  describe('reverts test', () => {
    let wooGuardian: Contract

    before('deploy WooGuardian', async () => {
      wooGuardian = await deployContract(owner, WooGuardian, [DEFAULT_BOUND])
      await wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      await wooGuardian.setToken(btcToken.address, btcChainLinkRefOracle.address)
      await wooGuardian.setToken(wooToken.address, wooChainLinkRefOracle.address)
    })

    it('Prevents zero addr from checkSwapPrice', async () => {
      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('64470'), ZERO_ADDR, usdtToken.address)
      ).to.be.revertedWith('WooGuardian: fromToken_ZERO_ADDR')

      await expect(
        wooGuardian.checkSwapPrice(utils.parseEther('64470'), btcToken.address, ZERO_ADDR)
      ).to.be.revertedWith('WooGuardian: toToken_ZERO_ADDR')
    })

    it('Prevents zero addr from checkSwapAmount', async () => {
      let fromAmount = 1.0
      let price = 65122
      let toAmount
      toAmount = fromAmount * price * 0.899

      await expect(
        wooGuardian.checkSwapAmount(
          ZERO_ADDR,
          usdtToken.address,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: fromToken_ZERO_ADDR')

      await expect(
        wooGuardian.checkSwapAmount(
          btcToken.address,
          ZERO_ADDR,
          utils.parseEther(fromAmount.toString()),
          utils.parseEther(toAmount.toString())
        )
      ).to.be.revertedWith('WooGuardian: toToken_ZERO_ADDR')
    })

    it('Prevents zero addr from setToken', async () => {
      await expect(
        wooGuardian.setToken(ZERO_ADDR, usdtChainLinkRefOracle.address)
      ).to.be.revertedWith('WooGuardian: token_ZERO_ADDR')
    })
  })

  describe('events test', () => {
    let wooGuardian: Contract

    before('deploy WooGuardian', async () => {
      wooGuardian = await deployContract(owner, WooGuardian, [DEFAULT_BOUND])
      await wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      await wooGuardian.setToken(btcToken.address, btcChainLinkRefOracle.address)
      await wooGuardian.setToken(wooToken.address, wooChainLinkRefOracle.address)
    })

    it('setToken emit ChainlinkRefOracleUpdated', async () => {
      await expect(
        wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      ).to.emit(wooGuardian, 'ChainlinkRefOracleUpdated').withArgs(
        usdtToken.address,
        usdtChainLinkRefOracle.address
      )
    })
  })

  describe('onlyOwner test', () => {
    let wooGuardian: Contract

    before('deploy WooGuardian', async () => {
      wooGuardian = await deployContract(owner, WooGuardian, [DEFAULT_BOUND])
      await wooGuardian.setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      await wooGuardian.setToken(btcToken.address, btcChainLinkRefOracle.address)
      await wooGuardian.setToken(wooToken.address, wooChainLinkRefOracle.address)
    })

    it('Prevents non-owners from setToken', async () => {
      expect(await wooGuardian._OWNER_()).to.eq(owner.address)

      await expect(
        wooGuardian.connect(user1).setToken(usdtToken.address, usdtChainLinkRefOracle.address)
      ).to.be.revertedWith('InitializableOwnable: NOT_OWNER')
    })
  })
})
