import { ethers, run } from 'hardhat'

let needDeploy = false // Change to false when finished deployment.
let verifyVault = ''
let verifyStrategy = ''
// let verifyVault = '0xba91ffd8a2b9f68231eca6af51623b3433a89b13'
// let verifyStrategy = '0xf702c1ed55690fc16d28e0229e67ed1da804ee61'

// Use class name as contract name
let vaultContract = 'WOOFiVaultV2'
let strategyContract = 'StrategyTraderJoeDualLP'

// PTP-AVAX LP token address
let weth = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
let want = '0xcdfd91eea657cc2701117fe9711c9a4f61feed23'
// WooAccessManager contract address
let accessManager = '0x3f93eced5ad8185f1c197acd17f8a2eb06051365'

// trader joe masterchef farm id
let pid = 28
// reward: JOE token need be changed to PTP/AVAX. PTP-AVAX LP Pool have two routes
// Sell half JOE to PTP. And another half JOE to AVAX. Then add two tokens to the pool.
let rewardToLP0Route = [
  '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd',
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  '0x22d4002028f537599bE9f666d1c4Fa138522f9c8',
]
let rewardToLP1Route = ['0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7']
// secondReward: PTP token need be changed to PTP/AVAX.
// PTP-AVAX LP have two routes. PTP is one token for this LP. Only need changed half PTP to AVAX.
let secondRewardToLP0Route = ['0x22d4002028f537599bE9f666d1c4Fa138522f9c8']
let secondRewardToLP1Route = [
  '0x22d4002028f537599bE9f666d1c4Fa138522f9c8',
  '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
]

// harvest fee treasury
let treasury = '0x4094d7a17a387795838c7aba4687387b0d32bcf3' // woo_earn_treasury

// npx hardhat run --network avax_mainnet scripts/StrategyTraderJoe.ts
async function main() {
  let vaultConstructorParams = [weth, want, accessManager]
  let strategyConstructorParams = [
    verifyVault,
    accessManager,
    pid,
    rewardToLP0Route,
    rewardToLP1Route,
    secondRewardToLP0Route,
    secondRewardToLP1Route,
  ]

  let vault
  let strategy
  if (needDeploy) {
    // deploy Vault
    let vaultFactory = await ethers.getContractFactory(vaultContract)
    vault = await vaultFactory.deploy(...vaultConstructorParams)
    await vault.deployed()

    delay(5000) // sleep 5 second, will `error: network no bytecode` if no sleep

    // deploy Strategy
    strategyConstructorParams[0] = vault.address
    // strategyConstructorParams[0] = "0xba91ffd8a2b9f68231eca6af51623b3433a89b13"
    let strategyFactory = await ethers.getContractFactory(strategyContract)
    strategy = await strategyFactory.deploy(...strategyConstructorParams)
    await strategy.deployed()

    delay(5000) // sleep 5 second, will `error: network no bytecode` if no sleep

    // set
    await vault.setupStrat(strategy.address)
    await strategy.setPerformanceTreasury(treasury)
    await strategy.setWithdrawalTreasury(treasury)
  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
  }

  // verify
  await run('verify:verify', {
    address: vault.address,
    constructorArguments: vaultConstructorParams,
  })

  await run('verify:verify', {
    address: strategy.address,
    // address: verifyStrategy,
    constructorArguments: strategyConstructorParams,
  })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
