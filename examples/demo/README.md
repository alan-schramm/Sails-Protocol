# examples/demo/

Two runnable scripts showing the full Sails Protocol ecosystem end to
end — QVAC agents, Pears P2P negotiation, the Intent Engine state
machine, and real WDK settlement — one process, no mocked pieces beyond
what each script's own header discloses.

Different from the other three `examples/` folders: this one demonstrates
the *protocol's own reference agents* (`src/modules/open-agents`) talking
to each other, not how an external wallet would integrate `@sails/sdk`.
For that, see [`../simple-wallet`](../simple-wallet) (SDK-only, ~15
minutes) or [`../wallet-integration`](../wallet-integration) (real
non-custodial wallet adapters).

## Scripts

- **`pix-to-usdt-flow.ts`** — the real flow: `SellerAgent`/`BuyerAgent`
  each generate a structured request via QVAC (local LLM inference) from
  a plain-language goal, then it walks through offer creation, OpenP2P
  negotiation over real Pears/HyperDHT, a QVAC risk check, escrow
  lock/release through OpenSettlement, and a real
  `@tetherto/wdk-wallet-evm` USDT transfer when configured. `main()` is
  exported and guarded behind `require.main === module`, so...
- **`demo-satsails-qvac.ts`** — ...this one can reuse it without
  double-running it. The `npm run demo:qvac` entrypoint — same flow,
  framed as "boot the whole ecosystem in one command."

## Run

```bash
npm run demo:qvac
```

Behavior is entirely `.env`-driven — see `.env.example` for
`DATABASE_URL`/`REDIS_URL`, `MOCK_ESCROW`, `WDK_SEED_PHRASE`/QVAC model
settings. A live Postgres/Redis (or `MOCK_ESCROW`-only) and, for the QVAC
steps, a GPU with a working Vulkan/Metal driver are the real
prerequisites — see each script's own header comment for the exact,
disclosed state of what's verified live versus only against mocks in a
given environment.
