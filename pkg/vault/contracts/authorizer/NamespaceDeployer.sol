// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Owner-gated CREATE2 deployer for this deployment's own addresses.
/// @dev VaultFactory records its deployer as owner. Routing deployment through this contract keeps that
///      owner under the admin's control, instead of the public CREATE2 factory.
contract NamespaceDeployer is Ownable {
    error DeploymentFailed();

    constructor(address initialOwner) Ownable(initialOwner) {
        // solhint-disable-previous-line no-empty-blocks
    }

    function deploy(bytes32 salt, bytes memory creationCode) external onlyOwner returns (address deployed) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            deployed := create2(0, add(creationCode, 0x20), mload(creationCode), salt)
        }
        if (deployed == address(0)) {
            revert DeploymentFailed();
        }
    }

    function functionCall(address target, bytes calldata data) external onlyOwner returns (bytes memory result) {
        bool success;
        (success, result) = target.call(data);
        if (!success) {
            // solhint-disable-next-line no-inline-assembly
            assembly ("memory-safe") {
                revert(add(result, 0x20), mload(result))
            }
        }
    }
}
