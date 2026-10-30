// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ProtocolFixture} from "../ProtocolFixture.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";

contract FinancingLifecycleTest is ProtocolFixture {
    function testThreeInvestorsFullJourney() public {
        uint256 a = token.balanceOf(alice);
        uint256 b = token.balanceOf(bob);
        uint256 c = token.balanceOf(carol);
        _repay();
        vm.prank(carol);
        protocol.claim(ID);
        protocol.claimFee(ID);
        vm.prank(alice);
        protocol.claim(ID);
        vm.prank(bob);
        protocol.claim(ID);
        assertEq(token.balanceOf(alice), a + 20e6);
        assertEq(token.balanceOf(bob), b + 15e6);
        assertEq(token.balanceOf(carol), c + 10e6);
        assertEq(token.balanceOf(sme), 450e6);
        assertEq(token.balanceOf(treasury), 5e6);
        assertEq(uint256(_state()), uint256(PactPayFinancing.State.SETTLED));
        assertEq(token.balanceOf(address(protocol)), 0);
    }

    function testSeparateListingsCannotSpendEachOthersFunds() public {
        _open();
        vm.prank(alice);
        protocol.contribute(ID, 20e6);
        bytes32 other = keccak256("other");
        vm.prank(verifier);
        protocol.approveInvoice(other, _terms());
        vm.prank(lister);
        protocol.openListing(other);
        vm.expectRevert();
        vm.prank(lister);
        protocol.disburse(other);
        assertEq(protocol.getListing(ID).funded, 20e6);
        assertEq(protocol.getListing(other).funded, 0);
        assertEq(protocol.liabilities(address(token)), 20e6);
    }
}
