import { ethers } from 'hardhat'
import { expect, use } from 'chai'
import { deployContract, deployMockContract, solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { VaultAggregator } from '../typechain'

import VaultAggregatorArtifact from '../artifacts/contracts/earn/VaultAggregator.sol/VaultAggregator.json'
import WOOFiVaultV2Artifact from '../artifacts/contracts/earn/VaultV2.sol/WOOFiVaultV2.json'
import IERC20 from '../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json'
import IMasterChefWooInfo from '../artifacts/contracts/interfaces/IVaultAggregator.sol/IMasterChefWooInfo.json'
import { Contract } from 'ethers'

use(solidity)

const pid0UserInfo = [10000, 20000]
const pid1UserInfo = [30000, 40000]
const pid0PendingXWoo = [50000, 60000]
const pid1PendingXWoo = [70000, 80000]

describe('VaultAggregator.sol', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let vaultAggregator: VaultAggregator
  let masterChefWoo: Contract
  let vaults: Contract[] = []
  let vaultAddresses: string[] = []
  let tokenAddresses: string[] = []

  before(async () => {
    ;[owner, user] = await ethers.getSigners()
    console.log(user.address)
    console.log((await user.getBalance()).toString())

    // Deploy VaultAggregator Contract
    vaultAggregator = (await deployContract(owner, VaultAggregatorArtifact, [])) as VaultAggregator
    console.log(await vaultAggregator.owner())

    // Deploy MasterChefWoo
    masterChefWoo = await deployMockContract(owner, IMasterChefWooInfo.abi)
    await masterChefWoo.mock.userInfo.withArgs(0, user.address).returns(...pid0UserInfo)
    await masterChefWoo.mock.userInfo.withArgs(1, user.address).returns(...pid1UserInfo)
    await masterChefWoo.mock.pendingXWoo.withArgs(0, user.address).returns(...pid0PendingXWoo)
    await masterChefWoo.mock.pendingXWoo.withArgs(1, user.address).returns(...pid1PendingXWoo)

    // Deploy Vault Contract
    let deployVaultCount = 20
    for (let i = 0; i < deployVaultCount; i++) {
      let vault = await deployMockContract(owner, WOOFiVaultV2Artifact.abi)
      await vault.mock.balanceOf.returns(i)
      await vault.mock.getPricePerFullShare.returns(i)
      await vault.mock.costSharePrice.returns(i)
      vaults.push(vault)
      vaultAddresses.push(vault.address)

      let token = await deployMockContract(owner, IERC20.abi)
      await token.mock.balanceOf.returns(i)
      tokenAddresses.push(token.address)
    }
  })

  it('Check VaultAggregator costSharePrice', async () => {
    console.log('start')
    let iterationGet: Number[] = []
    for (let i = 0; i < vaults.length; i++) {
      let cost = await vaults[i].costSharePrice(user.address)
      iterationGet.push(cost.toNumber())
    }
    console.log(iterationGet)

    let bnCosts = await vaultAggregator.costSharePrices(user.address, vaultAddresses)
    let batchGet: Number[] = []
    for (let i = 0; i < bnCosts.length; i++) {
      batchGet.push(bnCosts[i].toNumber())
    }
    console.log(batchGet)
  })

  it('Get vaultInfos only', async () => {
    let results = await vaultAggregator.infos(user.address, masterChefWoo.address, vaultAddresses, [], [])

    for (let key in results.vaultInfos) {
      let batchGet: Number[] = []
      console.log(key)
      for (let i = 0; i < results.vaultInfos[key].length; i++) {
        let value = results.vaultInfos[key][i].toNumber()
        batchGet.push(value)
      }
      console.log(batchGet)
    }

    console.log(results.tokenInfos)
  })

  it('Get tokenInfos only', async () => {
    let results = await vaultAggregator.infos(user.address, masterChefWoo.address, [], tokenAddresses, [])

    for (let key in results.tokenInfos) {
      if (key == 'nativeBalance') {
        console.log(results.tokenInfos.nativeBalance.toString())
        continue
      }

      let batchGet: Number[] = []
      console.log(key)
      for (let i = 0; i < results.tokenInfos.balancesOf.length; i++) {
        let value = results.tokenInfos.balancesOf[i].toNumber()
        batchGet.push(value)
      }
      console.log(batchGet)
    }

    console.log(results.vaultInfos)
  })

  it('Get whole infos', async () => {
    let results = await vaultAggregator.infos(
      user.address,
      masterChefWoo.address,
      vaultAddresses,
      tokenAddresses,
      [0, 1]
    )

    for (let key in results.vaultInfos) {
      let batchGet: Number[] = []
      console.log(key)
      for (let i = 0; i < results.vaultInfos[key].length; i++) {
        let value = results.vaultInfos[key][i].toNumber()
        batchGet.push(value)
      }
      console.log(batchGet)
    }

    for (let key in results.tokenInfos) {
      if (key == 'nativeBalance') {
        console.log(results.tokenInfos.nativeBalance.toString())
        continue
      }

      let batchGet: Number[] = []
      console.log(key)
      for (let i = 0; i < results.tokenInfos.balancesOf.length; i++) {
        let value = results.tokenInfos.balancesOf[i].toNumber()
        batchGet.push(value)
      }
      console.log(batchGet)
    }

    let amounts = results.masterChefWooInfos.amounts
    let rewardDebts = results.masterChefWooInfos.rewardDebts
    expect(amounts[0]).to.eq(pid0UserInfo[0])
    expect(rewardDebts[0]).to.eq(pid0UserInfo[1])

    expect(amounts[1]).to.eq(pid1UserInfo[0])
    expect(rewardDebts[1]).to.eq(pid1UserInfo[1])

    let pendingXWooAmounts = results.masterChefWooInfos.pendingXWooAmounts
    let pendingWooAmounts = results.masterChefWooInfos.pendingWooAmounts
    expect(pendingXWooAmounts[0]).to.eq(pid0PendingXWoo[0])
    expect(pendingWooAmounts[0]).to.eq(pid0PendingXWoo[1])

    expect(pendingXWooAmounts[1]).to.eq(pid1PendingXWoo[0])
    expect(pendingWooAmounts[1]).to.eq(pid1PendingXWoo[1])
  })
})
