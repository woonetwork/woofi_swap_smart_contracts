// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

interface IVaultInfo {
    function costSharePrice(address) external view returns (uint256);

    function getPricePerFullShare() external view returns (uint256);

    function balanceOf(address) external view returns (uint256);
}

interface IVaultAggregator {
    /* ----- Struct ----- */

    struct VaultInfos {
        uint256[] balancesOf;
        uint256[] sharePrices;
        uint256[] costSharePrices;
    }

    struct TokenInfos {
        uint256[] balancesOf;
    }

    /* ----- View Functions ----- */

    function infos(address user, address[] memory vaults, address[] memory tokens) external view returns (VaultInfos memory vaultInfos, TokenInfos memory tokenInfos);

    function balancesOf(address user, address[] memory vaults) external view returns (uint256[] memory results);

    function sharePrices(address[] memory vaults) external view returns (uint256[] memory results);

    function costSharePrices(address user, address[] memory vaults) external view returns (uint256[] memory results);
}
