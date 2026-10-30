// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {PactPayFinancing} from "../src/PactPayFinancing.sol";
import {MockSettlementToken} from "../src/MockSettlementToken.sol";

abstract contract ProtocolFixture is Test {
    PactPayFinancing internal protocol;
    MockSettlementToken internal token;
    address internal verifier = address(11);
    address internal lister = address(12);
    address internal settler = address(13);
    address internal pauser = address(14);
    address internal sme = address(15);
    address internal treasury = address(16);
    address internal alice = address(21);
    address internal bob = address(22);
    address internal carol = address(23);
    bytes32 internal constant ID = keccak256("salted-invoice-1");

    function setUp() public virtual {
        protocol = new PactPayFinancing(address(this));
        token = new MockSettlementToken(address(this));
        protocol.configureToken(address(token), true);
        protocol.grantRole(protocol.VERIFIER_ROLE(), verifier);
        protocol.grantRole(protocol.LISTER_ROLE(), lister);
        protocol.grantRole(protocol.SETTLER_ROLE(), settler);
        protocol.grantRole(protocol.PAUSER_ROLE(), pauser);
        _prepare(alice);
        _prepare(bob);
        _prepare(carol);
        _prepare(settler);
    }

    function _prepare(address who) internal {
        protocol.grantRole(protocol.INVESTOR_ROLE(), who);
        token.mint(who, 1e30);
        vm.prank(who);
        token.approve(address(protocol), type(uint256).max);
    }

    function _terms() internal view returns (PactPayFinancing.Terms memory) {
        return PactPayFinancing.Terms(
            address(token),
            sme,
            treasury,
            450e6,
            500e6,
            5e6,
            uint64(block.timestamp + 1 days),
            uint64(block.timestamp + 60 days)
        );
    }

    function _approve() internal {
        vm.prank(verifier);
        protocol.approveInvoice(ID, _terms());
    }

    function _open() internal {
        _approve();
        vm.prank(lister);
        protocol.openListing(ID);
    }

    function _fund() internal {
        _open();
        vm.prank(alice);
        protocol.contribute(ID, 200e6);
        vm.prank(bob);
        protocol.contribute(ID, 150e6);
        vm.prank(carol);
        protocol.contribute(ID, 100e6);
    }

    function _disburse() internal {
        _fund();
        vm.prank(lister);
        protocol.disburse(ID);
    }

    function _repay() internal {
        _disburse();
        vm.prank(settler);
        protocol.depositRepayment(ID, 500e6, keccak256("evidence-1"));
    }

    function _state() internal view returns (PactPayFinancing.State) {
        return protocol.getListing(ID).state;
    }
}
