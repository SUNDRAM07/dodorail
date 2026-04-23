# programs/dodorail — DodoRail Anchor Program

**Status:** ✅ Live on Solana devnet as of Day 4 (2026-04-22).
**Program ID:** [`5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`](https://explorer.solana.com/address/5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt?cluster=devnet)
**Deploy tx:** [`3o56NbRmr6abzepUCphf5u7qLTwBfzGM4m9w15ZvfPMRvJJQe75QotKrvVF1kYJzUQoU2BU6fY1cbBSejdgoAbet`](https://explorer.solana.com/tx/3o56NbRmr6abzepUCphf5u7qLTwBfzGM4m9w15ZvfPMRvJJQe75QotKrvVF1kYJzUQoU2BU6fY1cbBSejdgoAbet?cluster=devnet)
**Upgrade authority:** `12CVGCEY6tJLFCEhXhLxMMZK7bnjkJxrEowf46WFScA2` (devnet-only deployer wallet; mainnet will transfer to Squads 2-of-3)

## Scope (locked)

Two instructions only:

1. `create_invoice` — creates an on-chain Invoice PDA with `merchant`, `amount`, `expiry`. Makes the invoice auditable.
2. `settle_invoice` — marks the Invoice PDA as paid, emits a `Paid` event.

**Custody is via Squads multisig vault, NOT a program-owned PDA.** The escrow model stays custodial/multisig for v1. The 5-instruction version (with `authorize_ika_dwallet`, `approve_message`, `delegate_for_private_execution`) is v2, post-audit.

## Toolchain (to install on Day 2)

- Rust 1.85
- Anchor 0.32
- Solana CLI 2.x

## Deployment

- Day 5: deploy to devnet
- Day 10: deploy to mainnet-beta
- Upgrade authority: **Squads 2-of-3 multisig** (never a single key)

## License

MIT — see `/LICENSE`.
