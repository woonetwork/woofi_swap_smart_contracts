// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IComptroller {
    function claimComp(address holder, address[] calldata _iTokens) external;

    function claimComp(address holder) external;

    function compAccrued(address holder) external view returns (uint256 comp);

    function enterMarkets(address[] memory _iTokens) external;

    function pendingComptrollerImplementation() external view returns (address implementation);

    function pendingImplementation() external view returns (address implementation);

    function claimReward(uint8 rewardType, address holder) external;
}
