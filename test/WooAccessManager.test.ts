import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { TestToken, WooAccessManager, WooStakingVault } from '../typechain'
import { ethers } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import { expect } from 'chai'
import WooAccessManagerArtifact from '../artifacts/contracts/WooAccessManager.sol/WooAccessManager.json'
import { BigNumber } from 'ethers'
import exp from 'constants'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

describe('WooAccessManager Accuracy & Access Control & Require Check', () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let rewardAdmin: SignerWithAddress
  let secondRewardAdmin: SignerWithAddress
  let vault: SignerWithAddress
  let secondVault: SignerWithAddress

  let wooAccessManager: WooAccessManager

  let onlyOwnerRevertedMessage: string
  let rewardAdminZeroAddressMessage: string
  let zeroFeeVaultZeroAddressMessage: string
  let whenNotPausedRevertedMessage: string
  let whenPausedRevertedMessage: string

  before(async () => {
    ;[owner, user, rewardAdmin, secondRewardAdmin, vault, secondVault] = await ethers.getSigners()

    wooAccessManager = (await deployContract(owner, WooAccessManagerArtifact, [])) as WooAccessManager

    onlyOwnerRevertedMessage = 'Ownable: caller is not the owner'
    rewardAdminZeroAddressMessage = 'WooAccessManager: rewardAdmin_ZERO_ADDR'
    zeroFeeVaultZeroAddressMessage = 'WooAccessManager: vault_ZERO_ADDR'
    whenNotPausedRevertedMessage = 'Pausable: paused'
    whenPausedRevertedMessage = 'Pausable: not paused'
  })

  it('Check state variables after contract initialized', async () => {
    expect(await wooAccessManager.owner()).to.eq(owner.address)
    expect(await wooAccessManager.isRewardAdmin(rewardAdmin.address)).to.eq(false)
    expect(await wooAccessManager.zeroFeeVault(vault.address)).to.eq(false)
  })

  it('Only owner able to setRewardAdmin', async () => {
    expect(await wooAccessManager.isRewardAdmin(rewardAdmin.address)).to.eq(false)
    await expect(wooAccessManager.connect(user).setRewardAdmin(rewardAdmin.address, true)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await expect(wooAccessManager.connect(owner).setRewardAdmin(rewardAdmin.address, true))
      .to.emit(wooAccessManager, 'RewardAdminUpdated')
      .withArgs(rewardAdmin.address, true)
    expect(await wooAccessManager.isRewardAdmin(rewardAdmin.address)).to.eq(true)
  })

  it('SetRewardAdmin from zero address will be reverted', async () => {
    expect(await wooAccessManager.isRewardAdmin(ZERO_ADDRESS)).to.eq(false)
    await expect(wooAccessManager.connect(owner).setRewardAdmin(ZERO_ADDRESS, true)).to.be.revertedWith(
      rewardAdminZeroAddressMessage
    )
    expect(await wooAccessManager.isRewardAdmin(ZERO_ADDRESS)).to.eq(false)
  })

  it('Only owner able to batchSetRewardAdmin', async () => {
    let rewardAdmins = [rewardAdmin.address, secondRewardAdmin.address]
    let flags = [true, true]
    // pre check
    for (let i = 0; i < rewardAdmins.length; i++) {
      if (await wooAccessManager.isRewardAdmin(rewardAdmins[i])) {
        await wooAccessManager.setRewardAdmin(rewardAdmins[i], false)
        expect(await wooAccessManager.isRewardAdmin(rewardAdmins[i])).to.eq(false)
      }
    }
    // main
    await expect(wooAccessManager.connect(user).batchSetRewardAdmin(rewardAdmins, flags)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await expect(wooAccessManager.connect(owner).batchSetRewardAdmin(rewardAdmins, flags))
      .to.emit(wooAccessManager, 'BatchRewardAdminUpdated')
      .withArgs(rewardAdmins, flags)
    // check result
    for (let i = 0; i < rewardAdmins.length; i++) {
      expect(await wooAccessManager.isRewardAdmin(rewardAdmins[i])).to.eq(true)
    }
  })

  it('BatchSetRewardAdmin from zero address will be reverted', async () => {
    let rewardAdmins = [ZERO_ADDRESS, rewardAdmin.address]
    let flags = [true, true]
    // pre check
    for (let i = 0; i < rewardAdmins.length; i++) {
      if (await wooAccessManager.isRewardAdmin(rewardAdmins[i])) {
        await wooAccessManager.setRewardAdmin(rewardAdmins[i], false)
        expect(await wooAccessManager.isRewardAdmin(rewardAdmins[i])).to.eq(false)
      }
    }
    // main
    await expect(wooAccessManager.connect(owner).batchSetRewardAdmin(rewardAdmins, flags)).to.be.revertedWith(
      rewardAdminZeroAddressMessage
    )
    // check result
    for (let i = 0; i < rewardAdmins.length; i++) {
      expect(await wooAccessManager.isRewardAdmin(rewardAdmins[i])).to.eq(false)
    }
  })

  it('Only owner able to setZeroFeeVault', async () => {
    expect(await wooAccessManager.zeroFeeVault(vault.address)).to.eq(false)
    await expect(wooAccessManager.connect(user).setZeroFeeVault(vault.address, true)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )

    await expect(wooAccessManager.connect(owner).setZeroFeeVault(vault.address, true))
      .to.emit(wooAccessManager, 'ZeroFeeVaultUpdated')
      .withArgs(vault.address, true)
    expect(await wooAccessManager.zeroFeeVault(vault.address)).to.eq(true)
  })

  it('SetZeroFeeVault from zero address will be reverted', async () => {
    expect(await wooAccessManager.zeroFeeVault(ZERO_ADDRESS)).to.eq(false)
    await expect(wooAccessManager.connect(owner).setZeroFeeVault(ZERO_ADDRESS, true)).to.be.revertedWith(
      zeroFeeVaultZeroAddressMessage
    )
    expect(await wooAccessManager.zeroFeeVault(ZERO_ADDRESS)).to.eq(false)
  })

  it('Only owner able to batchSetZeroFeeVault', async () => {
    let vaults = [vault.address, secondVault.address]
    let flags = [true, true]
    // pre check
    for (let i = 0; i < vaults.length; i++) {
      if (await wooAccessManager.zeroFeeVault(vaults[i])) {
        await wooAccessManager.setZeroFeeVault(vaults[i], false)
        expect(await wooAccessManager.zeroFeeVault(vaults[i])).to.eq(false)
      }
    }
    // main
    await expect(wooAccessManager.connect(user).batchSetZeroFeeVault(vaults, flags)).to.be.revertedWith(
      onlyOwnerRevertedMessage
    )
    await expect(wooAccessManager.connect(owner).batchSetZeroFeeVault(vaults, flags))
      .to.emit(wooAccessManager, 'BatchZeroFeeVaultUpdated')
      .withArgs(vaults, flags)
    // check result
    for (let i = 0; i < vaults.length; i++) {
      expect(await wooAccessManager.zeroFeeVault(vaults[i])).to.eq(true)
    }
  })

  it('BatchSetZeroFeeVault from zero address will be reverted', async () => {
    let vaults = [ZERO_ADDRESS, vault.address]
    let flags = [true, true]
    // pre check
    for (let i = 0; i < vaults.length; i++) {
      if (await wooAccessManager.zeroFeeVault(vaults[i])) {
        await wooAccessManager.setZeroFeeVault(vaults[i], false)
        expect(await wooAccessManager.zeroFeeVault(vaults[i])).to.eq(false)
      }
    }
    // main
    await expect(wooAccessManager.connect(owner).batchSetZeroFeeVault(vaults, flags)).to.be.revertedWith(
      zeroFeeVaultZeroAddressMessage
    )
    // check result
    for (let i = 0; i < vaults.length; i++) {
      expect(await wooAccessManager.zeroFeeVault(vaults[i])).to.eq(false)
    }
  })

  it('Only owner able to pause', async () => {
    // pre check
    if (await wooAccessManager.isRewardAdmin(rewardAdmin.address)) {
      await wooAccessManager.connect(owner).setRewardAdmin(rewardAdmin.address, false)
    }
    expect(await wooAccessManager.isRewardAdmin(rewardAdmin.address)).to.eq(false)

    if (await wooAccessManager.zeroFeeVault(vault.address)) {
      await wooAccessManager.connect(owner).setZeroFeeVault(vault.address, false)
    }
    expect(await wooAccessManager.zeroFeeVault(vault.address)).to.eq(false)

    await expect(wooAccessManager.connect(user).pause()).to.be.revertedWith(onlyOwnerRevertedMessage)
    await wooAccessManager.connect(owner).pause()

    await expect(wooAccessManager.setRewardAdmin(rewardAdmin.address, true)).to.be.revertedWith(
      whenNotPausedRevertedMessage
    )
    await expect(wooAccessManager.setZeroFeeVault(vault.address, true)).to.be.revertedWith(whenNotPausedRevertedMessage)
  })

  it('Only owner able to unpause', async () => {
    expect(await wooAccessManager.paused()).to.eq(true)
    await expect(wooAccessManager.connect(user).unpause()).to.be.revertedWith(onlyOwnerRevertedMessage)
    await wooAccessManager.connect(owner).unpause()

    expect(await wooAccessManager.paused()).to.eq(false)
    await wooAccessManager.setRewardAdmin(rewardAdmin.address, true)
    await wooAccessManager.setZeroFeeVault(vault.address, true)
    expect(await wooAccessManager.isRewardAdmin(rewardAdmin.address)).to.eq(true)
    expect(await wooAccessManager.zeroFeeVault(vault.address)).to.eq(true)
  })
})
