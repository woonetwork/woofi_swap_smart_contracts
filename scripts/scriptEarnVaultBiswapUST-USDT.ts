import { ethers, run } from 'hardhat'

let want = '0x9E78183dD68cC81bc330CAF3eF84D354a58303B5' // Biswap UST-BUSD LP
let pid = 18 // masterchef pid

let rewardToLP0Route = [
  // bsw -> wbnb -> busd -> ust
  '0x965F527D9159dCe6288a2219DB51fc6Eef120dD1', // bsw
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // wbnb
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // busd
  '0x23396cF899Ca06c4472205fC903bDB4de249D6fC', // ust
]
let rewardToLP1Route = [
  // bsw -> wbnb -> busd
  '0x965F527D9159dCe6288a2219DB51fc6Eef120dD1', // bsw
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // wbnb
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // busd
]

let vaultContractName = 'WOOFiVaultV2'
let strategyContractName = 'StrategyBiswapLP'

let accessManager = '0xa9eDb6F411e49358B515dE26543815770a739FB0' // bsc access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury
let weth = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // wbnb

let needDeploy = false
let verifyVault = '0xBFDF544F1444E61EE04cAfDabA2b6A68c921F376'
let verifyStrategy = '0xe24A0e4b6BA77aa55bE58Ac4D84Aa14b95121B33'

async function main() {
  let vault
  let strategy

  if (needDeploy) {
    let vaultFactory = await ethers.getContractFactory(vaultContractName)
    vault = await vaultFactory.deploy(weth, want, accessManager)
    await vault.deployed()
    console.log(`Vault deployed to: ${vault.address}`)
    // vault = {address: '0x7a21D2C3B4e36b8343d16393771F3824119E6acF'}

    let strategyFactory = await ethers.getContractFactory(strategyContractName)
    strategy = await strategyFactory.deploy(vault.address, accessManager, pid, rewardToLP0Route, rewardToLP1Route)
    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await vault.setupStrat(strategy.address)
    await strategy.setPerformanceTreasury(treasury)
    await strategy.setWithdrawalTreasury(treasury)
    await strategy.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
  } else {
    vault = { address: verifyVault }
    strategy = { address: verifyStrategy }
    // await strategy.setPerformanceTreasury(treasury);
    // await strategy.setWithdrawalTreasury(treasury)
    // await strategy.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    // await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
  }

  let vaultParams = {
    _weth: weth,
    _want: want,
    _accessManager: accessManager,
  }
  let vaultVerificationArgs = {
    address: vault.address,
    constructorArguments: Object.values(vaultParams),
  }
  await run('verify:verify', vaultVerificationArgs)

  let strategyParams = {
    vault: vault.address,
    accessManager: accessManager,
    pid: pid,
    route0: rewardToLP0Route,
    route1: rewardToLP1Route,
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
