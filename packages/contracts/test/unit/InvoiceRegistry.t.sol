// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ProtocolFixture} from "../ProtocolFixture.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";

contract InvoiceRegistryTest is ProtocolFixture {
    function testApprovedExactTerms() public {
        _approve();
        assertEq(uint256(_state()), uint256(PactPayFinancing.State.APPROVED));
        assertEq(protocol.getListing(ID).terms.target, 450e6);
    }

    function testRejectDuplicate() public {
        _approve();
        vm.expectRevert(PactPayFinancing.DuplicateInvoice.selector);
        vm.prank(verifier);
        protocol.approveInvoice(ID, _terms());
    }

    function testInvalidTerms() public {
        PactPayFinancing.Terms memory t = _terms();
        t.beneficiary = address(0);
        _invalid(t);
        t = _terms();
        t.target = 0;
        _invalid(t);
        t = _terms();
        t.repayment = 1;
        _invalid(t);
        t = _terms();
        t.fee = 51e6;
        _invalid(t);
        t = _terms();
        t.fundingDeadline = uint64(block.timestamp);
        _invalid(t);
        t = _terms();
        t.maturity = t.fundingDeadline;
        _invalid(t);
        t = _terms();
        t.treasury = address(protocol);
        _invalid(t);
        vm.expectRevert(PactPayFinancing.InvalidTerms.selector);
        vm.prank(verifier);
        protocol.approveInvoice(bytes32(0), _terms());
    }

    function _invalid(PactPayFinancing.Terms memory t) private {
        vm.expectRevert(PactPayFinancing.InvalidTerms.selector);
        vm.prank(verifier);
        protocol.approveInvoice(ID, t);
    }

    function testUnsupportedToken() public {
        protocol.configureToken(address(token), false);
        vm.expectRevert(PactPayFinancing.UnsupportedToken.selector);
        _approve();
    }

    function testCannotFundApprovedOnly() public {
        _approve();
        vm.expectRevert(PactPayFinancing.InvalidState.selector);
        vm.prank(alice);
        protocol.contribute(ID, 1);
    }
}
