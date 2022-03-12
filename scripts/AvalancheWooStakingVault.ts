// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import {ethers, run} from "hardhat";


let needDeploy = false
let verifyContract = '0xcd1B9810872aeC66d450c761E93638FB9FE09DB0'

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  let wooStakingVault

  let avalancheWoo = '0xaBC9547B534519fF73921b1FBA6E672b5f58D083'
  let treasury = '0x4094D7A17a387795838c7aba4687387B0d32BCf3'
  let accessManager = '0x3F93ECed5AD8185f1c197acd17f8a2eB06051365'

  let constructorParams = [avalancheWoo, treasury, accessManager]

  // We get the contract to deploy
  if (needDeploy) {
    let wooStakingVaultFactory = await ethers.getContractFactory("WooStakingVault");
    wooStakingVault = await wooStakingVaultFactory.deploy(...constructorParams);
    await wooStakingVault.deployed();
    console.log("Avalanche WooStakingVault:\n",wooStakingVault.address);
  } else {
    wooStakingVault = {address: verifyContract}
  }

  await run("verify:verify", {
    address: wooStakingVault.address,
    constructorArguments: constructorParams
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
