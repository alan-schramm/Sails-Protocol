/**
 * @sails/sdk — hex/UTF-8 encoding helpers, no `Buffer` dependency.
 *
 * SDK_GUIDE.md section 6 requires this package to work in both Node.js
 * and browser environments; `Buffer` is a Node global, not a browser
 * one (bundlers often polyfill it, but this package should not assume
 * that). `TextEncoder`/`TextDecoder` are the actual cross-environment
 * primitives (standard in every evergreen browser and Node.js 11+).
 */

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hexToBytes: odd-length hex string "${hex}"`)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
