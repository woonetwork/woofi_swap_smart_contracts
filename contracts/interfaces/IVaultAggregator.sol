// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

interface IVault {
    function costSharePrice(address) external view returns (uint256);
    function getPricePerFullShare() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
}

interface IVaultAggregator {

    /* ----- Struct ----- */

    struct VaultInfos {
        uint256[] balances;
        uint256[] sharePrices;
        uint256[] costSharePrices;
    }

    /* ----- View Functions ----- */

    function getVaultInfos(address user, address[] memory vaults) external view returns (VaultInfos memory vaultInfos);
    function getBalances(address user, address[] memory vaults) external view returns (uint256[] memory results);
    function getSharePrices(address[] memory vaults) external view returns (uint256[] memory results);
    function getCostSharePrices(address user, address[] memory vaults) external view returns (uint256[] memory results);
}
