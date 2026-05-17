import { ethers, run, upgrades } from 'hardhat'

let firstImpl = true // will be upgraded when equal to `false`

let proxy = '0xaaCf2201198c8bF5f2dcd5a187754b4cb9cD9198'
let proxyAdmin = '0xb83e58090cDa34160366e36E41Ea7ACD609B3fE3'
let impl = '0xC7F6Fc03539FBf6Fa79270edA7d79375c65028dD'

async function main() {
  if (firstImpl) {
    let vaultAggregatorFactory = await ethers.getContractFactory('VaultAggregator')
    let vaultAggregator = await upgrades.deployProxy(vaultAggregatorFactory)

    await vaultAggregator.deployed()
    let proxyAddress = vaultAggregator.address
    let implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
    let adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress)

    console.log('Proxy deployed to:', proxyAddress)
    console.log('Implementation deployed to:', implAddress)
    console.log('ProxyAdmin deployed to:', adminAddress)

    await run('verify:verify', { address: implAddress })
  } else {
    let vaultAggregatorFactory = await ethers.getContractFactory('VaultAggregator')
    // Can't call initialize twice
    await upgrades.upgradeProxy(proxy, vaultAggregatorFactory)

    await new Promise((resolve) => setTimeout(resolve, 10000))

    let implAddress = await upgrades.erc1967.getImplementationAddress(proxy)
    console.log('Implementation deployed to:', implAddress)
    // await run('verify:verify', {address: proxyAdmin});
    await run('verify:verify', { address: implAddress })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
