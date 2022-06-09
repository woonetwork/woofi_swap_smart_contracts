import { ethers, run, upgrades } from 'hardhat'

let firstDeploy = false // will be upgrade implementation when equal to `false` and impl contract code updated.

const proxy = '0xFB9311af76C4fb11E0e91fE00B7652c0F17A4774'

// For record contract address only, or verify contract if nobody verify on chain before.
const proxyAdmin = '0xb83e58090cDa34160366e36E41Ea7ACD609B3fE3'
// For record contract address only, or verify contract.
const impl = '0xffD63b06985D1e95a53C56993312dCca2446B624'

const contractName = 'WooCrossChainRouter'

// Constructor Parameters
const weth = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'
const wooPool = '0x9503E7517D3C5bc4f9E4A1c6AE4f8B33AC2546f2'
const stargateRouter = '0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6'

async function main() {
  const params = [weth, wooPool, stargateRouter]

  const factory = await ethers.getContractFactory(contractName)
  if (firstDeploy) {
    const proxyContract = await upgrades.deployProxy(factory, params)
    await proxyContract.deployed()

    const proxyAddress = proxyContract.address
    const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
    const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress)

    console.log('Proxy deployed to:', proxyAddress)
    console.log('Implementation deployed to:', implAddress)
    console.log('ProxyAdmin deployed to:', adminAddress)

    await run('verify:verify', { address: implAddress })
  } else {
    await upgrades.upgradeProxy(proxy, factory) // Set `proxy` above after first deployed.

    const implAddress = await upgrades.erc1967.getImplementationAddress(proxy)
    console.log('Implementation deployed to:', implAddress)

    await new Promise((_) => setTimeout(_, 3000))
    // await run('verify:verify', {address: proxyAdmin});
    await run('verify:verify', { address: implAddress })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
