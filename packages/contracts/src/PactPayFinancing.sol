// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Mock-token invoice participation ledger. Does not establish legal assignment or verify invoices.
contract PactPayFinancing is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant INVESTOR_ROLE = keccak256("INVESTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    string public constant VERSION = "1.0.0";

    enum State {
        NONE,
        APPROVED,
        OPEN,
        FUNDED,
        DISBURSED,
        OVERDUE,
        REPAID,
        SETTLED,
        EXPIRED
    }

    struct Terms {
        address token;
        address beneficiary;
        address treasury;
        uint256 target;
        uint256 repayment;
        uint256 fee;
        uint64 fundingDeadline;
        uint64 maturity;
    }

    struct Listing {
        Terms terms;
        State state;
        uint256 funded;
        uint256 refunded;
        uint256 distributed;
        uint256 investors;
        uint256 claims;
        bool feePaid;
    }

    struct Position {
        uint256 contribution;
        bool refunded;
        bool claimed;
    }

    mapping(bytes32 => Listing) private listings;
    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(address => bool) public allowedTokens;
    mapping(address => uint8) public tokenDecimals;
    mapping(address => uint256) public liabilities;
    mapping(bytes32 => bool) public usedReconciliations;

    error InvalidTerms();
    error DuplicateInvoice();
    error InvalidState();
    error InvalidAmount();
    error UnsupportedToken();
    error UnexpectedTokenBehavior();
    error NothingToClaim();
    error InvalidReconciliation();

    event TokenConfigured(address indexed token, bool enabled, uint8 decimals);
    event InvoiceApproved(bytes32 indexed invoiceId, address indexed verifier, Terms terms);
    event StateChanged(bytes32 indexed invoiceId, State state);
    event Contributed(bytes32 indexed invoiceId, address indexed investor, uint256 amount);
    event Disbursed(bytes32 indexed invoiceId, address indexed beneficiary, uint256 amount);
    event Refunded(bytes32 indexed invoiceId, address indexed investor, uint256 amount);
    event RepaymentDeposited(bytes32 indexed invoiceId, bytes32 indexed evidenceCommitment, uint256 amount);
    event Claimed(bytes32 indexed invoiceId, address indexed investor, uint256 amount);
    event FeeClaimed(bytes32 indexed invoiceId, address indexed treasury, uint256 amount);
    event DustReturned(bytes32 indexed invoiceId, address indexed beneficiary, uint256 amount);

    constructor(address admin) {
        if (admin == address(0)) revert InvalidTerms();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function configureToken(address token, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token.code.length == 0) revert UnsupportedToken();
        uint8 decimals = IERC20Metadata(token).decimals();
        if (decimals > 18) revert UnsupportedToken();
        allowedTokens[token] = enabled;
        tokenDecimals[token] = decimals;
        emit TokenConfigured(token, enabled, decimals);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @dev Invoice ID is a salted commitment; verifier approves the immutable complete terms.
    function approveInvoice(bytes32 invoiceId, Terms calldata terms) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        if (listings[invoiceId].state != State.NONE) revert DuplicateInvoice();
        if (!allowedTokens[terms.token]) revert UnsupportedToken();
        if (
            invoiceId == bytes32(0) || terms.beneficiary == address(0) || terms.treasury == address(0)
                || terms.beneficiary == address(this) || terms.treasury == address(this) || terms.target == 0
                || terms.repayment < terms.target || terms.fee > terms.repayment - terms.target
                || terms.fundingDeadline <= block.timestamp || terms.maturity <= terms.fundingDeadline
        ) revert InvalidTerms();
        listings[invoiceId].terms = terms;
        _transition(invoiceId, State.APPROVED);
        emit InvoiceApproved(invoiceId, msg.sender, terms);
    }

    function openListing(bytes32 invoiceId) external onlyRole(LISTER_ROLE) whenNotPaused {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.APPROVED || block.timestamp >= listing.terms.fundingDeadline) revert InvalidState();
        if (!allowedTokens[listing.terms.token]) revert UnsupportedToken();
        _transition(invoiceId, State.OPEN);
    }

    function contribute(bytes32 invoiceId, uint256 amount) external nonReentrant onlyRole(INVESTOR_ROLE) whenNotPaused {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.OPEN || block.timestamp >= listing.terms.fundingDeadline) revert InvalidState();
        if (!allowedTokens[listing.terms.token]) revert UnsupportedToken();
        if (amount == 0 || amount > listing.terms.target - listing.funded) revert InvalidAmount();
        Position storage position = positions[invoiceId][msg.sender];
        if (position.contribution == 0) listing.investors++;
        position.contribution += amount;
        listing.funded += amount;
        if (listing.funded == listing.terms.target) _transition(invoiceId, State.FUNDED);
        _receive(listing.terms.token, amount);
        emit Contributed(invoiceId, msg.sender, amount);
    }

    function disburse(bytes32 invoiceId) external nonReentrant onlyRole(LISTER_ROLE) whenNotPaused {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.FUNDED || block.timestamp >= listing.terms.maturity) revert InvalidState();
        _transition(invoiceId, State.DISBURSED);
        _send(listing.terms.token, listing.terms.beneficiary, listing.funded);
        emit Disbursed(invoiceId, listing.terms.beneficiary, listing.funded);
    }

    function expire(bytes32 invoiceId) public {
        Listing storage listing = listings[invoiceId];
        bool unfundedExpired = (listing.state == State.OPEN || listing.state == State.APPROVED)
            && block.timestamp >= listing.terms.fundingDeadline;
        bool undisbursedExpired = listing.state == State.FUNDED && block.timestamp >= listing.terms.maturity;
        if (!unfundedExpired && !undisbursedExpired) revert InvalidState();
        _transition(invoiceId, State.EXPIRED);
    }

    function refund(bytes32 invoiceId) external nonReentrant {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.EXPIRED) expire(invoiceId);
        Position storage position = positions[invoiceId][msg.sender];
        if (position.contribution == 0 || position.refunded) revert NothingToClaim();
        position.refunded = true;
        listing.refunded += position.contribution;
        _send(listing.terms.token, msg.sender, position.contribution);
        emit Refunded(invoiceId, msg.sender, position.contribution);
    }

    function markOverdue(bytes32 invoiceId) external {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.DISBURSED || block.timestamp < listing.terms.maturity) revert InvalidState();
        _transition(invoiceId, State.OVERDUE);
    }

    /// @notice Operator must reconcile evidence privately before depositing real mock tokens.
    function depositRepayment(bytes32 invoiceId, uint256 amount, bytes32 evidenceCommitment)
        external
        nonReentrant
        onlyRole(SETTLER_ROLE)
    {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.DISBURSED && listing.state != State.OVERDUE) revert InvalidState();
        if (amount != listing.terms.repayment) revert InvalidAmount();
        if (evidenceCommitment == bytes32(0) || usedReconciliations[evidenceCommitment]) {
            revert InvalidReconciliation();
        }
        usedReconciliations[evidenceCommitment] = true;
        listing.feePaid = listing.terms.fee == 0;
        _transition(invoiceId, State.REPAID);
        _receive(listing.terms.token, amount);
        emit RepaymentDeposited(invoiceId, evidenceCommitment, amount);
    }

    function claimable(bytes32 invoiceId, address investor) public view returns (uint256) {
        Listing storage listing = listings[invoiceId];
        Position storage position = positions[invoiceId][investor];
        if (listing.state != State.REPAID || position.claimed) return 0;
        return Math.mulDiv(listing.terms.repayment - listing.terms.fee, position.contribution, listing.terms.target);
    }

    function claim(bytes32 invoiceId) external nonReentrant {
        Listing storage listing = listings[invoiceId];
        Position storage position = positions[invoiceId][msg.sender];
        if (listing.state != State.REPAID || position.contribution == 0 || position.claimed) revert NothingToClaim();
        uint256 amount = claimable(invoiceId, msg.sender);
        position.claimed = true;
        listing.claims++;
        listing.distributed += amount;
        _send(listing.terms.token, msg.sender, amount);
        emit Claimed(invoiceId, msg.sender, amount);
        if (listing.claims == listing.investors) {
            uint256 dust = listing.terms.repayment - listing.terms.fee - listing.distributed;
            if (dust != 0) {
                _send(listing.terms.token, listing.terms.beneficiary, dust);
                emit DustReturned(invoiceId, listing.terms.beneficiary, dust);
            }
        }
        _finish(invoiceId);
    }

    /// @notice Anyone may trigger payment, but recipient and fee were fixed by verifier.
    function claimFee(bytes32 invoiceId) external nonReentrant {
        Listing storage listing = listings[invoiceId];
        if (listing.state != State.REPAID || listing.feePaid) revert NothingToClaim();
        listing.feePaid = true;
        _send(listing.terms.token, listing.terms.treasury, listing.terms.fee);
        emit FeeClaimed(invoiceId, listing.terms.treasury, listing.terms.fee);
        _finish(invoiceId);
    }

    function getListing(bytes32 invoiceId) external view returns (Listing memory) {
        return listings[invoiceId];
    }

    function effectiveState(bytes32 invoiceId) external view returns (State) {
        Listing storage listing = listings[invoiceId];
        if (
            (listing.state == State.OPEN || listing.state == State.APPROVED)
                && block.timestamp >= listing.terms.fundingDeadline
        ) return State.EXPIRED;
        if (listing.state == State.FUNDED && block.timestamp >= listing.terms.maturity) return State.EXPIRED;
        if (listing.state == State.DISBURSED && block.timestamp >= listing.terms.maturity) return State.OVERDUE;
        return listing.state;
    }

    function _finish(bytes32 invoiceId) private {
        Listing storage listing = listings[invoiceId];
        if (listing.feePaid && listing.claims == listing.investors) _transition(invoiceId, State.SETTLED);
    }

    function _transition(bytes32 invoiceId, State state) private {
        listings[invoiceId].state = state;
        emit StateChanged(invoiceId, state);
    }

    function _receive(address token, uint256 amount) private {
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        liabilities[token] += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) != beforeBalance + amount) revert UnexpectedTokenBehavior();
    }

    function _send(address token, address recipient, uint256 amount) private {
        if (amount == 0) return;
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        uint256 recipientBalance = asset.balanceOf(recipient);
        liabilities[token] -= amount;
        asset.safeTransfer(recipient, amount);
        if (
            asset.balanceOf(address(this)) != beforeBalance - amount
                || asset.balanceOf(recipient) != recipientBalance + amount
        ) revert UnexpectedTokenBehavior();
    }
}
