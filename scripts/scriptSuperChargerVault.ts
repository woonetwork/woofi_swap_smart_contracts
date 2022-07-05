import { access } from 'fs'
import { ethers, run } from 'hardhat'

let want = '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75' // usdc

let accessManager = '0xd6d6A0828a80E1832cD4C3585aDED8971087fCb8' // ftm access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury
let weth = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83' // wftm

let needDeploy = true
let verifyRouter = ''

let wooPP = '0x9503E7517D3C5bc4f9E4A1c6AE4f8B33AC2546f2'
let ftmVault = '0x5dB04B6335c26ee147AfBEc161Aff6E90239b4B8'

let usdcToken = '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75'
let usdcVault = '0xFCE921ac02999E701BdE7e697b0EF64F2Da115dB'

let wooPP = '0xFCE921ac02999E701BdE7e697b0EF64F2Da115dB' // TODO: update it


async function main() {
  let vault
  let lendingManager
  let withdrawManager

  if (needDeploy) {
    let factory = await ethers.getContractFactory('WooSuperChargerVault')
    vault = await factory.deploy(weth, want, accessManager)
    await vault.deployed()
    console.log(`superChargerVault deployed to: ${vault.address}`)
    // vault = {address: '0x7a21D2C3B4e36b8343d16393771F3824119E6acF'}

    await new Promise((_) => setTimeout(_, 1000))
    factory = await ethers.getContractFactory('WooLendingManager')
    lendingManager = await factory.deploy()
    await lendingManager.deployed()
    console.log(`lendingManager deployed to: ${lendingManager.address}`)

    await new Promise((_) => setTimeout(_, 1000))
    await lendingManager.init(weth, want, accessManager, wooPP, vault.address)
    console.log(`lendingManager inited`)

    await new Promise((_) => setTimeout(_, 1000))
    await lendingManager.setBorrower('0x3e131c1aD2BE479b411FFD7087214ca877B3c58c', true) // test lender
    console.log(`lendingManager set lender`)

    await new Promise((_) => setTimeout(_, 1000))
    factory = await ethers.getContractFactory('WooWithdrawManager')
    withdrawManager = await factory.deploy()
    await withdrawManager.deployed()
    console.log(`withdrawManager deployed to: ${withdrawManager.address}`)

    await new Promise((_) => setTimeout(_, 1000))
    await withdrawManager.init(weth, want, accessManager, vault.address)
    console.log(`withdrawManager inited`)

    await new Promise((_) => setTimeout(_, 1000))
    await vault.init(usdcVault, lendingManager.address, withdrawManager.address)
    console.log(`superChargerVault inited`)
  } else {
    vault = { address: '0xc1340Df0AB0A14dFccD8291EA58FE781eDA6c98c' }
    lendingManager = { address: '0x1E94B587a5C79Fa1A4355f17D37Cc4143B103b90' }
    withdrawManager = { address: '0x6fFf453B28e84Ecb55d073241bd6600DD5747B9C' }
    // strategy = { address: verifyStrategy }
    // await strategy.setPerformanceTreasury(treasury);
    // await strategy.setWithdrawalTreasury(treasury)
    // await strategy.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    // await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
  }

  let vaultParams = [weth, want, accessManager]
  let vaultArgs = {
    address: vault.address,
    constructorArguments: vaultParams,
  }
  await run('verify:verify', vaultArgs)

  await new Promise((_) => setTimeout(_, 30000))
  await run('verify:verify', {
    address: lendingManager.address,
    constructorArguments: [],
  })

  await new Promise((_) => setTimeout(_, 30000))
  await run('verify:verify', {
    address: withdrawManager.address,
    constructorArguments: [],
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
