// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IBank {
    function exchangeRateStored() external view returns (uint256);
}
