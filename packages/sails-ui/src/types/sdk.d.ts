declare module '@sails/sdk' {
  export interface Ed25519Keypair { secretKey: Uint8Array; publicKey: Uint8Array }
  export function generateKeypair(): Ed25519Keypair
  export function generateEscrowKeypair(): { privateKey: Uint8Array; publicKeyHex: string }
  export function signEscrowPsbt(psbtBase64: string, privateKey: Uint8Array): string
  export function hexToBytes(hex: string): Uint8Array
  export class SailsClient {
    constructor(options: any)
    identity: any
    settlement: any
    liquidity: any
    openp2p: any
    setSessionToken(token: string | null): void
  }
}
