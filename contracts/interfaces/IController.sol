// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IController {
    function earn(address want, uint256 amount) external;

    function withdraw(address want, uint256 amount) external;

    function vaults(address want) external view returns (address);

    function strategies(address want) external view returns (address);

    function balanceOf(address want) external view returns (uint256);

    function rewardRecipient() external view returns (address);
}
