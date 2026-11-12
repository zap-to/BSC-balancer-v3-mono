// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IPermit2 } from "permit2/src/interfaces/IPermit2.sol";

import { IVault } from "@balancer-labs/v3-interfaces/contracts/vault/IVault.sol";
import { IWETH } from "@balancer-labs/v3-interfaces/contracts/solidity-utils/misc/IWETH.sol";

import { CREATE3 } from "@balancer-labs/v3-solidity-utils/contracts/solmate/CREATE3.sol";

import { StablePoolFactory } from "pool-stable/contracts/StablePoolFactory.sol";
import { WeightedPoolFactory } from "pool-weighted/contracts/WeightedPoolFactory.sol";

import { NamespaceDeployer } from "../contracts/authorizer/NamespaceDeployer.sol";
import { ProtocolAuthorizer } from "../contracts/authorizer/ProtocolAuthorizer.sol";
import { ProtocolFeeController } from "../contracts/ProtocolFeeController.sol";
import { CompositeLiquidityRouter } from "../contracts/CompositeLiquidityRouter.sol";
import { VaultExtension } from "../contracts/VaultExtension.sol";
import { VaultExplorer } from "../contracts/VaultExplorer.sol";
import { VaultFactory } from "../contracts/VaultFactory.sol";
import { BufferRouter } from "../contracts/BufferRouter.sol";
import { BatchRouter } from "../contracts/BatchRouter.sol";
import { VaultAdmin } from "../contracts/VaultAdmin.sol";
import { Router } from "../contracts/Router.sol";
import { Vault } from "../contracts/Vault.sol";

/// @notice Deploys this fork's Balancer V3 core at addresses owned by this deployment.
/// @dev A NamespaceDeployer is CREATE2-deployed with the deployer as owner. Every other top-level contract
///      is CREATE2 from that deployer, so the addresses belong to this namespace rather than to Balancer's
///      deployment or to the sender's nonce. The same deployer and DEPLOY_NAMESPACE produce the same Vault
///      address on BSC testnet and BSC mainnet. Router addresses differ because WBNB differs.
contract DeployBalancer is Script {
    // The pause window cannot be extended after deployment. Use the Vault maximum.
    uint32 internal constant PAUSE_WINDOW_DURATION = uint32(365 days * 4);
    uint32 internal constant BUFFER_PERIOD_DURATION = 180 days;
    uint256 internal constant MIN_TRADE_AMOUNT = 1e6;
    uint256 internal constant MIN_WRAP_AMOUNT = 1e4;

    // Public CREATE2 proxy. It only deploys NamespaceDeployer; that contract owns every later CREATE2.
    address internal constant CREATE2_PROXY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address internal constant WBNB_TESTNET = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;

    struct Salts {
        bytes32 namespace;
        bytes32 authorizer;
        bytes32 factory;
        bytes32 feeController;
        bytes32 vault;
        bytes32 router;
        bytes32 batchRouter;
        bytes32 bufferRouter;
        bytes32 compositeRouter;
        bytes32 explorer;
        bytes32 weightedFactory;
        bytes32 stableFactory;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address admin = vm.envOr("ADMIN", deployer);
        string memory namespace = vm.envOr("DEPLOY_NAMESPACE", string("kindling-bsc-7f3a-v1"));
        Salts memory salts = _salts(namespace);
        address namespaceAddress = _predictNamespace(deployer, salts.namespace);
        address vaultAddress = _predictVault(namespaceAddress, admin, salts);

        vm.startBroadcast(deployerKey);
        NamespaceDeployer namespaceDeployer = new NamespaceDeployer{ salt: salts.namespace }(deployer);
        (ProtocolAuthorizer authorizer, VaultFactory factory, ProtocolFeeController feeController) = _deployCore(
            namespaceDeployer,
            admin,
            salts,
            vaultAddress
        );
        _deployPeriphery(namespaceDeployer, IVault(vaultAddress), salts);
        vm.stopBroadcast();

        require(address(namespaceDeployer) == namespaceAddress, "namespace deployer mismatch");
        require(factory.getDeploymentAddress(salts.vault) == vaultAddress, "vault address mismatch");

        console2.log("namespace", namespace);
        console2.log("namespaceDeployer", address(namespaceDeployer));
        console2.log("deployer", deployer);
        console2.log("chainId", block.chainid);
        console2.log("admin", admin);
        console2.log("authorizer", address(authorizer));
        console2.log("vaultFactory", address(factory));
        console2.log("vault", vaultAddress);
        console2.log("vaultAdmin", address(factory.deployedVaultAdmins(vaultAddress)));
        console2.log("vaultExtension", address(factory.deployedVaultExtensions(vaultAddress)));
        console2.log("protocolFeeController", address(feeController));
        console2.log("wbnb", _wrappedNative());
        console2.log("permit2", PERMIT2);
    }

    function _salts(string memory namespace) internal pure returns (Salts memory salts) {
        salts.namespace = _salt(namespace, "namespace-deployer");
        salts.authorizer = _salt(namespace, "authorizer");
        salts.factory = _salt(namespace, "vault-factory");
        salts.feeController = _salt(namespace, "protocol-fee-controller");
        salts.vault = _salt(namespace, "vault");
        salts.router = _salt(namespace, "router");
        salts.batchRouter = _salt(namespace, "batch-router");
        salts.bufferRouter = _salt(namespace, "buffer-router");
        salts.compositeRouter = _salt(namespace, "composite-liquidity-router");
        salts.explorer = _salt(namespace, "vault-explorer");
        salts.weightedFactory = _salt(namespace, "weighted-pool-factory");
        salts.stableFactory = _salt(namespace, "stable-pool-factory");
    }

    function _predictNamespace(address deployer, bytes32 salt) internal view returns (address) {
        return
            vm.computeCreate2Address(
                salt,
                keccak256(abi.encodePacked(type(NamespaceDeployer).creationCode, abi.encode(deployer))),
                CREATE2_PROXY
            );
    }

    function _predictVault(
        address namespaceDeployer,
        address admin,
        Salts memory salts
    ) internal view returns (address) {
        address authorizerAddress = vm.computeCreate2Address(
            salts.authorizer,
            keccak256(abi.encodePacked(type(ProtocolAuthorizer).creationCode, abi.encode(admin))),
            namespaceDeployer
        );
        address factoryAddress = vm.computeCreate2Address(salts.factory, _factoryInitCodeHash(authorizerAddress), namespaceDeployer);
        return CREATE3.getDeployed(salts.vault, factoryAddress);
    }

    function _factoryInitCodeHash(address authorizer) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    type(VaultFactory).creationCode,
                    abi.encode(
                        authorizer,
                        PAUSE_WINDOW_DURATION,
                        BUFFER_PERIOD_DURATION,
                        MIN_TRADE_AMOUNT,
                        MIN_WRAP_AMOUNT,
                        keccak256(type(Vault).creationCode),
                        keccak256(type(VaultExtension).creationCode),
                        keccak256(type(VaultAdmin).creationCode)
                    )
                )
            );
    }

    function _deployCore(
        NamespaceDeployer namespaceDeployer,
        address admin,
        Salts memory salts,
        address vaultAddress
    ) internal returns (ProtocolAuthorizer authorizer, VaultFactory factory, ProtocolFeeController feeController) {
        authorizer = ProtocolAuthorizer(
            namespaceDeployer.deploy(
                salts.authorizer,
                abi.encodePacked(type(ProtocolAuthorizer).creationCode, abi.encode(admin))
            )
        );
        factory = VaultFactory(
            namespaceDeployer.deploy(
                salts.factory,
                abi.encodePacked(type(VaultFactory).creationCode, abi.encode(
                    authorizer,
                    PAUSE_WINDOW_DURATION,
                    BUFFER_PERIOD_DURATION,
                    MIN_TRADE_AMOUNT,
                    MIN_WRAP_AMOUNT,
                    keccak256(type(Vault).creationCode),
                    keccak256(type(VaultExtension).creationCode),
                    keccak256(type(VaultAdmin).creationCode)
                ))
            )
        );
        feeController = ProtocolFeeController(
            namespaceDeployer.deploy(
                salts.feeController,
                abi.encodePacked(
                    type(ProtocolFeeController).creationCode,
                    abi.encode(IVault(vaultAddress), uint256(0), uint256(0))
                )
            )
        );
        namespaceDeployer.functionCall(
            address(factory),
            abi.encodeCall(
                VaultFactory.create,
                (
                    salts.vault,
                    vaultAddress,
                    feeController,
                    type(Vault).creationCode,
                    type(VaultExtension).creationCode,
                    type(VaultAdmin).creationCode
                )
            )
        );
    }

    function _deployPeriphery(NamespaceDeployer namespaceDeployer, IVault vault, Salts memory salts) internal {
        address weth = _wrappedNative();
        console2.log("router", _deployRouter(namespaceDeployer, salts.router, vault, weth));
        console2.log("batchRouter", _deployBatchRouter(namespaceDeployer, salts.batchRouter, vault, weth));
        console2.log("bufferRouter", _deployBufferRouter(namespaceDeployer, salts.bufferRouter, vault, weth));
        console2.log("compositeLiquidityRouter", _deployCompositeRouter(namespaceDeployer, salts.compositeRouter, vault, weth));
        console2.log("vaultExplorer", _deployExplorer(namespaceDeployer, salts.explorer, vault));
        console2.log("weightedPoolFactory", _deployWeightedFactory(namespaceDeployer, salts.weightedFactory, vault));
        console2.log("stablePoolFactory", _deployStableFactory(namespaceDeployer, salts.stableFactory, vault));
    }

    function _deployRouter(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault, address weth) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(Router).creationCode, abi.encode(vault, IWETH(weth), IPermit2(PERMIT2), "Router v1")));
    }

    function _deployBatchRouter(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault, address weth) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(BatchRouter).creationCode, abi.encode(vault, IWETH(weth), IPermit2(PERMIT2), "BatchRouter v1")));
    }

    function _deployBufferRouter(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault, address weth) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(BufferRouter).creationCode, abi.encode(vault, IWETH(weth), IPermit2(PERMIT2), "BufferRouter v1")));
    }

    function _deployCompositeRouter(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault, address weth) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(CompositeLiquidityRouter).creationCode, abi.encode(vault, IWETH(weth), IPermit2(PERMIT2), "CompositeLiquidityRouter v1")));
    }

    function _deployExplorer(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(VaultExplorer).creationCode, abi.encode(vault)));
    }

    function _deployWeightedFactory(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(WeightedPoolFactory).creationCode, abi.encode(vault, PAUSE_WINDOW_DURATION, "WeightedPoolFactory v1", "WeightedPool v1")));
    }

    function _deployStableFactory(NamespaceDeployer namespaceDeployer, bytes32 salt, IVault vault) internal returns (address) {
        return namespaceDeployer.deploy(salt, abi.encodePacked(type(StablePoolFactory).creationCode, abi.encode(vault, PAUSE_WINDOW_DURATION, "StablePoolFactory v1", "StablePool v1")));
    }

    function _salt(string memory namespace, string memory name) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(namespace, ".", name));
    }

    function _wrappedNative() internal view returns (address) {
        if (block.chainid == 56) {
            return WBNB;
        }
        if (block.chainid == 97) {
            return WBNB_TESTNET;
        }
        return vm.envAddress("WETH");
    }
}
