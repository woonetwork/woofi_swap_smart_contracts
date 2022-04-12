import { ethers, run } from 'hardhat'

let want = '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd'

let vaultContractName = 'WOOFiVaultV2'
let strategyContractName = 'StrategySJoe'

let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3'
let accessManager = '0x3F93ECed5AD8185f1c197acd17f8a2eB06051365'
let weth = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' // wavax
// let owner = '0xd51062A4aF7B76ee0b2893Ef8b52aCC155393E3D'

let needDeploy = true
let verifyVault = ''
let verifyStrategy = ''

async function main() {
  let vault
  let strategy

  if (needDeploy) {
    let vaultFactory = await ethers.getContractFactory(vaultContractName)
    vault = await vaultFactory.deploy(weth, want, accessManager)
    await vault.deployed()
    console.log(`Vault deployed to: ${vault.address}`)

    await new Promise((_) => setTimeout(_, 3000))

    // let strategyFactory = await ethers.getContractFactory(strategyContractName)
    // strategy = await strategyFactory.deploy(
    //   vault.address,
    //   accessManager,
    // )
    // await strategy.deployed()
    // console.log(`Strategy deployed to: ${strategy.address}`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await vault.setupStrat(strategy.address)
    // console.log(`Vault set up strat succeeded`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.setPerformanceTreasury(treasury)
    // console.log(`Perf treasury setup succeeded.`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.setWithdrawalTreasury(treasury)
    // console.log(`Withdraw treasury setup succeeded.`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.setHarvestOnDeposit(false)
    // console.log(`Harvest on deposit setup to false`)

  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
  }

  let vaultParams = [
    weth, want, accessManager
  ]
  let vaultVerificationArgs = {
    address: vault.address,
    constructorArguments: vaultParams,
  }
  await run('verify:verify', vaultVerificationArgs)

  // await new Promise((_) => setTimeout(_, 3000))

  // let strategyParams = [vault.address, accessManager]
  // let strategyVerificationArgs = {
  //   address: strategy.address,
  //   constructorArguments: strategyParams,
  // }
  // await run('verify:verify', strategyVerificationArgs)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
