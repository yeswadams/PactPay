// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";
import {MockSettlementToken} from "../../src/MockSettlementToken.sol";

contract DeploymentTest is Test {
    function testRolesInitializedAndBootstrapAdminRemoved() public {
        vm.chainId(31337);
        vm.setEnv("ALLOW_MOCK_DEPLOYMENT", "true");
        vm.setEnv("DEPLOY_CHAIN_ID", "31337");
        vm.setEnv("DEPLOYER_ADDRESS", vm.toString(address(1)));
        vm.setEnv("PROTOCOL_ADMIN", vm.toString(address(2)));
        vm.setEnv("VERIFIER_ADDRESS", vm.toString(address(3)));
        vm.setEnv("LISTER_ADDRESS", vm.toString(address(4)));
        vm.setEnv("SETTLER_ADDRESS", vm.toString(address(5)));
        vm.setEnv("PAUSER_ADDRESS", vm.toString(address(6)));
        (PactPayFinancing p, MockSettlementToken token) = new Deploy().run();
        assertTrue(p.hasRole(p.DEFAULT_ADMIN_ROLE(), address(2)));
        assertFalse(p.hasRole(p.DEFAULT_ADMIN_ROLE(), address(1)));
        assertTrue(p.hasRole(p.VERIFIER_ROLE(), address(3)));
        assertTrue(p.hasRole(p.LISTER_ROLE(), address(4)));
        assertTrue(p.hasRole(p.SETTLER_ROLE(), address(5)));
        assertTrue(p.hasRole(p.PAUSER_ROLE(), address(6)));
        assertTrue(p.allowedTokens(address(token)));
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(2)));
    }
}
