// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Script} from "forge-std/Script.sol";
import {PactPayFinancing} from "../src/PactPayFinancing.sol";
import {MockSettlementToken} from "../src/MockSettlementToken.sol";

/// @notice Testnet only. Supply --account or an unlocked sender; no keys in source.
contract Deploy is Script {
    function run() external returns (PactPayFinancing protocol, MockSettlementToken token) {
        require(vm.envBool("ALLOW_MOCK_DEPLOYMENT"), "Explicit mock opt-in required");
        require(block.chainid == vm.envUint("DEPLOY_CHAIN_ID"), "Chain mismatch");
        require(
            block.chainid == 31337 || block.chainid == 11155111 || block.chainid == 84532 || block.chainid == 421614
                || block.chainid == 80002 || block.chainid == 11155420 || block.chainid == 97 || block.chainid == 43113,
            "Unapproved testnet"
        );
        address admin = vm.envAddress("PROTOCOL_ADMIN");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address lister = vm.envAddress("LISTER_ADDRESS");
        address settler = vm.envAddress("SETTLER_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        require(
            admin != address(0) && verifier != address(0) && lister != address(0) && settler != address(0)
                && pauser != address(0),
            "Zero role holder"
        );
        // Broadcast sender bootstraps roles, then relinquishes admin when a separate admin is selected.
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(deployer != address(0), "Zero deployer");
        vm.startBroadcast(deployer);
        protocol = new PactPayFinancing(deployer);
        token = new MockSettlementToken(admin);
        protocol.configureToken(address(token), true);
        protocol.grantRole(protocol.VERIFIER_ROLE(), verifier);
        protocol.grantRole(protocol.LISTER_ROLE(), lister);
        protocol.grantRole(protocol.SETTLER_ROLE(), settler);
        protocol.grantRole(protocol.PAUSER_ROLE(), pauser);
        if (admin != deployer) {
            protocol.grantRole(protocol.DEFAULT_ADMIN_ROLE(), admin);
            protocol.renounceRole(protocol.DEFAULT_ADMIN_ROLE(), deployer);
        }
        vm.stopBroadcast();
    }
}
