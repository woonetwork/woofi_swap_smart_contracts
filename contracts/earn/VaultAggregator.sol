// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import '../interfaces/IVaultAggregator.sol';

contract VaultAggregator is OwnableUpgradeable, IVaultAggregator {
    /* ----- Initializer ----- */

    function initialize() external initializer {
        __Ownable_init();
    }

    /* ----- View Functions ----- */

    function infos(
        address user,
        address[] memory vaults,
        address[] memory tokens
    ) public view override returns (VaultInfos memory vaultInfos, TokenInfos memory tokenInfos) {
        vaultInfos.balancesOf = balancesOf(user, vaults);
        vaultInfos.sharePrices = sharePrices(vaults);
        vaultInfos.costSharePrices = costSharePrices(user, vaults);

        tokenInfos.nativeBalance = user.balance;
        tokenInfos.balancesOf = balancesOf(user, tokens);
        return (vaultInfos, tokenInfos);
    }

    function balancesOf(address user, address[] memory tokens) public view override returns (uint256[] memory results) {
        results = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            results[i] = IERC20(tokens[i]).balanceOf(user);
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
