// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IAuthorizer } from "@balancer-labs/v3-interfaces/contracts/vault/IAuthorizer.sol";

/// @notice Bootstrap authorizer for a new deployment.
/// @dev The owner can perform every action. Specific accounts can be granted individual action ids.
///      Replace this with `TimelockAuthorizer` before the Vault holds meaningful value.
contract ProtocolAuthorizer is IAuthorizer, Ownable {
    event PermissionGranted(bytes32 indexed actionId, address indexed account, address indexed where);
    event PermissionRevoked(bytes32 indexed actionId, address indexed account, address indexed where);

    mapping(bytes32 actionId => mapping(address account => mapping(address where => bool granted)))
        private _permissions;

    constructor(address initialAdmin) Ownable(initialAdmin) {
        // solhint-disable-previous-line no-empty-blocks
    }

    /// @inheritdoc IAuthorizer
    function canPerform(bytes32 actionId, address account, address where) external view returns (bool) {
        return account == owner() || _permissions[actionId][account][where];
    }

    function grantPermission(bytes32 actionId, address account, address where) external onlyOwner {
        _permissions[actionId][account][where] = true;
        emit PermissionGranted(actionId, account, where);
    }

    function revokePermission(bytes32 actionId, address account, address where) external onlyOwner {
        _permissions[actionId][account][where] = false;
        emit PermissionRevoked(actionId, account, where);
    }
}
