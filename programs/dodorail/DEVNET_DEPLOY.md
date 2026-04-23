# DodoRail Anchor Program · Devnet Deploy Guide

The program is compiled and ready at `target/deploy/dodorail.so` (205 KB BPF binary).
Program keypair at `target/deploy/dodorail-keypair.json` (keep this file — it's the program's identity; losing it means you can't upgrade).

**Program ID:** `5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`

## Option A — Fastest path (browser faucet + CLI deploy, ~5 min)

### 1. Fund your devnet wallet (the one you'll deploy from)

Pick one wallet you're willing to use as the "deployer" — it pays the ~1.5 SOL rent for the program. **Do NOT use your main mainnet wallet.** Make a fresh devnet-only wallet in Phantom:

- Phantom → Settings → Developer Settings → Testnet Mode: **on**
- Create a new account (bottom of the account list → "Add account") named "DodoRail Devnet"
- Copy the address (it's the Solana pubkey, starts with letters and numbers)

### 2. Get devnet SOL

Open [faucet.solana.com](https://faucet.solana.com/) in your browser → paste the wallet address → request 5 SOL. Solana's web faucet has gentler rate limits than the CLI airdrop.

If that's down, try [faucet.helius.dev](https://faucet.helius.dev) (signed-in with your Helius account, gets you 2 SOL).

### 3. Export that wallet's keypair to disk (one-time)

Phantom → Settings → Developer Settings → Export Private Key → paste into:

```bash
# In WSL or Linux
mkdir -p ~/.config/solana
solana-keygen recover 'prompt:?key=0/0' -o ~/.config/solana/id.json --force
# It'll prompt for your 12/24 word seed phrase. Paste it. Confirm.
```

Alternative (faster, uses the base58 private key from Phantom):

```bash
# Create a file with the private key as a JSON array of numbers
# Phantom's export gives you a base58 string. Convert once:
node -e "const bs58=require('bs58'); const key=bs58.decode('YOUR_BASE58_PRIVATE_KEY'); console.log('[' + [...key].join(',') + ']')" > ~/.config/solana/id.json
```

### 4. Point Solana CLI at devnet + verify balance

```bash
solana config set --url devnet
solana address           # should match your Phantom address
solana balance           # should show ~5 SOL
```

### 5. Deploy

From the repo root:

```bash
solana program deploy \
  --program-id target/deploy/dodorail-keypair.json \
  target/deploy/dodorail.so
```

Expected output: `Program Id: 5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`

The deploy takes ~20-40 seconds. If it fails partway (network issue), just rerun the same command — Solana's deploy is resumable.

### 6. Verify

Open the deployed program in Solana Explorer:

```
https://explorer.solana.com/address/5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt?cluster=devnet
```

You should see:
- Executable: Yes
- Owner: BPFLoaderUpgradeab1e11111111111111111111111
- Your deployer wallet as the upgrade authority

## Option B — Build + deploy from scratch on your machine

If you want to rebuild the program from source (e.g. after changes):

```bash
# One-time: install toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85.0
source $HOME/.cargo/env
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# From the repo root
cargo build-sbf --manifest-path programs/dodorail/Cargo.toml

# Then steps 1-6 from Option A
```

## Safety notes

- The program keypair at `target/deploy/dodorail-keypair.json` is committed to git. That's **intentional** — it's the program's on-chain identity, not a wallet. Anyone with it can propose an upgrade, but the upgrade authority is what actually gates it. The deploy in step 5 makes the deployer wallet the upgrade authority.
- When going to mainnet later (Day 10 per plan), we'll transfer the upgrade authority to a Squads multisig 2-of-3 (per file 23 §12 rule #23). For devnet a single-key authority is fine.
- If you lose the program keypair you **cannot upgrade the program** — you'd have to deploy to a new address. Back up `target/deploy/dodorail-keypair.json` somewhere durable.

## After deploy

Update `Anchor.toml` + `programs/dodorail/src/lib.rs` `declare_id!` only if you need to deploy to a *different* address. Today both already point at `5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`.

Run `anchor test --provider.cluster devnet --skip-local-validator --skip-build --skip-deploy` (once `anchor-cli` is installed) to exercise the 5 test cases in `tests/dodorail.ts` against your live devnet program.
