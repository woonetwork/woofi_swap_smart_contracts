import { ethers, run } from 'hardhat'

let want = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' // USDC: https://snowtrace.io/address/0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e

// vtx -> wavax -> usdc
let reward1ToWantRoute = [
  '0xe6E7e03b60c0F8DaAE5Db98B03831610A60FfE1B',
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  want,
]

// ptp -> wavax -> usdc
let reward2ToWantRoute = [
  '0x22d4002028f537599bE9f666d1c4Fa138522f9c8',
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  want,
]

let poolHelper = '0x994F0e36ceB953105D05897537BF55d201245156'

let strategyContractName = 'StrategyPlatypusVector'
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3'
let accessManager = '0x3F93ECed5AD8185f1c197acd17f8a2eB06051365'
let owner = '0xd51062A4aF7B76ee0b2893Ef8b52aCC155393E3D'

let needDeploy = true
let verifyVault = ''
let verifyStrategy = ''

async function main() {
  let vault
  let strategy

  if (needDeploy) {
    let vaultFactory = await ethers.getContractFactory('VaultV2Avax')
    vault = await vaultFactory.deploy(want, accessManager)
    await vault.deployed()
    console.log(`Vault deployed to: ${vault.address}`)

    let strategyFactory = await ethers.getContractFactory(strategyContractName)
    strategy = await strategyFactory.deploy(
      vault.address,
      accessManager,
      poolHelper,
      reward1ToWantRoute,
      reward2ToWantRoute
    )
    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await vault.setupStrat(strategy.address)
    await strategy.setPerformanceTreasury(treasury)
    await strategy.setWithdrawalTreasury(treasury)
    await strategy.setHarvestOnDeposit(false)
    await strategy.transferOwnership(owner)
  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
  }

  let vaultParams = {
    want: want,
    accessManager: accessManager,
  }
  let vaultVerificationArgs = {
    address: vault.address,
    constructorArguments: Object.values(vaultParams),
  }
  await run('verify:verify', vaultVerificationArgs)

  let strategyParams = {
    vault: vault.address,
    accessManager: accessManager,
    poolHelper: poolHelper,
    reward1ToWantRoute: reward1ToWantRoute,
    reward2ToWantRoute: reward2ToWantRoute,
  }
  let strategyVerificationArgs = {
    address: strategy.address,
    constructorArguments: Object.values(strategyParams),
  }
  await run('verify:verify', strategyVerificationArgs)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
