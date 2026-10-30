// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Development-only token. No redemption, peg or real-world value.
contract MockSettlementToken is ERC20, AccessControl {
    constructor(address minter) ERC20("PactPay Demo Settlement - NO VALUE", "MOCK") {
        _grantRole(DEFAULT_ADMIN_ROLE, minter);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(recipient, amount);
    }
}
