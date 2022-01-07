// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IController {
    function earn(address, uint256) external;
    function withdraw(address, uint256) external;
    function vaults(address) external view returns (address);
    function strategies(address) external view returns (address);
    function balanceOf(address) external view returns (uint256);
    function rewards() external view returns (address);
}
