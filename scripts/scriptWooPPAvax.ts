import { ethers, run } from 'hardhat'

let accessManager = '0x3F93ECed5AD8185f1c197acd17f8a2eB06051365' // avalanche access manager
let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3' // woo_earn_treasury

let weth = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' // wavax
let woo = '0xaBC9547B534519fF73921b1FBA6E672b5f58D083' // woo
let quote = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' // usdc

let needDeploy = true
let verifyRouter = ''

let wooPP = ''

async function main() {
  let

  if (needDeploy) {
    let factory = await ethers.getContractFactory('WooRebateManager')
    router = await factory.deploy(quote, woo, accessManager)
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
