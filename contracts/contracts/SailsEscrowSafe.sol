// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import "@safe-global/safe-contracts/contracts/base/GuardManager.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";

// SailsEscrowSafe — RFC-020 non-custodial EVM settlement, Sails Protocol.
//
// Reference implementation ONLY. Not deployed, not audited. Compiled
// (`npx hardhat compile` in `contracts/`) against real, unmodified
// safe-contracts/account-abstraction-contracts dependencies as a real
// correctness check — never deployed to any network, testnet or
// otherwise, in this pass.
//
// Deliberately NOT a from-scratch ERC-4337 IAccount/signature-threshold
// implementation — that would mean this repo's own unaudited code
// verifying real signature thresholds, exactly the kind of custom crypto
// this session's own standing discipline avoids when an audited
// primitive already exists. Instead this is a Safe Transaction Guard
// (GuardManager.sol's real Guard/BaseGuard interface) attached to an
// ordinary, unmodified Safe (deployed via Safe's own standard factory,
// out of scope here) whose owners are the trade's buyer, seller, and
// SailsSignerService (packages/sails-sdk/src/custody/kms-signer.ts) as
// the third co-signer, threshold 2-of-3 — the exact same role split
// MULTISIG/LIGHTNING_HODL's already-shipped Bitcoin/Ark 2-of-3 escrow
// uses (multisig.provider.ts/lightning-hodl.provider.ts), just
// EVM-native. All actual ECDSA/threshold signature verification is
// Safe's own real, audited checkSignatures()/checkNSignatures()
// (Safe.sol) — this contract never touches a signature directly. ERC-
// 4337 UserOperation compatibility (so a bundler can relay a release/
// refund without the Safe's own owners paying gas directly) is provided
// by pairing this Safe with Safe's own real Safe4337Module package —
// not reimplemented here either. This contract's only real job: once
// attached as the Safe's guard, it refuses to let the Safe execute
// ANYTHING except a single native-asset transfer of exactly
// lockedAmount to one of the two pre-agreed addresses fixed at
// construction time (releaseTo for the buyer, refundTo for the seller)
// — so even a correctly-obtained 2-of-3 threshold signature can never
// redirect escrowed funds anywhere else, and once one of those two
// transfers has succeeded, every further attempt is refused (settled).
//
// UserOp replay: NOT this contract's concern by design — the real,
// audited EntryPoint.getNonce()/_validateNonce() machinery
// (account-abstraction-contracts' EntryPoint.sol/BaseAccount.sol)
// already provides genuine per-account nonce tracking for any account
// that routes through a real EntryPoint (which a Safe4337Module-backed
// Safe does) — duplicating that logic here would be redundant,
// unaudited surface area for no benefit. See
// packages/sails-sdk/tests/custody-userop.test.ts for a logic-level
// test of the nonce-replay expectation this relies on.
interface ISailsSafeOwnerView {
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
}

contract SailsEscrowSafe is BaseGuard {
    /// @notice The Safe this guard is attached to — the only caller `checkTransaction`/`checkAfterExecution` accept.
    address public immutable safe;
    /// @notice Buyer's payout address (RELEASE ruling).
    address public immutable releaseTo;
    /// @notice Seller's payout address (REFUND ruling).
    address public immutable refundTo;
    /// @notice The escrow's locked amount, in wei — the only value this guard permits transferring.
    uint256 public immutable lockedAmount;
    /// @notice Set true the moment either payout succeeds — every subsequent attempt is refused.
    bool public settled;

    error NotTheSafe();
    error AlreadySettled();
    error UnauthorizedOperation();
    error UnauthorizedDestination();
    error WrongAmount();
    error InsufficientThreshold();

    /**
     * @param safe_ The already-deployed Safe (2-of-3: buyer, seller, SailsSignerService) this guard protects.
     * @param releaseTo_ Buyer's payout address.
     * @param refundTo_ Seller's payout address.
     * @param lockedAmount_ The escrow's locked amount, in wei.
     */
    constructor(address safe_, address releaseTo_, address refundTo_, uint256 lockedAmount_) {
        if (ISailsSafeOwnerView(safe_).getThreshold() < 2) revert InsufficientThreshold();
        safe = safe_;
        releaseTo = releaseTo_;
        refundTo = refundTo_;
        lockedAmount = lockedAmount_;
    }

    /// @inheritdoc Guard
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 /* safeTxGas */,
        uint256 /* baseGas */,
        uint256 /* gasPrice */,
        address /* gasToken */,
        address payable /* refundReceiver */,
        bytes memory /* signatures */,
        address /* msgSender */
    ) external view override {
        if (msg.sender != safe) revert NotTheSafe();
        if (settled) revert AlreadySettled();
        // Plain native-asset transfer only — no contract calls, no
        // delegatecall (which could otherwise let a 2-of-3 signature
        // bypass this guard's own restrictions by executing arbitrary
        // code in the Safe's own storage context).
        if (operation != Enum.Operation.Call || data.length != 0) revert UnauthorizedOperation();
        if (to != releaseTo && to != refundTo) revert UnauthorizedDestination();
        if (value != lockedAmount) revert WrongAmount();
    }

    /// @inheritdoc Guard
    function checkAfterExecution(bytes32 /* txHash */, bool success) external override {
        if (msg.sender != safe) revert NotTheSafe();
        if (success) settled = true;
    }
}
