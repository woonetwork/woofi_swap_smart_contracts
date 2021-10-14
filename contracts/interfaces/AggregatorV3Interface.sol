// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

interface AggregatorV3Interface {
    /// @dev TODO
    /// @return TODO
    function decimals() external view returns (uint8);

    /// @dev TODO
    /// @return TODO
    function description() external view returns (string memory);

    /// @dev TODO
    /// @return TODO
    function version() external view returns (uint256);

    /// @dev TODO
    /// @param _roundId TODO
    /// @return roundId TODO
    /// @return answer TODO
    /// @return startedAt TODO
    /// @return updatedAt TODO
    /// @return answeredInRound TODO
    /// getRoundData and latestRoundData should both raise "No data present"
    /// if they do not have data to report, instead of returning unset values
    /// which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    /// @dev TODO
    /// @return roundId TODO
    /// @return answer TODO
    /// @return startedAt TODO
    /// @return updatedAt TODO
    /// @return answeredInRound TODO
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
