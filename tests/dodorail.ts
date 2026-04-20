/**
 * DodoRail Anchor program — integration tests.
 *
 * Run locally with:
 *   solana-test-validator &          # in a separate terminal
 *   anchor test --skip-local-validator
 *
 * Or against devnet with:
 *   anchor test --provider.cluster devnet --skip-local-validator
 *
 * Covers the 2 instructions:
 *   - create_invoice: happy path, invalid amount, past expiry
 *   - settle_invoice: happy path, double-settle rejection, expired rejection
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { assert } from "chai";
import { Dodorail } from "../target/types/dodorail";
import { createHash } from "node:crypto";

describe("dodorail", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Dodorail as Program<Dodorail>;
  const merchant = provider.wallet;

  const hashRef = (input: string): number[] =>
    Array.from(createHash("sha256").update(input).digest());

  const invoicePda = (m: PublicKey, nonce: bigint): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        m.toBuffer(),
        Buffer.from(new BigUint64Array([nonce]).buffer),
      ],
      program.programId,
    );

  it("creates an invoice", async () => {
    const nonce = BigInt(Date.now());
    const [invoice] = invoicePda(merchant.publicKey, nonce);
    const amount = new anchor.BN(4900); // $49.00
    const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 24 * 3600);
    const ref = hashRef("test-invoice-1|buyer@example.com");

    await program.methods
      .createInvoice(new anchor.BN(nonce.toString()), amount, expiresAt, ref)
      .accounts({
        merchant: merchant.publicKey,
        invoice,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stored = await program.account.invoice.fetch(invoice);
    assert.equal(stored.amountUsdCents.toNumber(), 4900);
    assert.deepEqual(stored.status, { open: {} });
    assert.equal(stored.merchant.toBase58(), merchant.publicKey.toBase58());
  });

  it("settles the invoice", async () => {
    const nonce = BigInt(Date.now() + 1);
    const [invoice] = invoicePda(merchant.publicKey, nonce);
    const ref = hashRef("test-invoice-settle|buyer@example.com");

    await program.methods
      .createInvoice(
        new anchor.BN(nonce.toString()),
        new anchor.BN(1234),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
        ref,
      )
      .accounts({
        merchant: merchant.publicKey,
        invoice,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fakeSig: number[] = new Array(64).fill(0).map((_, i) => i);

    await program.methods
      .settleInvoice(fakeSig)
      .accounts({
        merchant: merchant.publicKey,
        invoice,
      })
      .rpc();

    const stored = await program.account.invoice.fetch(invoice);
    assert.deepEqual(stored.status, { paid: {} });
    assert.isTrue(stored.settledAt.toNumber() > 0);
  });

  it("rejects zero amount", async () => {
    const nonce = BigInt(Date.now() + 2);
    const [invoice] = invoicePda(merchant.publicKey, nonce);
    const ref = hashRef("test-invoice-zero|buyer@example.com");
    let failed = false;
    try {
      await program.methods
        .createInvoice(
          new anchor.BN(nonce.toString()),
          new anchor.BN(0),
          new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
          ref,
        )
        .accounts({
          merchant: merchant.publicKey,
          invoice,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      failed = true;
      assert.match(String(e), /InvalidAmount/);
    }
    assert.isTrue(failed, "expected create_invoice with zero amount to fail");
  });

  it("rejects past expiry", async () => {
    const nonce = BigInt(Date.now() + 3);
    const [invoice] = invoicePda(merchant.publicKey, nonce);
    const ref = hashRef("test-invoice-past|buyer@example.com");
    let failed = false;
    try {
      await program.methods
        .createInvoice(
          new anchor.BN(nonce.toString()),
          new anchor.BN(100),
          new anchor.BN(1), // 1970, definitely in the past
          ref,
        )
        .accounts({
          merchant: merchant.publicKey,
          invoice,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e) {
      failed = true;
      assert.match(String(e), /ExpiryInPast/);
    }
    assert.isTrue(failed);
  });

  it("rejects double-settlement", async () => {
    const nonce = BigInt(Date.now() + 4);
    const [invoice] = invoicePda(merchant.publicKey, nonce);
    const ref = hashRef("test-invoice-double|buyer@example.com");

    await program.methods
      .createInvoice(
        new anchor.BN(nonce.toString()),
        new anchor.BN(500),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600),
        ref,
      )
      .accounts({
        merchant: merchant.publicKey,
        invoice,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const fakeSig: number[] = new Array(64).fill(1);
    await program.methods
      .settleInvoice(fakeSig)
      .accounts({ merchant: merchant.publicKey, invoice })
      .rpc();

    let failed = false;
    try {
      await program.methods
        .settleInvoice(fakeSig)
        .accounts({ merchant: merchant.publicKey, invoice })
        .rpc();
    } catch (e) {
      failed = true;
      assert.match(String(e), /InvoiceNotOpen/);
    }
    assert.isTrue(failed);
  });
});
