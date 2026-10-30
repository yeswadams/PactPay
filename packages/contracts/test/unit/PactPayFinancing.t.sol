// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ProtocolFixture} from "../ProtocolFixture.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";

contract FinancingTest is ProtocolFixture {
    function testFundingBoundaries() public {
        _open();
        vm.expectRevert(PactPayFinancing.InvalidAmount.selector);
        vm.prank(alice);
        protocol.contribute(ID, 0);
        vm.expectRevert(PactPayFinancing.InvalidAmount.selector);
        vm.prank(alice);
        protocol.contribute(ID, 450e6 + 1);
        vm.prank(alice);
        protocol.contribute(ID, 450e6);
        assertEq(uint256(_state()), uint256(PactPayFinancing.State.FUNDED));
        vm.expectRevert(PactPayFinancing.InvalidState.selector);
        vm.prank(bob);
        protocol.contribute(ID, 1);
    }

    function testFundingDeadline() public {
        _open();
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(PactPayFinancing.InvalidState.selector);
        vm.prank(alice);
        protocol.contribute(ID, 1);
        protocol.expire(ID);
        vm.expectRevert();
        protocol.expire(ID);
    }

    function testDisburseOnce() public {
        _fund();
        uint256 beforeBalance = token.balanceOf(sme);
        vm.prank(lister);
        protocol.disburse(ID);
        assertEq(token.balanceOf(sme) - beforeBalance, 450e6);
        assertEq(protocol.liabilities(address(token)), 0);
        vm.expectRevert();
        vm.prank(lister);
        protocol.disburse(ID);
        vm.expectRevert();
        vm.prank(alice);
        protocol.refund(ID);
    }

    function testCannotDisburseEarly() public {
        _open();
        vm.expectRevert();
        vm.prank(lister);
        protocol.disburse(ID);
    }

    function testUnsuccessfulFundingRefundsExactlyOnce() public {
        _open();
        vm.prank(alice);
        protocol.contribute(ID, 10e6);
        vm.expectRevert();
        vm.prank(alice);
        protocol.refund(ID);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert();
        vm.prank(bob);
        protocol.refund(ID);
        uint256 beforeBalance = token.balanceOf(alice);
        vm.prank(alice);
        protocol.refund(ID);
        assertEq(token.balanceOf(alice) - beforeBalance, 10e6);
        vm.expectRevert();
        vm.prank(alice);
        protocol.refund(ID);
        assertEq(token.balanceOf(address(protocol)), 0);
    }

    function testFullyFundedUndisbursedCanRefundAfterMaturity() public {
        _fund();
        vm.warp(block.timestamp + 60 days);
        vm.expectRevert();
        vm.prank(lister);
        protocol.disburse(ID);
        vm.prank(alice);
        protocol.refund(ID);
        assertEq(protocol.getListing(ID).refunded, 200e6);
    }

    function testOverdueCanRepay() public {
        _disburse();
        vm.expectRevert();
        protocol.markOverdue(ID);
        vm.warp(block.timestamp + 60 days);
        protocol.markOverdue(ID);
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence"));
    }

    function testRepaymentRequiresExactAmountAndEvidence() public {
        _disburse();
        vm.expectRevert(PactPayFinancing.InvalidAmount.selector);
        vm.prank(settler);
        protocol.depositRepayment(ID, 499e6, keccak256("evidence"));
        vm.expectRevert(PactPayFinancing.InvalidReconciliation.selector);
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, bytes32(0));
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence"));
        vm.expectRevert();
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("other"));
    }

    function testClaimsAndFeeCannotRepeat() public {
        _repay();
        assertEq(protocol.claimable(ID, alice), 220e6);
        vm.prank(alice);
        protocol.claim(ID);
        vm.expectRevert();
        vm.prank(alice);
        protocol.claim(ID);
        vm.expectRevert();
        vm.prank(sme);
        protocol.claim(ID);
        protocol.claimFee(ID);
        assertEq(token.balanceOf(treasury), 5e6);
        vm.expectRevert();
        protocol.claimFee(ID);
    }

    function testFuzzRoundingConservation(uint96 aSeed, uint96 bSeed, uint96 gainSeed) public {
        uint256 a = bound(uint256(aSeed), 1, 1e24);
        uint256 b = bound(uint256(bSeed), 1, 1e24);
        uint256 gain = bound(uint256(gainSeed), 0, 1e24);
        PactPayFinancing.Terms memory t = _terms();
        t.target = a + b;
        t.repayment = a + b + gain;
        t.fee = gain / 10;
        vm.prank(verifier);
        protocol.approveInvoice(ID, t);
        vm.prank(lister);
        protocol.openListing(ID);
        vm.prank(alice);
        protocol.contribute(ID, a);
        vm.prank(bob);
        protocol.contribute(ID, b);
        vm.prank(lister);
        protocol.disburse(ID);
        vm.prank(settler);
        protocol.depositRepayment(ID, t.repayment, keccak256("evidence"));
        uint256 pool = t.repayment - t.fee;
        uint256 expected = protocol.claimable(ID, alice) + protocol.claimable(ID, bob);
        vm.prank(alice);
        protocol.claim(ID);
        vm.prank(bob);
        protocol.claim(ID);
        if (t.fee != 0) protocol.claimFee(ID);
        assertEq(token.balanceOf(address(protocol)), 0);
        assertEq(token.balanceOf(treasury), t.fee);
        assertEq(token.balanceOf(sme), t.target + pool - expected);
        assertEq(protocol.liabilities(address(token)), 0);
        assertEq(uint256(_state()), uint256(PactPayFinancing.State.SETTLED));
    }
}
