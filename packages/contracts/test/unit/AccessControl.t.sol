// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ProtocolFixture} from "../ProtocolFixture.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";

contract AccessControlTest is ProtocolFixture {
    function testUnauthorizedActions() public {
        vm.expectRevert();
        vm.prank(alice);
        protocol.approveInvoice(ID, _terms());
        _approve();
        vm.expectRevert();
        vm.prank(verifier);
        protocol.openListing(ID);
        vm.expectRevert();
        vm.prank(alice);
        protocol.configureToken(address(token), false);
        bytes32 role = protocol.SETTLER_ROLE();
        vm.expectRevert();
        vm.prank(alice);
        protocol.grantRole(role, alice);
        vm.expectRevert();
        vm.prank(alice);
        protocol.pause();
        vm.expectRevert();
        new PactPayFinancing(address(0));
    }

    function testInvestorEligibilityRequiredOnlyForNewFunding() public {
        _open();
        address outsider = address(999);
        vm.expectRevert();
        vm.prank(outsider);
        protocol.contribute(ID, 1);
        vm.prank(alice);
        protocol.contribute(ID, 10);
        protocol.revokeRole(protocol.INVESTOR_ROLE(), alice);
        vm.expectRevert();
        vm.prank(alice);
        protocol.contribute(ID, 1);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        protocol.refund(ID);
    }

    function testCannotDisburseOrRepayUnauthorized() public {
        _fund();
        vm.expectRevert();
        vm.prank(alice);
        protocol.disburse(ID);
        vm.prank(lister);
        protocol.disburse(ID);
        vm.expectRevert();
        vm.prank(lister);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence"));
    }

    function testPauseKeepsExitAndRepaymentOpen() public {
        _disburse();
        vm.prank(pauser);
        protocol.pause();
        vm.expectRevert();
        vm.prank(verifier);
        protocol.approveInvoice(keccak256("other"), _terms());
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence"));
        vm.prank(alice);
        protocol.claim(ID);
        protocol.claimFee(ID);
        vm.expectRevert();
        vm.prank(pauser);
        protocol.unpause();
        protocol.unpause();
        assertFalse(protocol.paused());
    }

    function testPausedContributionsAndRefunds() public {
        _open();
        vm.prank(alice);
        protocol.contribute(ID, 10);
        vm.prank(pauser);
        protocol.pause();
        vm.expectRevert();
        vm.prank(bob);
        protocol.contribute(ID, 10);
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        protocol.refund(ID);
        assertEq(protocol.liabilities(address(token)), 0);
    }

    function testTokenRemovalDoesNotTrapExits() public {
        _disburse();
        protocol.configureToken(address(token), false);
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence"));
        vm.prank(alice);
        protocol.claim(ID);
    }
}
