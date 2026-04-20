// Migrations are handled by the Anchor CLI; this file is a placeholder
// so the Anchor workspace resolves. Real deployments happen via:
//
//   anchor build
//   solana airdrop 2                 # devnet
//   anchor deploy --provider.cluster devnet
//   anchor idl init --provider.cluster devnet <PROGRAM_ID>
//
// Mainnet deploy is Day 10. Upgrade authority is Squads 2-of-3 multisig
// per file 23 §12 rule #23.

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (_provider: anchor.AnchorProvider) {
  // no-op — Anchor CLI handles program deploys directly.
};
