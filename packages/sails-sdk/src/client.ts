/**
 * @satsails/p2p-trading-sdk — SailsClient (SDK_GUIDE.md section 2)
 *
 * The single object a wallet imports. Internally composed of the four
 * layers SDK_GUIDE.md section 4B specifies (Transport at the bottom,
 * Protocol SDK modules in the middle, the Intent facade above them).
 * A Capability SDK layer (`client.capabilities`) was added by
 * rfcs/RFC-013-capability-registry-and-wallet-adapter.md, once the
 * Capability Registry it calls into (`src/core/capability-registry.ts`)
 * stopped being a stub — adding it before that RFC would have been
 * exactly the "logic that isn't already in a module's service layer"
 * SDK_GUIDE.md section 1 calls a design smell; it's real now.
 */
import { SailsTransport, type SailsTransportOptions } from "./transport";
import { SailsIdentityModule } from "./modules/identity";
import { SailsReputationModule } from "./modules/reputation";
import { SailsLiquidityModule } from "./modules/liquidity";
import { SailsOpenP2PModule } from "./modules/openp2p";
import { SailsSettlementModule } from "./modules/settlement";
import { SailsPeersModule } from "./modules/peers";
import { SailsCapabilitiesModule } from "./modules/capabilities";
import { SailsArbitrationModule } from "./modules/arbitration";
import { SailsPaymentAccountModule } from "./modules/payment-account";
import { SailsProofModule } from "./modules/proof";
import { SailsAgentsModule } from "./modules/agents";
import { SailsIntentFacade } from "./intent-facade";
import type {
  WalletAdapter,
  WalletCapabilitiesDeclaration,
} from "./wallet-adapter";
import { SailsConfigError } from "./errors";

export interface SailsClientOptions {
  /** e.g. 'http://localhost:3000' — never hardcoded (SDK_GUIDE.md section 6). */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  webSocketImpl?: typeof WebSocket;
  // RFC-013 — optional: every v0.1 module already works without one
  // (HTTP/WS only, never a private key). Supplying one unlocks
  // capabilities.registerFromWallet() and is where a wallet's own
  // signing stack (WDK-based or otherwise) plugs in going forward.
  wallet?: WalletAdapter;
  // Network reliability (PRODUCTION_READINESS_REVIEW.md's High-severity
  // finding #1, closed 2026-08-02) — passed straight through to
  // SailsTransport; see that class's own SailsTransportOptions doc for
  // what each one does and why only GET is auto-retried.
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class SailsClient {
  private readonly transport: SailsTransport;

  // ── Protocol names (RFC/module-accurate — match this repo's own
  // src/modules/open-* folder names). Each has a friendly alias below
  // (docs/API_STABLE.md) except `peers`/`capabilities`, which have none
  // — both names would just be synonyms, not a real accessibility gain.
  // See each property's own JSDoc for its exact alias, if any (shows on
  // hover — this comment block itself does not, by design: the per-
  // property pointer is what actually solves "confusing in autocomplete
  // with no context").

  /** Register, Ed25519 challenge-response auth, session management. Friendly alias: {@link SailsClient.auth} — same instance, not a separate module. */
  readonly identity: SailsIdentityModule;
  /** Reputation score, leaderboard, rating submission. Friendly alias: {@link SailsClient.trustScore} — same instance, not a separate module. */
  readonly reputation: SailsReputationModule;
  /** Publish/discover/manage Offers, the order book. Friendly alias: {@link SailsClient.offers} — same instance, not a separate module. */
  readonly liquidity: SailsLiquidityModule;
  /** Open/manage a Trade, real-time chat (`.chat(tradeId)`). Friendly alias: {@link SailsClient.trades} — same instance, not a separate module. */
  readonly openp2p: SailsOpenP2PModule;
  /** Escrow lifecycle: create, lock, release, refund, dispute. Friendly alias: {@link SailsClient.escrow} — same instance, not a separate module. */
  readonly settlement: SailsSettlementModule;
  /** P2P transport node — start/stop, topic/trade rooms, direct offer broadcast. No friendly alias (see docs/API_STABLE.md for why). */
  readonly peers: SailsPeersModule;
  /** RFC-013 Capability Registry — register/list/revoke capability grants. No friendly alias (see docs/API_STABLE.md for why). */
  readonly capabilities: SailsCapabilitiesModule;
  /** RFC-021 D2 — permissionless arbiter registration (register/getProfile). Only meaningful when the server is configured with ARBITRATION_MODE=market. No friendly alias. */
  readonly arbitration: SailsArbitrationModule;
  /** RFC-021 D5 — payment-account trust ramp (register/get/sign). Hash raw account identifiers client-side first with {@link hashPaymentAccount}. No friendly alias. */
  readonly paymentAccounts: SailsPaymentAccountModule;
  /** OpenProof — assert claims, submit proofs, verify, and read evidence bundles. No friendly alias. */
  readonly proof: SailsProofModule;
  /** OpenAgents — QVAC-backed structured trade/offer generation and risk assessment from a plain-language goal. Real local LLM inference server-side, requires an active session. No friendly alias. */
  readonly agents: SailsAgentsModule;
  readonly wallet?: WalletAdapter;
  private readonly intents: SailsIntentFacade;

  // ── Friendly aliases (docs/API_STABLE.md, frozen alongside the
  // protocol names above as of v0.1 — both are equally stable public
  // API, neither is deprecated or preferred). Each is the *same
  // instance* as its protocol-name counterpart, not a separate module —
  // `sdk.auth === sdk.identity`. Exists because different integrators
  // reach for different vocabulary (a P2P-trading-specific dev thinks
  // "offers/trades/escrow"; a generic wallet/fintech dev thinks
  // "auth/liquidity") and both should land on the same working code
  // without a rename. `reputation` deliberately has NO `profile` alias:
  // this module only returns a numeric trust score
  // (get/leaderboard/rate) — no displayName/avatar/trade history (that's
  // `identity`) — so `profile` would promise more than it returns.
  // `trustScore` names what it actually is instead. There is no
  // separate `chat` alias either — chat lives inside `trades`/`openp2p`
  // (`sdk.trades.chat(tradeId)`), it was never a standalone module.

  /** Alias for {@link SailsClient.identity} — the exact same instance, not a separate module. Use whichever name reads better in your codebase. */
  readonly auth: SailsIdentityModule;
  /** Alias for {@link SailsClient.liquidity} — the exact same instance, not a separate module. */
  readonly offers: SailsLiquidityModule;
  /** Alias for {@link SailsClient.openp2p} — the exact same instance, not a separate module. Chat also lives here: `sdk.trades.chat(tradeId)`. */
  readonly trades: SailsOpenP2PModule;
  /** Alias for {@link SailsClient.settlement} — the exact same instance, not a separate module. */
  readonly escrow: SailsSettlementModule;
  /** Alias for {@link SailsClient.reputation} — the exact same instance, not a separate module. Named `trustScore`, not `profile`: this module only returns a numeric score (get/leaderboard/rate), never displayName/avatar/trade history — that's {@link SailsClient.identity}. */
  readonly trustScore: SailsReputationModule;

  constructor(options: SailsClientOptions) {
    const transportOptions: SailsTransportOptions = {
      baseUrl: options.baseUrl,
    };
    if (options.fetchImpl) transportOptions.fetchImpl = options.fetchImpl;
    if (options.webSocketImpl)
      transportOptions.webSocketImpl = options.webSocketImpl;
    if (options.timeoutMs !== undefined)
      transportOptions.timeoutMs = options.timeoutMs;
    if (options.maxRetries !== undefined)
      transportOptions.maxRetries = options.maxRetries;
    if (options.retryDelayMs !== undefined)
      transportOptions.retryDelayMs = options.retryDelayMs;
    this.transport = new SailsTransport(transportOptions);

    this.identity = new SailsIdentityModule(this.transport);
    this.reputation = new SailsReputationModule(this.transport);
    this.liquidity = new SailsLiquidityModule(this.transport);
    this.openp2p = new SailsOpenP2PModule(this.transport);
    this.settlement = new SailsSettlementModule(this.transport);
    this.peers = new SailsPeersModule(this.transport);
    this.capabilities = new SailsCapabilitiesModule(this.transport);
    this.arbitration = new SailsArbitrationModule(this.transport);
    this.paymentAccounts = new SailsPaymentAccountModule(this.transport);
    this.proof = new SailsProofModule(this.transport);
    this.agents = new SailsAgentsModule(this.transport);
    this.intents = new SailsIntentFacade(this.transport);
    if (options.wallet) this.wallet = options.wallet;

    this.auth = this.identity;
    this.offers = this.liquidity;
    this.trades = this.openp2p;
    this.escrow = this.settlement;
    this.trustScore = this.reputation;
  }

  // ── Intent-oriented facade (SDK_GUIDE.md section 2) — delegates to
  // intent-facade.ts; see that file's header for exactly which of these
  // six are genuinely implemented vs. throw SailsNotImplementedError.
  createIntent: SailsIntentFacade["createIntent"] = (...args) =>
    this.intents.createIntent(...args);
  cancelIntent: SailsIntentFacade["cancelIntent"] = (...args) =>
    this.intents.cancelIntent(...args);
  negotiate: SailsIntentFacade["negotiate"] = (...args) =>
    this.intents.negotiate(...args);
  submitProof: SailsIntentFacade["submitProof"] = (...args) =>
    this.intents.submitProof(...args);
  releaseAsset: SailsIntentFacade["releaseAsset"] = (...args) =>
    this.intents.releaseAsset(...args);
  dispute: SailsIntentFacade["dispute"] = (...args) =>
    this.intents.dispute(...args);

  /**
   * Retrieve the balance of a specific asset using the injected wallet adapter.
   * @param asset - Asset identifier, e.g., "ETH" or token address.
   * @returns Promise<string> - Balance as string.
   * @throws SailsConfigError if no wallet adapter was passed to the SailsClient constructor (pass { wallet } to SailsClient options to fix).
   */
  async getBalance(asset: string): Promise<string> {
    const wallet = this.requireWallet('getBalance');
    return wallet.getBalance(asset);
  }

  /**
   * Send a transaction using the wallet adapter: sign then broadcast.
   * @param asset - Asset identifier.
   * @param tx - Transaction data to be signed (implementation‑specific).
   * @returns Promise<string> - Transaction hash/ID returned by the broadcast step.
   * @throws SailsConfigError if no wallet adapter was passed to the SailsClient constructor (pass { wallet } to SailsClient options to fix).
   */
  async sendTransaction(asset: string, tx: unknown): Promise<string> {
    const wallet = this.requireWallet('sendTransaction');
    const signed = await wallet.signTransaction(asset, tx);
    return wallet.broadcastTransaction(asset, signed);
  }

  /**
   * Retrieve the wallet capabilities via the injected wallet adapter.
   * @returns Promise<WalletCapabilitiesDeclaration>
   * @throws SailsConfigError if no wallet adapter was passed to the SailsClient constructor (pass { wallet } to SailsClient options to fix).
   */
  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    const wallet = this.requireWallet('getCapabilities');
    return wallet.getCapabilities();
  }

  /**
   * Sign an arbitrary message using the wallet adapter.
   * @param message Uint8Array message to sign.
   * @returns Promise<Uint8Array> signed message.
   * @throws SailsConfigError if no wallet adapter was passed to the SailsClient constructor (pass { wallet } to SailsClient options to fix).
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const wallet = this.requireWallet('signMessage');
    return wallet.signMessage(message);
  }

  /**
   * Get wallet addresses for all declared assets.
   * @throws SailsConfigError if no wallet adapter was passed to the SailsClient constructor (pass { wallet } to SailsClient options to fix).
   */
  async getWalletAddresses(): Promise<string[]> {
    const wallet = this.requireWallet('getWalletAddresses');
    const caps = await wallet.getCapabilities();
    const addresses = await Promise.all(
      caps.assets.map((asset) => wallet.getAddress(asset)),
    );
    return addresses;
  }

  /** Escape hatch for direct/advanced use not covered by a module above. */
  setSessionToken(token: string | null): void {
    this.transport.setSessionToken(token);
  }

  /**
   * Returns the wallet adapter, throwing a clear error if none was provided.
   * Extracted to eliminate the repetitive `if (!this.wallet)` boilerplate
   * across getBalance/sendTransaction/getCapabilities/signMessage/getWalletAddresses.
   */
  private requireWallet(methodName: string): WalletAdapter {
    if (!this.wallet) {
      throw new SailsConfigError(
        `${methodName}() requires a wallet adapter — pass { wallet: WalletAdapter } to the SailsClient constructor.`,
      );
    }
    return this.wallet;
  }

  getSessionToken(): string | null {
    return this.transport.getSessionToken();
  }
}
