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

// `btoa`/`atob` (not `Buffer`, same cross-environment reasoning as this
// file's header) operate on binary strings, not `Uint8Array` — the
// per-byte `String.fromCharCode`/`charCodeAt` loop is the standard,
// dependency-free bridge between the two. Fine for chat-message-sized
// payloads (chat-encryption.ts's only caller); not intended for large
// binary blobs.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
