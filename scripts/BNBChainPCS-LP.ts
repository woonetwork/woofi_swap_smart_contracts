import { ethers, run } from 'hardhat'

// CAKE-BNB 0x0eD7e52944161450477ee417DE9Cd3a859b14fD0
// ETH-BNB 0x74E4716E431f45807DCF19f284c7aA99F18a4fbc
// BTC-BNB 0x61EB789d75A95CAa3fF50ed7E47b96c132fEc082
// WOO-BNB 0x89eE0491CE55d2f7472A97602a95426216167189
let want = '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0'
// CAKE-BNB 2
// ETH-BNB 10
// BTC-BNB 11
// WOO-BNB 45
let pid = 2
let rewardToLP0Route = ['0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82']
let rewardToLP1Route = ['0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c']
let weth = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'

let wooAccessManager = '0xa9eDb6F411e49358B515dE26543815770a739FB0'
let strategyContractName = 'StrategyLPV2'
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3'

let needDeploy = true
let verifyVault = '0x679c182E4A82aae03dd9d24418D361b4d8A726E6'
let verifyStrategy = '0x3009e81E6CEb4c882079c6256Bc2C85A738c9e7C'

async function main() {
  let vault
  let strategy

  let vaultParams = [weth, want, wooAccessManager]
  let strategyParams = [verifyVault, wooAccessManager, pid, rewardToLP0Route, rewardToLP1Route]

  if (needDeploy) {
    let vaultFactory = await ethers.getContractFactory('WOOFiVaultV2')
    vault = await vaultFactory.deploy(...vaultParams)
    await vault.deployed()
    console.log(`Vault deployed to: ${vault.address}`)
    strategyParams[0] = vault.address

    let strategyFactory = await ethers.getContractFactory(strategyContractName)
    strategy = await strategyFactory.deploy(...strategyParams)
    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await vault.setupStrat(strategy.address)
    await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    await strategy.transferOwnership('0xea02DCC6fe3eC1F2a433fF8718677556a3bb3618')
  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
  }

  await run('verify:verify', {
    address: vault.address,
    constructorArguments: vaultParams,
  })

  await run('verify:verify', {
    address: strategy.address,
    constructorArguments: strategyParams,
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
