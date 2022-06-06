import { ethers, run } from 'hardhat'

let want = '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75' // USDC

let vaultContractName = 'WOOFiVaultV2'
let strategyContractName = 'StratStargateStableCompound'

let accessManager = '0xd6d6A0828a80E1832cD4C3585aDED8971087fCb8' // ftm access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury

let uniRouter = '0xF491e7B69E4244ad4002BC14e878a34207E38c29' // Spookyswap Router
let pool = '0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97' // S*USDC on ftm
let staking = '0x224D8Fd7aB6AD4c6eb4611Ce56EF35Dec2277F03' // LPStaking on ftm
let stakingPid = 0 // S*USDC on ftm
let reward = '0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590'
let rewardToWantRoute = ['0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590', '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75']

let needDeploy = true
let verifyRouter = ''
// let verifyRouter = '0x53D2728A6cCeB9f025Eb22C41c1d6406Fa04D8DE'     // BSC woo cross router

// --- BSC --- //
let weth = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // wbnb
let wooPP = '0xbf365Ce9cFcb2d5855521985E351bA3bcf77FD3F' // bsc wooPP
let stargateRouter = '0x4a364f8c717cAAD9A442737Eb7b8A55cc6cf18D8' // bsc stargate router

// --- Avalanche --- //
// let weth = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'           // wavax
// let wooPP = '0xF8cE0D043891b62c55380fB1EFBfB4F186153D96'          // avax wooPP
// let stargateRouter = '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd' // avax stargate router

async function main() {
  let router

  if (needDeploy) {
    let factory = await ethers.getContractFactory('WooCrossChainRouter')
    router = await factory.deploy()
    await router.deployed()
    console.log(`WooCrossChainRouter deployed to: ${router.address}`)
    // vault = {address: '0x7a21D2C3B4e36b8343d16393771F3824119E6acF'}

    await new Promise((_) => setTimeout(_, 3000))
    await router.init(weth, wooPP, stargateRouter)
    console.log(`WooCrossChainRouter inited`)

    // Setup testnet stargate routers
    // await new Promise((_) => setTimeout(_, 3000))
    // // https://stargateprotocol.gitbook.io/stargate/developers/contract-addresses/testnet
    // await router.setChainRouter(10001, '0x82A0F5F531F9ce0df1DF5619f74a0d3fA31FF561')
    // await new Promise((_) => setTimeout(_, 1000))
    // await router.setChainRouter(10002, '0xbB0f1be1E9CE9cB27EA5b0c3a85B7cc3381d8176')
    // await new Promise((_) => setTimeout(_, 1000))
    // await router.setChainRouter(10006, '0x13093E05Eb890dfA6DacecBdE51d24DabAb2Faa1')
    // await new Promise((_) => setTimeout(_, 1000))
    // await router.setChainRouter(10012, '0xa73b0a56B29aD790595763e71505FCa2c1abb77f')
    // console.log(`setChainRouter done.`)

    // Setup mainnet stargate routers
    // await new Promise((_) => setTimeout(_, 3000))
    // https://stargateprotocol.gitbook.io/stargate/developers/contract-addresses/testnet
    // await router.setChainRouter(1, '0x8731d54E9D02c286767d56ac03e8037C07e01e98')
    // await new Promise((_) => setTimeout(_, 1000))
    // await router.setChainRouter(2, '0x53D2728A6cCeB9f025Eb22C41c1d6406Fa04D8DE') // bsc wooCrossChainRouter
    // await new Promise((_) => setTimeout(_, 1000))
    // await router.setChainRouter(6, '0x7Fc9cf49f6A249878b886f0943E179a9cB2Af6Fc') // avax wooCrossChainRouter
    // console.log(`setChainRouter done.`)

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

  let routerParams = []
  let routerVerificationArgs = {
    address: router.address,
    constructorArguments: [],
  }
  await run('verify:verify', routerVerificationArgs)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
