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

let needDeploy = true
let verifyRouter = ''

let wooPP = '0x9503E7517D3C5bc4f9E4A1c6AE4f8B33AC2546f2'

async function main() {
  let router

  if (needDeploy) {
    let factory = await ethers.getContractFactory('WooRouterV2')
    router = await factory.deploy(weth, wooPP)
    await router.deployed()
    console.log(`WooRouter deployed to: ${router.address}`)
    // vault = {address: '0x7a21D2C3B4e36b8343d16393771F3824119E6acF'}

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.deployed()
    // console.log(`Strategy deployed to: ${strategy.address}`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.setHarvestOnDeposit(false)
    // console.log(`Set harvestOnDeposit to false.`)

    // await new Promise((_) => setTimeout(_, 3000))
    // await strategy.transferOwnership('0xea02DCC6fe3eC1F2a433fF8718677556a3bb3618')
    // console.log(`Set ownership to Yifan.`)
  } else {
    router = { address: verifyRouter }
    // strategy = { address: verifyStrategy }
    // await strategy.setPerformanceTreasury(treasury);
    // await strategy.setWithdrawalTreasury(treasury)
    // await strategy.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
    // await vault.transferOwnership('0x7C8A5d20b22Ce9b369C043A3E0091b5575B732d9')
  }

  let routerParams = [weth, wooPP]
  let routerVerificationArgs = {
    address: router.address,
    constructorArguments: routerParams,
  }
  await run('verify:verify', routerVerificationArgs)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
