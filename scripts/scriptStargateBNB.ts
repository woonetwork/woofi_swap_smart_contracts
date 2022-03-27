import { ethers, run } from 'hardhat'

let want = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' // busd on bsc

let vaultContractName = 'WOOFiVaultV2'
let strategyContractName = 'StratStargateStableCompound'

let accessManager = '0xa9eDb6F411e49358B515dE26543815770a739FB0' // bsc access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury
let weth = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // wbnb

let uniRouter = '0x10ED43C718714eb63d5aA57B78B54704E256024E' // pancake
let pool = '0x98a5737749490856b401DB5Dc27F522fC314A4e1'     // S*BUSD
let staking = '0x3052A0F6ab15b4AE1df39962d5DdEFacA86DaB47'  // LPStaking
let stakingPid = 1; // S*BUSD
let reward = '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b'
let rewardToWantRoute = ["0xB0D502E938ed5f4df2E681fE6E419ff29631d62b", "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"]

let needDeploy = false
let verifyVault = '0xA1436ADa35e593d2376DDE8e2678D3E88714171c'
let verifyStrategy = '0xb4E4378C3D0B0B8E49682Db38912080e5873aF53'

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
    strategy = await strategyFactory.deploy(
      vault.address,
      accessManager,
      uniRouter,
      pool,
      staking,
      stakingPid,
      reward,
      rewardToWantRoute)

    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await vault.setupStrat(strategy.address)
    console.log(`Vault setup strat successfully.`)

    await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    console.log(`Set ownership to WooAdmin.`)

    await strategy.setHarvestOnDeposit(false)
    console.log(`Set harvestOnDeposit to false.`)

    await strategy.transferOwnership('0xea02DCC6fe3eC1F2a433fF8718677556a3bb3618')
    console.log(`Set ownership to Yifan.`)
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
    _vault: vault.address,
    _accessManager: accessManager,
    _uniRouter: uniRouter,
    _pool: pool,
    _staking: staking,
    _stakingPid: stakingPid,
    _reward: reward,
    _rewardToWantRoute: rewardToWantRoute
  }
  let strategyVerificationArgs = {
    address: strategy.address,
    constructorArguments: Object.values(strategyParams),
  }
  // await run('verify:verify', strategyVerificationArgs)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
