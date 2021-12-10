// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/*

░██╗░░░░░░░██╗░█████╗░░█████╗░░░░░░░███████╗██╗
░██║░░██╗░░██║██╔══██╗██╔══██╗░░░░░░██╔════╝██║
░╚██╗████╗██╔╝██║░░██║██║░░██║█████╗█████╗░░██║
░░████╔═████║░██║░░██║██║░░██║╚════╝██╔══╝░░██║
░░╚██╔╝░╚██╔╝░╚█████╔╝╚█████╔╝░░░░░░██║░░░░░██║
░░░╚═╝░░░╚═╝░░░╚════╝░░╚════╝░░░░░░░╚═╝░░░░░╚═╝

*
* MIT License
* ===========
*
* Copyright (c) 2020 WooTrade
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import "./interfaces/IWooAccessManager.sol";

contract WooAccessManager is IWooAccessManager, Ownable, Pausable {

    /* ----- State variables ----- */

    mapping(address => bool) public override isRewardAdmin;
    mapping(address => bool) public override zeroFeeVault;

    /* ----- Admin Functions ----- */

    /// @inheritdoc IWooAccessManager
    function setRewardAdmin(address rewardAdmin, bool flag) external override onlyOwner whenNotPaused {
        require(rewardAdmin != address(0), 'WooAccessManager: rewardAdmin_ZERO_ADDR');
        isRewardAdmin[rewardAdmin] = flag;
        emit RewardAdminUpdated(rewardAdmin, flag);
    }

    /// @inheritdoc IWooAccessManager
    function batchSetRewardAdmin(address[] calldata rewardAdmins, bool[] calldata flags) external override onlyOwner whenNotPaused {
        require(rewardAdmins.length == flags.length, 'WooAccessManager: length_INVALID');

        for (uint256 i = 0; i < rewardAdmins.length; i++) {
            require(rewardAdmins[i] != address(0), 'WooAccessManager: rewardAdmin_ZERO_ADDR');
            isRewardAdmin[rewardAdmins[i]] = flags[i];
        }
        emit BatchRewardAdminUpdated(rewardAdmins, flags);
    }

    /// @inheritdoc IWooAccessManager
    function setZeroFeeVault(address vault, bool flag) external override onlyOwner whenNotPaused {
        require(vault != address(0), 'WooAccessManager: vault_ZERO_ADDR');
        zeroFeeVault[vault] = flag;
        emit ZeroFeeVaultUpdated(vault, flag);
    }

    /// @inheritdoc IWooAccessManager
    function batchSetZeroFeeVault(address[] calldata vaults, bool[] calldata flags) external override onlyOwner whenNotPaused {
        require(vaults.length == flags.length, 'WooAccessManager: length_INVALID');

        for (uint256 i = 0; i < vaults.length; i++) {
            require(vaults[i] != address(0), 'WooAccessManager: vault_ZERO_ADDR');
            zeroFeeVault[vaults[i]] = flags[i];
        }
        emit BatchZeroFeeVaultUpdated(vaults, flags);
    }

    /// @notice Pause the contract.
    function pause() external onlyOwner {
        super._pause();
    }

    /// @notice Restart the contract.
    function unpause() external onlyOwner {
        super._unpause();
    }
}
