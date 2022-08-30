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

    function vaultInfos(address user, address[] memory vaults)
        public
        view
        override
        returns (VaultInfos memory results)
    {
        results.balancesOf = balancesOf(user, vaults);
        results.sharePrices = sharePrices(vaults);
        results.costSharePrices = costSharePrices(user, vaults);
        return results;
    }

    function balancesOf(address user, address[] memory vaults) public view override returns (uint256[] memory results) {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVaultInfo(vaults[i]).balanceOf(user);
        }
        return results;
    }

    function sharePrices(address[] memory vaults) public view override returns (uint256[] memory results) {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVaultInfo(vaults[i]).getPricePerFullShare();
        }
        return results;
    }

    function costSharePrices(address user, address[] memory vaults)
        public
        view
        override
        returns (uint256[] memory results)
    {
        results = new uint256[](vaults.length);
        for (uint256 i = 0; i < vaults.length; i++) {
            results[i] = IVaultInfo(vaults[i]).costSharePrice(user);
        }
        return results;
    }
}
