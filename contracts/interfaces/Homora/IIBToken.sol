// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IIBToken {
    function balanceOf(address user) external view returns (uint256);

    function deposit() external payable;

    function deposit(uint256 _amount) external;

    function withdraw(uint256 _shares) external;
}
