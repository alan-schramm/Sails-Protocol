<!--
Consequence-weighted — see docs/ENGINEERING_GOVERNANCE.md §4/§9.
Fill in every section for Protocol-sensitive / Financial-authority work.
For a reversible UI/product change, docs typo, or internal refactor with
no semantic impact, write "N/A" on the sections that don't apply — don't
leave them blank without saying why.
-->

## Problem

<!-- What was wrong or missing? Link the Issue. -->

## Property gained

<!-- What does this change make true that wasn't true before? -->

## Scope

<!-- What's in this PR. What's explicitly left out. -->

## Canonical references

<!-- Which docs/RFC/invariant this touches or implements. -->

---

### Impact (mark each — "None" is a real, valid answer, not a skip)

- **Architecture impact:**
- **Protocol impact:**
- **Security impact:**
- **Privacy impact:**
- **UX impact:**

### Tests

<!-- What ran. What a reviewer should run to reproduce. -->

### Evidence

<!-- Per docs/ENGINEERING_GOVERNANCE.md §11 — Hypothesis / Designed /
     Implemented / Supported / Demonstrated / Validated / Frozen.
     State the level honestly; don't round up. -->

### Claims allowed / not demonstrated

<!-- docs/ENGINEERING_GOVERNANCE.md §10 — OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM.
     What may this PR's description or a doc update safely say? What
     must it explicitly NOT claim? -->

### Technical debt introduced

<!-- If none, say "None." If any, it must be registered in
     docs/TECHNICAL_DEBT_AUDIT.md in this same PR, not left implicit. -->

---

<!-- The two sections below are REQUIRED for Protocol-Sensitive /
     Economic-Security-Critical work (docs/ENGINEERING_GOVERNANCE.md §4).
     Mark N/A for Reversible / Shared-Semantics work. -->

### Sacrifice Check (required for significant architecture/security/protocol work)

1. What property did we gain?
2. What property might we have sacrificed?
3. What complexity did we introduce?
4. Did the complexity earn its place?
5. What remains explicitly not demonstrated?

### STOP gate / architecture approval

- [ ] This PR does not change a frozen invariant, the Semantic Kernel, or Core Architecture.
- [ ] If it does, the corresponding RFC/Core-RFC (`docs/GOVERNANCE.md` §5/§6A) is linked here: ___
- [ ] No STOP condition (`docs/ENGINEERING_GOVERNANCE.md` §6) was encountered and worked around silently.
