// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import '../interfaces/IVaultAggregator.sol';

contract VaultAggregator is OwnableUpgradeable, IVaultAggregator {
    /* ----- Initializer ----- */

    function initialize() external initializer {
        __Ownable_init();
    }

    /* ----- View Functions ----- */

    function getVaultInfos(address user, address[] memory vaults)
        public
        view
        override
        returns (VaultInfos memory vaultInfos)
    {
        vaultInfos.balances = getBalances(user, vaults);
        vaultInfos.sharePrices = getSharePrices(vaults);
        vaultInfos.costSharePrices = getCostSharePrices(user, vaults);
        return vaultInfos;
    }

    function getBalances(address user, address[] memory vaults)
        public
        view
        override
        returns (uint256[] memory results)
    {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVault(vaults[i]).balanceOf(user);
        }
        return results;
    }

    function getSharePrices(address[] memory vaults) public view override returns (uint256[] memory results) {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVault(vaults[i]).getPricePerFullShare();
        }
        return results;
    }

    function getCostSharePrices(address user, address[] memory vaults)
        public
        view
        override
        returns (uint256[] memory results)
    {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVault(vaults[i]).costSharePrice(user);
        }
        return results;
    }
}
