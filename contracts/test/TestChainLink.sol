// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import '../interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract TestChainLink is AggregatorV3Interface, Ownable {
    function decimals() external view override returns (uint8) {
        return 8;
    }

    function description() external view override returns (string memory) {
        return 'BTC / USD';
    }

    function version() external view override returns (uint256) {
        return 1;
    }

    /// getRoundData and latestRoundData should both raise "No data present"
    /// if they do not have data to report, instead of returning unset values
    /// which could be misinterpreted as actual reported values.
    function getRoundData(uint80 /*_roundId*/)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (36893488147419375519, 2119577093131, 1661310103, 1661310103, 36893488147419375519);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (36893488147419375519, 2119577093131, 1661310103, 1661310103, 36893488147419375519);
    }
}

contract TestQuoteChainLink is AggregatorV3Interface, Ownable {
    function decimals() external view override returns (uint8) {
        return 8;
    }

    function description() external view override returns (string memory) {
        return 'USDT / USD';
    }

    function version() external view override returns (uint256) {
        return 1;
    }

    /// getRoundData and latestRoundData should both raise "No data present"
    /// if they do not have data to report, instead of returning unset values
    /// which could be misinterpreted as actual reported values.
    function getRoundData(uint80 /*_roundId*/)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (36893488147419109665, 99994997, 1661309776, 1661309776, 36893488147419109665);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (36893488147419109665, 99994997, 1661309776, 1661309776, 36893488147419109665);
    }
}
