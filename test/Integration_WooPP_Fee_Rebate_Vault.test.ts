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
import { Contract, utils, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { deployContract, deployMockContract, MockProvider, solidity } from 'ethereum-waffle'
import IWooracle from '../build/IWooracle.json'
import IWooGuardian from '../build/IWooGuardian.json'
// import WooRouter from '../build/WooRouter.json'
import IERC20 from '../build/IERC20.json'
import TestToken from '../build/TestToken.json'
import { WSAECONNABORTED } from 'constants'
import { BigNumberish } from '@ethersproject/bignumber'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { WooFeeManager, WooRouter, WooPP, WooVaultManager, WooRebateManager } from '../typechain'
import WooRouterArtifact from '../artifacts/contracts/WooRouter.sol/WooRouter.json'
import WooPPArtifact from '../artifacts/contracts/WooPP.sol/WooPP.json'
import WooFeeManagerArtifact from '../artifacts/contracts/WooFeeManager.sol/WooFeeManager.json'
import WooRebateManagerArtifact from '../artifacts/contracts/WooRebateManager.sol/WooRebateManager.json'
import WooVaultManagerArtifact from '../artifacts/contracts/WooVaultManager.sol/WooVaultManager.json'
import { _nameprepTableB2 } from '@ethersproject/strings/lib/idna'
import DecimalMath from '../artifacts/contracts/libraries/DecimalMath.sol/DecimalMath.json'

use(solidity)

const {
    BigNumber,
    constants: { MaxUint256 },
} = ethers

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const WBNB_ADDR = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
const ZERO = 0

const BTC_PRICE = 50000
const WOO_PRICE = 1.2

const ONE = utils.parseEther('1')

const SWAP_FEE_RATE = utils.parseEther('0.00025') // 2.5 bps
const BROKER1_REBATE_RATE = utils.parseEther('0.2') // 20% fee -> 0.5 bps
const BROKER2_REBATE_RATE = utils.parseEther('0.4') // 40% fee -> 1.0 bps

const VAULT1_WEIGHT = 20
const VAULT2_WEIGHT = 80
const TOTAL_WEIGHT = VAULT1_WEIGHT + VAULT2_WEIGHT

const BASE = utils.parseEther('0.001') // 1e-3 usdt

describe('Rebate Fee Vault Integration Test', () => {
    let owner: SignerWithAddress
    let user: SignerWithAddress
    let broker1: SignerWithAddress
    let broker2: SignerWithAddress
    let vault1: SignerWithAddress
    let vault2: SignerWithAddress

    let wooracle: Contract
    let wooGuardian: Contract
    let btcToken: Contract
    let wooToken: Contract
    let usdtToken: Contract

    let wooPP: WooPP
    let feeManager: WooFeeManager
    let rebateManager: WooRebateManager
    let vaultManager: WooVaultManager

    before('Deploy ERC20', async () => {
        ;[owner, user, broker1, broker2, vault1, vault2] = await ethers.getSigners()
        btcToken = await deployContract(owner, TestToken, [])
        wooToken = await deployContract(owner, TestToken, [])
        usdtToken = await deployContract(owner, TestToken, [])

        wooracle = await deployMockContract(owner, IWooracle.abi)
        await wooracle.mock.timestamp.returns(BigNumber.from(1634180070))
        await wooracle.mock.state
            .withArgs(btcToken.address)
            .returns(
                utils.parseEther(BTC_PRICE.toString()),
                utils.parseEther('0.0001'),
                utils.parseEther('0.000000001'),
                true
            )
        await wooracle.mock.state
            .withArgs(wooToken.address)
            .returns(
                utils.parseEther(WOO_PRICE.toString()),
                utils.parseEther('0.002'),
                utils.parseEther('0.00000005'),
                true)

        wooGuardian = await deployMockContract(owner, IWooGuardian.abi)
        await wooGuardian.mock.checkSwapPrice.returns()
        await wooGuardian.mock.checkSwapAmount.returns()
        await wooGuardian.mock.checkInputAmount.returns()
    })

    beforeEach('Deploy WooPP RebateManager and Vault Manager', async () => {
        feeManager = await deployContract(
            owner,
            WooFeeManagerArtifact,
            [usdtToken.address]) as WooFeeManager

        wooPP = await deployContract(owner, WooPPArtifact, [
            usdtToken.address,
            wooracle.address,
            feeManager.address,
            wooGuardian.address,
        ]) as WooPP

        const threshold = 0
        const R = BigNumber.from(0)
        await wooPP.addBaseToken(btcToken.address, threshold, R)
        await wooPP.addBaseToken(wooToken.address, threshold, R)

        rebateManager = await deployContract(
            owner,
            WooRebateManagerArtifact,
            [usdtToken.address, wooToken.address]) as WooRebateManager
        rebateManager.setWooPP(wooPP.address)
        rebateManager.setRebateRate(broker1.address, BROKER1_REBATE_RATE)
        rebateManager.setRebateRate(broker2.address, BROKER2_REBATE_RATE)

        vaultManager = await deployContract(
            owner,
            WooVaultManagerArtifact,
            [usdtToken.address, wooToken.address]) as WooVaultManager
        vaultManager.setWooPP(wooPP.address)
        vaultManager.setVaultWeight(vault1.address, VAULT1_WEIGHT)
        vaultManager.setVaultWeight(vault2.address, VAULT2_WEIGHT)

        feeManager.setRebateManager(rebateManager.address)
        feeManager.setVaultManager(vaultManager.address)
        feeManager.setVaultRewardRate(utils.parseEther('1.0'))
        feeManager.setFeeRate(btcToken.address, SWAP_FEE_RATE)
        feeManager.setFeeRate(wooToken.address, SWAP_FEE_RATE)

        await btcToken.mint(wooPP.address, ONE.mul(100))
        await usdtToken.mint(wooPP.address, ONE.mul(10000000))
        await wooToken.mint(wooPP.address, ONE.mul(10000000))

        await btcToken.mint(user.address, utils.parseEther('10'))
        // await usdtToken.mint(user.address, utils.parseEther('300000'))
        await wooToken.mint(user.address, utils.parseEther('100000'))
    })

    it('integration test', async () => {
        const quote1 = await wooPP.querySellBase(btcToken.address, ONE)
        const vol1 = quote1.mul(ONE.add(SWAP_FEE_RATE)).div(ONE)
        console.log('Rebate rate: broker1 20%=0.5bps , broker2 40%=1bps')
        console.log('1 btc -> usdt swap volume: ', utils.formatEther(vol1))

        await btcToken.connect(user).approve(wooPP.address, ONE.mul(10))

        // Sell 1 btc
        await wooPP.connect(user).sellBase(btcToken.address, ONE.mul(1), 0, user.address, broker1.address)

        _bal('User btc balance: ', btcToken, user.address)
        _bal('User usdt balance: ', usdtToken, user.address)
        _bal('WooPP btc balance: ', btcToken, wooPP.address)
        _bal('WooPP usdt balance: ', usdtToken, wooPP.address)

        _allManagerBal()

        _bal('Broker1 usdt balance: ', usdtToken, broker1.address)
        _bal('Broker2 usdt balance: ', usdtToken, broker2.address)

        _allPendingRebate()

        const quote2 = await wooPP.querySellBase(btcToken.address, ONE.mul(3))
        const vol2 = quote2.mul(ONE.add(SWAP_FEE_RATE)).div(ONE)
        console.log('3 btc -> usdt swap volume: ', utils.formatEther(vol2))

        // Sell 3 btcs
        await wooPP.connect(user).sellBase(btcToken.address, ONE.mul(3), 0, user.address, broker2.address)

        _bal('User btc balance: ', btcToken, user.address)
        _bal('User usdt balance: ', usdtToken, user.address)
        _bal('WooPP btc balance: ', btcToken, wooPP.address)
        _bal('WooPP usdt balance: ', usdtToken, wooPP.address)

        _allManagerBal()

        _bal('Broker1 usdt balance: ', usdtToken, broker1.address)
        _bal('Broker2 usdt balance: ', usdtToken, broker2.address)

        _allPendingRebate()

        const fee1 = vol1.mul(SWAP_FEE_RATE).div(ONE)
        const rebate1 = fee1.mul(BROKER1_REBATE_RATE).div(ONE)
        const reward1 = fee1.sub(rebate1)

        const fee2 = vol2.mul(SWAP_FEE_RATE).div(ONE)
        const rebate2 = fee2.mul(BROKER2_REBATE_RATE).div(ONE)
        const reward2 = fee2.sub(rebate2)

        expect((await usdtToken.balanceOf(rebateManager.address)).div(BASE)).to.eq(rebate1.add(rebate2).div(BASE))
        expect((await rebateManager.pendingRebate(broker1.address)).div(BASE)).to.eq(rebate1.div(BASE))
        expect((await rebateManager.pendingRebate(broker2.address)).div(BASE)).to.eq(rebate2.div(BASE))


        // Distribute all the rewards

        const vaultRewards = reward1.add(reward2)
        const vaultReward1 = vaultRewards.mul(VAULT1_WEIGHT).div(TOTAL_WEIGHT)
        const vaultReward2 = vaultRewards.mul(VAULT2_WEIGHT).div(TOTAL_WEIGHT)
        expect((await vaultManager.pendingAllReward()).div(BASE)).to.eq(vaultRewards.div(BASE))
        expect((await vaultManager.pendingReward(vault1.address)).div(BASE))
            .to.eq(vaultReward1.div(BASE))
        expect((await vaultManager.pendingReward(vault2.address)).div(BASE))
            .to.eq(vaultReward2.div(BASE))

        expect((await wooToken.balanceOf(vault1.address)).div(BASE)).to.eq(0)
        expect((await wooToken.balanceOf(vault2.address)).div(BASE)).to.eq(0)


        const prevPendingReward = await vaultManager.pendingAllReward()

        await vaultManager.distributeAllReward()

        // NOTE: distribute -> swap quote to reward token -> generate a little pending reward
        const newPendingReward = prevPendingReward.mul(SWAP_FEE_RATE).div(ONE)
        expect((await vaultManager.pendingAllReward()).div(BASE))
            .to.eq(newPendingReward.div(BASE))
        expect((await vaultManager.pendingReward(vault1.address)).div(BASE))
            .to.eq(newPendingReward.mul(VAULT1_WEIGHT).div(TOTAL_WEIGHT).div(BASE))
        expect((await vaultManager.pendingReward(vault2.address)).div(BASE))
            .to.eq(newPendingReward.mul(VAULT2_WEIGHT).div(TOTAL_WEIGHT).div(BASE))

        const wooReward1 = await wooPP.querySellQuote(wooToken.address, vaultReward1)
        expect((await wooToken.balanceOf(vault1.address)).div(BASE)).to.eq(wooReward1.div(BASE))

        const wooReward2 = await wooPP.querySellQuote(wooToken.address, vaultReward2)
        expect((await wooToken.balanceOf(vault2.address)).div(BASE)).to.eq(wooReward2.div(BASE))

        // Claim the rebate
        expect((await usdtToken.balanceOf(rebateManager.address)).div(BASE)).to.eq(rebate1.add(rebate2).div(BASE))
        expect((await rebateManager.pendingRebate(broker1.address)).div(BASE)).to.eq(rebate1.div(BASE))
        expect((await rebateManager.pendingRebate(broker2.address)).div(BASE)).to.eq(rebate2.div(BASE))
        expect((await usdtToken.balanceOf(broker1.address)).div(BASE)).to.eq(0)
        expect((await usdtToken.balanceOf(broker2.address)).div(BASE)).to.eq(0)
        expect((await wooToken.balanceOf(broker1.address)).div(BASE)).to.eq(0)
        expect((await wooToken.balanceOf(broker2.address)).div(BASE)).to.eq(0)

        await expect(rebateManager.claimRebate()).to.be.revertedWith('WooRebateManager: NO_pending_rebate')

        await rebateManager.connect(broker1).claimRebate()
        expect((await usdtToken.balanceOf(rebateManager.address)).div(BASE)).to.eq(rebate2.div(BASE))
        expect((await rebateManager.pendingRebate(broker1.address)).div(BASE)).to.eq(0)
        expect((await rebateManager.pendingRebate(broker2.address)).div(BASE)).to.eq(rebate2.div(BASE))
        expect((await usdtToken.balanceOf(broker1.address)).div(BASE)).to.eq(0)
        expect((await usdtToken.balanceOf(broker2.address)).div(BASE)).to.eq(0)
        const wooRebate1 = await wooPP.querySellQuote(wooToken.address, rebate1)
        expect((await wooToken.balanceOf(broker1.address)).div(BASE)).to.eq(wooRebate1.div(BASE))
        expect((await wooToken.balanceOf(broker2.address)).div(BASE)).to.eq(0)

        await rebateManager.connect(broker2).claimRebate()
        expect((await usdtToken.balanceOf(rebateManager.address)).div(BASE)).to.eq(0)
        expect((await rebateManager.pendingRebate(broker1.address)).div(BASE)).to.eq(0)
        expect((await rebateManager.pendingRebate(broker2.address)).div(BASE)).to.eq(0)
        expect((await usdtToken.balanceOf(broker1.address)).div(BASE)).to.eq(0)
        expect((await usdtToken.balanceOf(broker2.address)).div(BASE)).to.eq(0)
        const wooRebate2 = await wooPP.querySellQuote(wooToken.address, rebate2)
        expect((await wooToken.balanceOf(broker1.address)).div(BASE)).to.eq(wooRebate1.div(BASE))
        expect((await wooToken.balanceOf(broker2.address)).div(BASE)).to.eq(wooRebate2.div(BASE))
    })

    async function _bal(desc: string, token: Contract, addr: string) {
        console.log(desc, utils.formatEther(await token.balanceOf(addr)))
    }

    async function _allPendingRebate() {
        console.log('Broker1 usdt pending reward: ',
            utils.formatEther(await rebateManager.pendingRebateInUSDT(broker1.address)))
        console.log('Broker1 woo pending reward: ',
            utils.formatEther(await rebateManager.pendingRebateInWoo(broker1.address)))
        console.log('Broker2 usdt pending reward: ',
            utils.formatEther(await rebateManager.pendingRebateInUSDT(broker2.address)))
        console.log('Broker2 woo pending reward: ',
            utils.formatEther(await rebateManager.pendingRebateInWoo(broker2.address)))
    }

    async function _allManagerBal() {
        _bal('feeManager usdt balance: ', usdtToken, feeManager.address)
        _bal('feeManager woo balance: ', wooToken, feeManager.address)
        _bal('rebateManager usdt balance: ', usdtToken, rebateManager.address)
        _bal('rebateManager woo balance: ', wooToken, rebateManager.address)
        _bal('vaultManager usdt balance: ', usdtToken, vaultManager.address)
        _bal('vaultManager woo balance: ', wooToken, vaultManager.address)
    }
})
