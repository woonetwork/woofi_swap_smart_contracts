import { ethers } from 'hardhat'
import { use } from 'chai'
import { deployContract, deployMockContract, solidity } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { VaultAggregator } from '../typechain'

import VaultAggregatorArtifact from '../artifacts/contracts/earn/VaultAggregator.sol/VaultAggregator.json'
import WOOFiVaultV2Artifact from '../artifacts/contracts/earn/VaultV2.sol/WOOFiVaultV2.json'
import { Contract } from 'ethers'

use(solidity)

describe('VaultAggregator.sol', () => {
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let vaultAggregator: VaultAggregator;
    let vaults: Contract[] = [];
    let vaultAddresses: string[] = [];

    before(async() => {
        [owner, user] = await ethers.getSigners();
        console.log(user.address);

        // Deploy VaultAggregator Contract
        vaultAggregator = await deployContract(owner, VaultAggregatorArtifact, []) as VaultAggregator;
        console.log(await vaultAggregator.owner());

        // Deploy Vault Contract
        let deployVaultCount = 5;
        for (let i = 0; i < deployVaultCount; i++) {
            let vault = await deployMockContract(owner, WOOFiVaultV2Artifact.abi);
            await vault.mock.balanceOf.returns(i);
            await vault.mock.getPricePerFullShare.returns(i);
            await vault.mock.costSharePrice.returns(i);
            vaults.push(vault);
            vaultAddresses.push(vault.address);
        }
    });

    it('Check VaultAggregator costSharePrice', async () => {
        console.log('start');
        let iterationGet: Number[] = [];
        for (let i = 0; i < vaults.length; i++) {
            let cost = await vaults[i].costSharePrice(user.address);
            iterationGet.push(cost.toNumber());
        }
        console.log(iterationGet);

        let bnCosts = await vaultAggregator.getCostSharePrices(user.address, vaultAddresses);
        let batchGet: Number[] = [];
        for (let i = 0; i < bnCosts.length; i++) {
            batchGet.push(bnCosts[i].toNumber());
        }
        console.log(batchGet);
    });

    it('Get vaultInfos', async () => {
        let results = await vaultAggregator.getVaultInfos(user.address, vaultAddresses);
        console.log(results);
    });
});
