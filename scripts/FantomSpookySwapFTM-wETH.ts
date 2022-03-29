import { ethers, run } from 'hardhat'

let weth = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'
let eth = '0x74b23882a30290451A17c44f4F05243b6b58C76d'
let want = '0xf0702249F4D3A25cD3DED7859a165693685Ab577'
let reward = '0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE'

let reward1ToWantRoute = [reward, weth]
let reward2ToWantRoute = [reward, weth, eth]
let pid = 5

let strategyContractName = 'StrategySpookySwapLP'
let harvestOnDeposit = false
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3'
let accessManager = '0xd6d6A0828a80E1832cD4C3585aDED8971087fCb8'
let owner = '0xea02DCC6fe3eC1F2a433fF8718677556a3bb3618'

let needDeploy = true
let verifyVault = '0xf60d272945c870E8dbFD02Bf0339D5650646115d'
let verifyStrategy = '0x2fb089Be0df198c1B1eaC88500a09a1175d3a547'

async function main() {
  let vault
  let strategy

  let vaultConstructorParams = [weth, want, accessManager]
  let strategyConstructorParams = [
      verifyVault,
      accessManager,
      pid,
      reward1ToWantRoute,
      reward2ToWantRoute
  ]

  if (needDeploy) {
    let vaultFactory = await ethers.getContractFactory('WOOFiVaultV2')
    vault = await vaultFactory.deploy(...vaultConstructorParams)
    await vault.deployed()
    console.log(`Vault deployed to: ${vault.address}`)

    strategyConstructorParams[0] = vault.address
    let strategyFactory = await ethers.getContractFactory(strategyContractName)
    strategy = await strategyFactory.deploy(...strategyConstructorParams)
    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await vault.setupStrat(strategy.address)
    await delay(5000)
    await strategy.setPerformanceTreasury(treasury)
    await delay(5000)
    await strategy.setWithdrawalTreasury(treasury)
    await delay(5000)
    await strategy.setHarvestOnDeposit(harvestOnDeposit)
    await delay(5000)
    await strategy.transferOwnership(owner)
  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
  }

  await run('verify:verify', {
    address: vault.address,
    constructorArguments: vaultConstructorParams
  })

  await run('verify:verify', {
    address: strategy.address,
    constructorArguments: strategyConstructorParams
  })
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
