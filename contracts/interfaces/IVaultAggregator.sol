// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

interface IVaultInfo {
    function costSharePrice(address) external view returns (uint256);

    function getPricePerFullShare() external view returns (uint256);
}

interface IMasterChefWooInfo {
    function userInfo(uint256, address) external view returns (uint256, uint256);

    function pendingXWoo(uint256, address) external view returns (uint256, uint256);

    function pendingReward(uint256, address) external view returns (uint256, uint256);
}

interface IVaultAggregator {
    /* ----- Struct ----- */

    struct VaultInfos {
        uint256[] balancesOf;
        uint256[] sharePrices;
        uint256[] costSharePrices;
    }

    struct TokenInfos {
        uint256 nativeBalance;
        uint256[] balancesOf;
    }

    struct MasterChefWooInfos {
        uint256[] amounts;
        uint256[] rewardDebts;
        uint256[] pendingXWooAmounts;
        uint256[] pendingWooAmounts;
    }

    /* ----- View Functions ----- */

    function infos(
        address user,
        address masterChefWoo,
        address[] memory vaults,
        address[] memory tokens,
        uint256[] memory pids
    )
        external
        view
        returns (
            VaultInfos memory vaultInfos,
            TokenInfos memory tokenInfos,
            MasterChefWooInfos memory masterChefWooInfos
        );

    function balancesOf(address user, address[] memory tokens) external view returns (uint256[] memory results);

    function sharePrices(address[] memory vaults) external view returns (uint256[] memory results);

    function costSharePrices(address user, address[] memory vaults) external view returns (uint256[] memory results);

    function userInfos(
        address user,
        address masterChefWoo,
        uint256[] memory pids
    ) external view returns (uint256[] memory amounts, uint256[] memory rewardDebts);

    function pendingXWoos(
        address user,
        address masterChefWoo,
        uint256[] memory pids
    ) external view returns (uint256[] memory pendingXWooAmounts, uint256[] memory pendingWooAmounts);
}
