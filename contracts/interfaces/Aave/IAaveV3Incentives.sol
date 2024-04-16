// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IAaveV3Incentives {
    function getUserRewards(
        address[] calldata assets,
        address user,
        address reward
    ) external view returns (uint256);

    /**
     * @dev Returns the list of available reward addresses
     * @return List of rewards supported in this contract
     **/
    function getRewardsList() external view returns (address[] memory);

    /**
     * @dev Claims reward for a user to the desired address, on all the assets of the pool, accumulating the pending rewards
     * @param assets List of assets to check eligible distributions before claiming rewards
     * @param amount The amount of rewards to claim
     * @param to The address that will be receiving the rewards
     * @param reward The address of the reward token
     * @return The amount of rewards claimed
     **/
    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to,
        address reward
    ) external returns (uint256);
        
    /**
     * @dev Claims all rewards for a user to the desired address, on all the assets of the pool, accumulating the pending rewards
     * @param assets The list of assets to check eligible distributions before claiming rewards
     * @param to The address that will be receiving the rewards
     * @return rewardsList List of addresses of the reward tokens
     * @return claimedAmounts List that contains the claimed amount per reward, following same order as "rewardList"
     **/
    function claimAllRewards(
        address[] calldata assets,
        address to
    ) external returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}
