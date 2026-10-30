// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ProtocolFixture} from "../ProtocolFixture.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract AdversarialToken is ERC20 {
    bool public taxed;
    bool public callback;
    bool public reentered;
    address public protocol;
    bytes32 public invoiceId;
    constructor() ERC20("Adversarial", "BAD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configure(address p, bytes32 id, bool tax, bool cb) external {
        protocol = p;
        invoiceId = id;
        taxed = tax;
        callback = cb;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (callback && from != address(0)) {
            (bool ok,) = protocol.call(abi.encodeCall(PactPayFinancing.contribute, (invoiceId, 1)));
            reentered = ok;
        }
        uint256 fee = taxed && from != address(0) ? amount / 10 : 0;
        super._update(from, to, amount - fee);
        if (fee != 0) super._update(from, address(0), fee);
    }
}

contract TokenSafetyTest is ProtocolFixture {
    function _bad() private returns (AdversarialToken bad) {
        bad = new AdversarialToken();
        protocol.configureToken(address(bad), true);
        PactPayFinancing.Terms memory t = _terms();
        t.token = address(bad);
        vm.prank(verifier);
        protocol.approveInvoice(ID, t);
        vm.prank(lister);
        protocol.openListing(ID);
        bad.mint(alice, 1000e6);
        vm.prank(alice);
        bad.approve(address(protocol), type(uint256).max);
    }

    function testFeeOnTransferRejectedAtomically() public {
        AdversarialToken bad = _bad();
        bad.configure(address(protocol), ID, true, false);
        vm.expectRevert(PactPayFinancing.UnexpectedTokenBehavior.selector);
        vm.prank(alice);
        protocol.contribute(ID, 100e6);
        assertEq(protocol.getListing(ID).funded, 0);
        assertEq(protocol.liabilities(address(bad)), 0);
    }

    function testReentrantTokenCannotEnterFunding() public {
        AdversarialToken bad = _bad();
        bad.configure(address(protocol), ID, false, true);
        vm.prank(alice);
        protocol.contribute(ID, 100e6);
        assertFalse(bad.reentered());
        assertEq(protocol.getListing(ID).funded, 100e6);
    }

    function testOutgoingTaxRevertsDisbursement() public {
        AdversarialToken bad = _bad();
        vm.prank(alice);
        protocol.contribute(ID, 450e6);
        bad.configure(address(protocol), ID, true, false);
        vm.expectRevert(PactPayFinancing.UnexpectedTokenBehavior.selector);
        vm.prank(lister);
        protocol.disburse(ID);
        assertEq(uint256(protocol.getListing(ID).state), uint256(PactPayFinancing.State.FUNDED));
        assertEq(protocol.liabilities(address(bad)), 450e6);
    }
}
