/**
 * @sails/sdk — SailsSignerService (RFC-020)
 *
 * The one EVM key the server legitimately still holds in RFC-020's
 * design — `WdkSettlementProvider`'s current gap (RFC-019, Phase 1's
 * disclosed reference-implementation limitation) is a raw seed phrase in
 * an env var. This moves that into AWS KMS: the service holds only a
 * `KeyId` (ARN/alias), never raw key material — a KMS asymmetric signing
 * key is provably non-exportable, so a compromised app server yields no
 * signing capability without also compromising the AWS IAM principal
 * that can call `kms:Sign`.
 *
 * `@aws-sdk/client-kms` is the real, official AWS SDK v3 KMS client
 * (verified via `npm view` + reading the installed package's own
 * `SignCommand.d.ts`/`GetPublicKeyCommand.d.ts` before writing this —
 * not guessed from AWS docs prose). Real, verified shapes used here:
 * `SignCommand({ KeyId, Message, MessageType: 'DIGEST', SigningAlgorithm:
 * 'ECDSA_SHA_256' })` → `{ Signature }` (DER-encoded ECDSA), and
 * `GetPublicKeyCommand({ KeyId })` → `{ PublicKey }` (DER-encoded
 * SubjectPublicKeyInfo). `KeySpec: 'ECC_SECG_P256K1'` is AWS KMS's real,
 * documented KeySpec name for secp256k1 keys (the curve Ethereum/ERC-4337
 * uses) — confirmed in the installed SDK's own `GetPublicKeyCommand`
 * doc comment listing every real `KeySpec` value.
 *
 * `MessageType: 'DIGEST'` + `SigningAlgorithm: 'ECDSA_SHA_256'` together
 * mean "sign this already-computed 32-byte digest directly, don't hash
 * it again" — the standard, widely-used pattern for KMS-backed Ethereum
 * signing (the digest handed in is `evm-4337.ts`'s real `getUserOpHash()`
 * output, a keccak256 hash, not a SHA-256 one; KMS's `ECDSA_SHA_256`
 * label only fixes the expected 32-byte digest length in DIGEST mode, it
 * does not re-hash).
 *
 * **Post-processing KMS's raw output is real, tested logic** — see
 * `tests/custody-kms-signer.test.ts`, which builds a genuine secp256k1
 * keypair + DER-encoded ECDSA signature (the exact wire shape KMS
 * returns) and round-trips it through `parseDerSignature`/
 * `toEthereumSignature` below, verifying the recovered signature against
 * the real public key with `@noble/curves`. Two real gotchas this
 * handles, both required for the signature to be usable by a Safe/
 * Ethereum verifier and neither optional: (1) KMS may return a "high-S"
 * signature; secp256k1/EIP-2 requires the low-S form, so this code
 * normalizes manually (`Point.Fn.ORDER - s`) when `hasHighS()` is true —
 * `@noble/curves` v2.x dropped the `normalizeS()` convenience method v1.x
 * had, confirmed by reading the installed package's own
 * `abstract/weierstrass.d.ts` before writing this, not assumed from the
 * v1.x API used elsewhere in this repo. (2) KMS's `Sign` operation does
 * not return a recovery id (`v`) — this code recovers it by trying both
 * candidates against the KMS key's own known public key (from
 * `getPublicKey()`) and keeping whichever one matches, the same
 * technique openly documented AWS-KMS-Ethereum-signing integrations use.
 *
 * `@noble/curves` resolves to v2.x in this package specifically
 * (`package.json` declares `^2.0.1`) — `@arkade-os/sdk`'s own transitive
 * tree forces 2.x in this exact `node_modules` slot regardless of what
 * any one file would prefer (confirmed via `npm ls @noble/curves -w
 * @sails/sdk --all`), so this file targets v2.x's real API
 * (`Signature.fromBytes(bytes, 'der')`/`toBytes('compact')`,
 * `secp256k1.sign(..., { prehash: false })`) throughout — verified
 * against the actually-installed package, not the v1.x API
 * `escrow-key.ts` was originally written against.
 *
 * **What this file cannot exercise in this sandbox**: an actual call to
 * AWS (no live credentials/KMS key here) — `sign()`/`getPublicKey()`
 * throw immediately if no `KMSClient` was actually able to reach AWS;
 * that's a real network/auth failure surfacing naturally, not a
 * fabricated response. This class also isn't wired into any escrow flow
 * yet — real wiring happens once RFC-020 exits reference-implementation
 * status (its own `Reference Implementation Plan` section covers that
 * migration).
 */

// Dynamically imported, not a static top-level import — DX audit finding
// (2026-08-10): @aws-sdk/client-kms is ~300KB for a class not even wired
// into any live flow yet (see comment above). A static import made it a
// hard `dependency` of the whole @sails/sdk package — every consumer's
// `npm install` paid for it, even one that only ever touches SailsClient.
// Moved to `peerDependencies` (optional, see package.json) + this lazy
// import: the constructor/method signatures below are unchanged (still
// synchronous `new SailsSignerService(config)`), so this is not a public
// API change, only an internal loading strategy. A consumer who never
// instantiates this class never triggers the import; one who does gets a
// clear "Cannot find module" error at first use if they haven't run
// `npm install @aws-sdk/client-kms` themselves — not a silent failure.
type KmsModule = typeof import('@aws-sdk/client-kms')
let kmsModulePromise: Promise<KmsModule> | undefined
function loadKmsModule(): Promise<KmsModule> {
  if (!kmsModulePromise) kmsModulePromise = import('@aws-sdk/client-kms')
  return kmsModulePromise
}

import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export interface SailsSignerServiceConfig {
  region: string
  keyId: string
}

type Secp256k1Signature = ReturnType<typeof secp256k1.Signature.fromBytes>

// Parses AWS KMS's real DER-encoded ECDSA signature into a normalized
// (low-S) form. `Signature.fromBytes(der, 'der')` is `@noble/curves`
// v2.x's own real DER parser (verified against a real KMS-shaped DER
// signature in tests/custody-kms-signer.test.ts), not hand-rolled ASN.1
// parsing.
export function parseDerSignature(der: Uint8Array): Secp256k1Signature {
  const sig = secp256k1.Signature.fromBytes(der, 'der')
  if (!sig.hasHighS()) return sig
  const ORDER = secp256k1.Point.Fn.ORDER
  return new secp256k1.Signature(sig.r, ORDER - sig.s)
}

// Recovers the missing recovery id by brute force against the signer's
// known public key (KMS's Sign operation never returns one), then
// returns the standard 65-byte Ethereum signature: r(32) || s(32) ||
// v(1, 27+recovery) — the shape Safe's own checkNSignatures()/ecrecover
// expect.
export function toEthereumSignature(sig: Secp256k1Signature, digest: Uint8Array, expectedUncompressedPubkey: Uint8Array): Uint8Array {
  for (const bit of [0, 1] as const) {
    const candidate = sig.addRecoveryBit(bit)
    const recoveredPubkey = candidate.recoverPublicKey(digest).toBytes(false)
    if (bytesToHex(recoveredPubkey) === bytesToHex(expectedUncompressedPubkey)) {
      const compact = candidate.toBytes('compact')
      const ethSig = new Uint8Array(65)
      ethSig.set(compact, 0)
      ethSig[64] = 27 + bit
      return ethSig
    }
  }
  throw new RangeError('toEthereumSignature: neither recovery candidate matches the expected public key')
}

// KMS's GetPublicKey returns a DER SubjectPublicKeyInfo. For an
// ECC_SECG_P256K1 key this structure's BIT STRING content is always the
// raw uncompressed 65-byte EC point (0x04 || X || Y) at a fixed offset
// from the end — this is the same shortcut real-world AWS-KMS-Ethereum
// signer implementations use instead of a general ASN.1 parser, valid
// specifically because this key type's DER shape never varies.
export function extractUncompressedPubkeyFromSpki(spki: Uint8Array): Uint8Array {
  const point = spki.slice(-65)
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new RangeError('extractUncompressedPubkeyFromSpki: unexpected SubjectPublicKeyInfo shape for an ECC_SECG_P256K1 key')
  }
  return point
}

export function ethereumAddressFromUncompressedPubkey(pubkey: Uint8Array): string {
  if (pubkey.length !== 65 || pubkey[0] !== 0x04) {
    throw new RangeError('ethereumAddressFromUncompressedPubkey: expected a 65-byte uncompressed EC point')
  }
  const hash = keccak_256(pubkey.slice(1)) // drop the 0x04 prefix, hash X||Y
  return '0x' + bytesToHex(hash.slice(-20))
}

export class SailsSignerService {
  private clientPromise: Promise<InstanceType<KmsModule['KMSClient']>> | undefined

  constructor(private readonly config: SailsSignerServiceConfig) {}

  private async getClient(): Promise<InstanceType<KmsModule['KMSClient']>> {
    if (!this.clientPromise) {
      this.clientPromise = loadKmsModule().then(({ KMSClient }) => new KMSClient({ region: this.config.region }))
    }
    return this.clientPromise
  }

  async getAddress(): Promise<string> {
    const [client, { GetPublicKeyCommand }] = await Promise.all([this.getClient(), loadKmsModule()])
    const response = await client.send(new GetPublicKeyCommand({ KeyId: this.config.keyId }))
    if (!response.PublicKey) throw new RangeError('SailsSignerService.getAddress: KMS returned no PublicKey')
    const pubkey = extractUncompressedPubkeyFromSpki(response.PublicKey)
    return ethereumAddressFromUncompressedPubkey(pubkey)
  }

  // `digest` must already be the real 32-byte hash to sign (e.g.
  // evm-4337.ts's `getUserOpHash()` output) — this never hashes on the
  // caller's behalf, matching MessageType: 'DIGEST' exactly.
  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    if (digest.length !== 32) throw new RangeError(`SailsSignerService.signDigest: expected a 32-byte digest, got ${digest.length}`)
    const [client, { SignCommand, GetPublicKeyCommand }] = await Promise.all([this.getClient(), loadKmsModule()])
    const [signResponse, pubkeyResponse] = await Promise.all([
      client.send(
        new SignCommand({
          KeyId: this.config.keyId,
          Message: digest,
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256',
        })
      ),
      client.send(new GetPublicKeyCommand({ KeyId: this.config.keyId })),
    ])
    if (!signResponse.Signature) throw new RangeError('SailsSignerService.signDigest: KMS returned no Signature')
    if (!pubkeyResponse.PublicKey) throw new RangeError('SailsSignerService.signDigest: KMS returned no PublicKey')

    const pubkey = extractUncompressedPubkeyFromSpki(pubkeyResponse.PublicKey)
    const sig = parseDerSignature(signResponse.Signature)
    return toEthereumSignature(sig, digest, pubkey)
  }
}
