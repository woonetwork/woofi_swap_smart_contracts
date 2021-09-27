// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;


contract InitializableOwnable {
    address public _OWNER_;
    address public _NEW_OWNER_;
    bool internal _INITIALIZED_;

    // ============ Events ============

    event OwnershipTransferPrepared(address indexed previousOwner, address indexed newOwner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Modifiers ============

    modifier notInitialized() {
        require(!_INITIALIZED_, "INITIALIZED");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _OWNER_, "NOT_OWNER");
        _;
    }

    // ============ Functions ============

    function initOwner(address newOwner) public notInitialized {
        _INITIALIZED_ = true;
        _OWNER_ = newOwner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        emit OwnershipTransferPrepared(_OWNER_, newOwner);
        _NEW_OWNER_ = newOwner;
    }

    function claimOwnership() public {
        require(msg.sender == _NEW_OWNER_, "INVALID_CLAIM");
        emit OwnershipTransferred(_OWNER_, _NEW_OWNER_);
        _OWNER_ = _NEW_OWNER_;
        _NEW_OWNER_ = address(0);
    }
}


/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    function decimals() external view returns (uint8);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

/**
 * @title SafeMath
 *
 * @notice Math operations with safety checks that revert on error
 */
library SafeMath {
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "MUL_ERROR");

        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "DIVIDING_ERROR");
        return a / b;
    }

    function divCeil(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 quotient = div(a, b);
        uint256 remainder = a - quotient * b;
        if (remainder > 0) {
            return quotient + 1;
        } else {
            return quotient;
        }
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SUB_ERROR");
        return a - b;
    }

    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "ADD_ERROR");
        return c;
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = x / 2 + 1;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}


/**
 * @title DecimalMath
 *
 * @notice Functions for fixed point number with 18 decimals
 */
library DecimalMath {
    using SafeMath for uint256;

    uint256 internal constant ONE = 10**18;
    uint256 internal constant TWO = 2*10**18;
    uint256 internal constant ONE2 = 10**36;

    function mulFloor(uint256 target, uint256 d) internal pure returns (uint256) {
        return target.mul(d) / (10**18);
    }

    function mulCeil(uint256 target, uint256 d) internal pure returns (uint256) {
        return target.mul(d).divCeil(10**18);
    }

    function divFloor(uint256 target, uint256 d) internal pure returns (uint256) {
        return target.mul(10**18).div(d);
    }

    function divCeil(uint256 target, uint256 d) internal pure returns (uint256) {
        return target.mul(10**18).divCeil(d);
    }

    function reciprocalFloor(uint256 target) internal pure returns (uint256) {
        return uint256(10**36).div(target);
    }

    function reciprocalCeil(uint256 target) internal pure returns (uint256) {
        return uint256(10**36).divCeil(target);
    }
}


/**
 * @title ReentrancyGuard
 *
 * @notice Protect functions from Reentrancy Attack
 */
contract ReentrancyGuard {
    // https://solidity.readthedocs.io/en/latest/control-structures.html?highlight=zero-state#scoping-and-declarations
    // zero-state of _ENTERED_ is false
    bool private _ENTERED_;

    modifier preventReentrant() {
        require(!_ENTERED_, "REENTRANT");
        _ENTERED_ = true;
        _;
        _ENTERED_ = false;
    }
}


/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for ERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using SafeMath for uint256;

    function safeTransfer(
        IERC20 token,
        address to,
        uint256 value
    ) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value
    ) internal {
        _callOptionalReturn(
            token,
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
    }

    function safeApprove(
        IERC20 token,
        address spender,
        uint256 value
    ) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        // solhint-disable-next-line max-line-length
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves.

        // A Solidity high level call has three parts:
        //  1. The target address is checked to verify it contains contract code
        //  2. The call itself is made, and success asserted
        //  3. The return value is decoded, which in turn checks the size of the returned data.
        // solhint-disable-next-line max-line-length

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");

        if (returndata.length > 0) {
            // Return data is optional
            // solhint-disable-next-line max-line-length
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}


interface AggregatorV3Interface {

  function decimals() external view returns (uint8);
  function description() external view returns (string memory);
  function version() external view returns (uint256);

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
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

// File: contracts/IOracle.sol


interface IOracle {
    function getPrice(address base) external view returns (uint256 latestPrice, bool feasible);
    function getState(address base) external view returns (uint256 latestPrice, uint64 spread, uint64 coefficient,
    bool feasible);
    function getTimestamp() external view returns (uint256 timestamp);
}



contract RewardManager is InitializableOwnable {
    using SafeMath for uint256;
    using DecimalMath for uint256;
    using SafeERC20 for IERC20;

    mapping(address => bool) public isApproved;

    modifier onlyApproved() {
        require(msg.sender == _OWNER_ || isApproved[msg.sender], "NOT_APPROVED");
        _;
    }

    event PriceOracleUpdated(address indexed newPriceOracle);
    event ChainlinkRefOracleUpdated(
        address indexed newRewardChainlinkRefOracle,
        address indexed newQuoteChainlinkRefOracle
    );
    event Withdraw(address indexed token, address indexed to, uint256 amount);
    event Approve(address indexed user, bool approved);
    event ClaimReward(address indexed user, uint256 amount);

    uint256 public rewardRatio;
    address public rewardToken; // WOO

    address public priceOracle; // WooOracle
    address public rewardChainlinkRefOracle; // Reference
    address public quoteChainlinkRefOracle; // Reference
    uint8 internal quoteDecimals;
    uint256 internal refPriceFixCoeff;

    mapping (address => uint256) public pendingReward;

    constructor(
        address owner,
        uint256 _rewardRatio,
        address _rewardToken,
        address _priceOracle,
        address _rewardChainlinkRefOracle,
        address _quoteChainlinkRefOracle,
        address quoteToken
    ) public {
        init(
            owner,
            _rewardRatio,
            _rewardToken,
            _priceOracle,
            _rewardChainlinkRefOracle,
            _quoteChainlinkRefOracle,
            quoteToken
        );
    }

    function init(
        address owner,
        uint256 _rewardRatio,
        address _rewardToken,
        address _priceOracle,
        address _rewardChainlinkRefOracle,
        address _quoteChainlinkRefOracle,
        address quoteToken
    ) public {
        require(owner != address(0), "INVALID_OWNER");
        require(_rewardRatio <= 1e18, "INVALID_REWARD_RATIO");
        require(_rewardToken != address(0), "INVALID_RAWARD_TOKEN");
        require(_priceOracle != address(0), "INVALID_ORACLE");
        require(quoteToken != address(0), "INVALID_QUOTE");

        initOwner(owner);
        rewardRatio = _rewardRatio;
        rewardToken = _rewardToken;
        priceOracle = _priceOracle;
        rewardChainlinkRefOracle = _rewardChainlinkRefOracle;
        quoteChainlinkRefOracle = _quoteChainlinkRefOracle;
        quoteDecimals = IERC20(quoteToken).decimals();
        if (rewardChainlinkRefOracle != address(0) && quoteChainlinkRefOracle != address(0)) {
            uint256 rewardDecimalsToFix = uint256(IERC20(rewardToken).decimals()).add(uint256(AggregatorV3Interface(rewardChainlinkRefOracle).decimals()));
            uint256 rewardRefPriceFixCoeff = 10**(uint256(36).sub(rewardDecimalsToFix));
            require(rewardRefPriceFixCoeff < type(uint96).max);
            uint256 quoteDecimalsToFix = uint256(quoteDecimals).add(uint256(AggregatorV3Interface(quoteChainlinkRefOracle).decimals()));
            uint256 quoteRefPriceFixCoeff = 10**(uint256(36).sub(quoteDecimalsToFix));
            require(quoteRefPriceFixCoeff < type(uint96).max);
            refPriceFixCoeff = rewardRefPriceFixCoeff.divFloor(quoteRefPriceFixCoeff);
        }

        emit PriceOracleUpdated(_priceOracle);
        emit ChainlinkRefOracleUpdated(_rewardChainlinkRefOracle, _quoteChainlinkRefOracle);
    }

    function addReward(address user, uint256 amount) external onlyApproved { // amount in USDT
        if (user == address(0)) {
            return;
        }
        (uint256 price, bool isFeasible) = IOracle(priceOracle).getPrice(rewardToken);
        if (!isFeasible || !isPriceReliable(price)) {
            return;
        }
        uint256 rewardAmount = amount.mulFloor(rewardRatio).divFloor(price);
        pendingReward[user] = pendingReward[user].add(rewardAmount);
    }

    function claimReward(address user) external {
        uint256 amount = pendingReward[user];
        uint256 balance = IERC20(rewardToken).balanceOf(address(this));
        uint256 amountToTransfer = amount < balance ? amount : balance;
        pendingReward[user] = amount.sub(amountToTransfer);
        IERC20(rewardToken).safeTransfer(user, amountToTransfer);
        emit ClaimReward(user, amountToTransfer);
    }

    function withdraw(address token, address to, uint256 amount) public onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Withdraw(token, to, amount);
    }

    function withdrawAll(address token, address to) external onlyOwner {
        withdraw(token, to, IERC20(token).balanceOf(address(this)));
    }

    function approve(address user) external onlyOwner {
        isApproved[user] = true;
        emit Approve(user, true);
    }

    function revoke(address user) external onlyOwner {
        isApproved[user] = false;
        emit Approve(user, false);
    }

    function setPriceOracle(address newPriceOracle) external onlyApproved {
        require(newPriceOracle != address(0), "INVALID_ORACLE");
        priceOracle = newPriceOracle;
        emit PriceOracleUpdated(newPriceOracle);
    }

    function setChainlinkRefOracle(address newRewardChainlinkRefOracle, address newQuoteChainlinkRefOracle) external onlyApproved {
        rewardChainlinkRefOracle = newRewardChainlinkRefOracle;
        quoteChainlinkRefOracle = newQuoteChainlinkRefOracle;
        if (rewardChainlinkRefOracle != address(0) && quoteChainlinkRefOracle != address(0)) {
            uint256 rewardDecimalsToFix = uint256(IERC20(rewardToken).decimals()).add(uint256(AggregatorV3Interface(rewardChainlinkRefOracle).decimals()));
            uint256 rewardRefPriceFixCoeff = 10**(uint256(36).sub(rewardDecimalsToFix));
            require(rewardRefPriceFixCoeff < type(uint96).max);
            uint256 quoteDecimalsToFix = uint256(quoteDecimals).add(uint256(AggregatorV3Interface(quoteChainlinkRefOracle).decimals()));
            uint256 quoteRefPriceFixCoeff = 10**(uint256(36).sub(quoteDecimalsToFix));
            require(quoteRefPriceFixCoeff < type(uint96).max);
            refPriceFixCoeff = rewardRefPriceFixCoeff.divFloor(quoteRefPriceFixCoeff);
        }

        emit ChainlinkRefOracleUpdated(newRewardChainlinkRefOracle, newQuoteChainlinkRefOracle);
    }

    function isPriceReliable(uint256 price) internal view returns (bool) {
        if (rewardChainlinkRefOracle == address(0) || quoteChainlinkRefOracle == address(0)) {
            // NOTE: price checking disabled
            return true;
        }

        (, int256 rawRewardRefPrice, , , ) = AggregatorV3Interface(rewardChainlinkRefOracle).latestRoundData();
        require(rawRewardRefPrice >= 0, "INVALID_CHAINLINK_PRICE");
        (, int256 rawQuoteRefPrice, , , ) = AggregatorV3Interface(quoteChainlinkRefOracle).latestRoundData();
        require(rawQuoteRefPrice >= 0, "INVALID_CHAINLINK_QUOTE_PRICE");
        uint256 refPrice = uint256(rawRewardRefPrice).divFloor(uint256(rawQuoteRefPrice));
        refPrice = refPrice.mul(refPriceFixCoeff);
        return uint256(refPrice).mulFloor(1e18-1e16) <= price && price <= uint256(refPrice).mulCeil(1e18+1e16);
    }
}
