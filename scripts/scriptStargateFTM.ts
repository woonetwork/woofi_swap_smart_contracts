import { ethers, run } from 'hardhat'

let want = '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75' // USDC

let vaultContractName = 'WOOFiVaultV2'
let strategyContractName = 'StratStargateStableCompound'

let accessManager = '0xd6d6A0828a80E1832cD4C3585aDED8971087fCb8' // ftm access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury
let weth = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83' // wftm

let uniRouter = '0xF491e7B69E4244ad4002BC14e878a34207E38c29' // Spookyswap Router
let pool = '0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97' // S*USDC on ftm
let staking = '0x224D8Fd7aB6AD4c6eb4611Ce56EF35Dec2277F03' // LPStaking on ftm
let stakingPid = 0 // S*USDC on ftm
let reward = '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
let rewardToWantRoute = ['0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590', '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75']

let needDeploy = false
let verifyVault = '0xFCE921ac02999E701BdE7e697b0EF64F2Da115dB'
let verifyStrategy = '0xe1BBfeC2b76D2c5B899407bB9Ad3CC501A8aC1b7'

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
      rewardToWantRoute
    )

    await new Promise((_) => setTimeout(_, 3000))
    await strategy.deployed()
    console.log(`Strategy deployed to: ${strategy.address}`)

    await new Promise((_) => setTimeout(_, 3000))
    await vault.setupStrat(strategy.address)
    console.log(`Vault setup strat successfully.`)

    await new Promise((_) => setTimeout(_, 3000))
    await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    console.log(`Set ownership to WooAdmin.`)

    await new Promise((_) => setTimeout(_, 3000))
    await strategy.setHarvestOnDeposit(false)
    console.log(`Set harvestOnDeposit to false.`)

    await new Promise((_) => setTimeout(_, 3000))
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
  // await run('verify:verify', vaultVerificationArgs)

  let strategyParams = {
    _vault: vault.address,
    _accessManager: accessManager,
    _uniRouter: uniRouter,
    _pool: pool,
    _staking: staking,
    _stakingPid: stakingPid,
    _reward: reward,
    _rewardToWantRoute: rewardToWantRoute,
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
