pragma solidity ^0.4.0;

contract IWooCoolDownVault {
    function coolDownToken() external view returns (address);
    function deposit(uint256 _amount) external;
}
