// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PactPayFinancing} from "../../src/PactPayFinancing.sol";
import {MockSettlementToken} from "../../src/MockSettlementToken.sol";

contract FinancingHandler is Test {
    PactPayFinancing public protocol;
    MockSettlementToken public token;
    address[3] public actors = [address(101), address(102), address(103)];
    mapping(bytes32 => uint256) public disbursements;
    mapping(bytes32 => uint256) public repayments;

    constructor() {
        protocol = new PactPayFinancing(address(this));
        token = new MockSettlementToken(address(this));
        protocol.configureToken(address(token), true);
        protocol.grantRole(protocol.VERIFIER_ROLE(), address(this));
        protocol.grantRole(protocol.LISTER_ROLE(), address(this));
        protocol.grantRole(protocol.SETTLER_ROLE(), address(this));
        token.mint(address(this), 1e30);
        token.approve(address(protocol), type(uint256).max);
        for (uint256 i; i < 3; i++) {
            protocol.grantRole(protocol.INVESTOR_ROLE(), actors[i]);
            token.mint(actors[i], 1e30);
            vm.prank(actors[i]);
            token.approve(address(protocol), type(uint256).max);
        }
        for (uint256 i = 1; i <= 4; i++) {
            protocol.approveInvoice(
                bytes32(i),
                PactPayFinancing.Terms(
                    address(token),
                    address(201),
                    address(202),
                    450e6,
                    500e6,
                    5e6,
                    uint64(block.timestamp + 3 days),
                    uint64(block.timestamp + 7 days)
                )
            );
            protocol.openListing(bytes32(i));
        }
    }

    function contribute(uint256 idSeed, uint256 actorSeed, uint256 amountSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        PactPayFinancing.Listing memory l = protocol.getListing(id);
        if (l.state != PactPayFinancing.State.OPEN || block.timestamp >= l.terms.fundingDeadline) return;
        uint256 amount = bound(amountSeed, 1, l.terms.target - l.funded);
        vm.prank(actors[actorSeed % 3]);
        protocol.contribute(id, amount);
    }

    function completeFunding(uint256 idSeed, uint256 actorSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        PactPayFinancing.Listing memory l = protocol.getListing(id);
        if (l.state != PactPayFinancing.State.OPEN || block.timestamp >= l.terms.fundingDeadline) return;
        vm.prank(actors[actorSeed % 3]);
        protocol.contribute(id, l.terms.target - l.funded);
    }

    function disburse(uint256 idSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        PactPayFinancing.Listing memory l = protocol.getListing(id);
        if (l.state != PactPayFinancing.State.FUNDED || block.timestamp >= l.terms.maturity) return;
        protocol.disburse(id);
        disbursements[id]++;
    }

    function repay(uint256 idSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        PactPayFinancing.State s = protocol.getListing(id).state;
        if (s != PactPayFinancing.State.DISBURSED && s != PactPayFinancing.State.OVERDUE) return;
        protocol.depositRepayment(id, 500e6, keccak256(abi.encode(id)));
        repayments[id]++;
    }

    function exit(uint256 idSeed, uint256 actorSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        address actor = actors[actorSeed % 3];
        (uint256 amount, bool refunded, bool claimed) = protocol.positions(id, actor);
        if (amount == 0) return;
        PactPayFinancing.State s = protocol.effectiveState(id);
        if (s == PactPayFinancing.State.EXPIRED && !refunded) {
            vm.prank(actor);
            protocol.refund(id);
        }
        if (s == PactPayFinancing.State.REPAID && !claimed) {
            vm.prank(actor);
            protocol.claim(id);
        }
    }

    function fee(uint256 idSeed) external {
        bytes32 id = bytes32(bound(idSeed, 1, 4));
        PactPayFinancing.Listing memory l = protocol.getListing(id);
        if (l.state == PactPayFinancing.State.REPAID && !l.feePaid) protocol.claimFee(id);
    }

    function advance(uint256 delta) external {
        vm.warp(block.timestamp + bound(delta, 0, 2 days));
    }
}

contract FinancingInvariantTest is StdInvariant, Test {
    FinancingHandler handler;

    function setUp() public {
        handler = new FinancingHandler();
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.contribute.selector;
        selectors[1] = handler.completeFunding.selector;
        selectors[2] = handler.disburse.selector;
        selectors[3] = handler.repay.selector;
        selectors[4] = handler.exit.selector;
        selectors[5] = handler.fee.selector;
        selectors[6] = handler.advance.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantFinancialConservationAndStatePaths() public view {
        PactPayFinancing p = handler.protocol();
        uint256 expected;
        for (uint256 i = 1; i <= 4; i++) {
            bytes32 id = bytes32(i);
            PactPayFinancing.Listing memory l = p.getListing(id);
            assertLe(l.funded, l.terms.target);
            assertLe(l.refunded, l.funded);
            assertLe(l.distributed, l.terms.repayment - l.terms.fee);
            assertLe(handler.disbursements(id), 1);
            assertLe(handler.repayments(id), 1);
            if (
                l.state == PactPayFinancing.State.OPEN || l.state == PactPayFinancing.State.FUNDED
                    || l.state == PactPayFinancing.State.EXPIRED
            ) expected += l.funded - l.refunded;
            if (l.state == PactPayFinancing.State.REPAID) {
                uint256 remaining = l.terms.repayment - l.distributed - (l.feePaid ? l.terms.fee : 0);
                if (l.claims == l.investors) remaining = l.feePaid ? 0 : l.terms.fee;
                expected += remaining;
            }
            if (
                l.state == PactPayFinancing.State.DISBURSED || l.state == PactPayFinancing.State.REPAID
                    || l.state == PactPayFinancing.State.SETTLED
            ) assertEq(handler.disbursements(id), 1);
            if (l.state == PactPayFinancing.State.SETTLED) {
                assertEq(l.claims, l.investors);
                assertTrue(l.feePaid);
                assertEq(handler.repayments(id), 1);
            }
        }
        assertEq(p.liabilities(address(handler.token())), expected);
        assertEq(handler.token().balanceOf(address(p)), expected);
    }
}
