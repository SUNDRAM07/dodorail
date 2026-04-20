//! # DodoRail — onchain invoice program
//!
//! Two instructions. That's it. Everything else lives offchain.
//!
//!   * `create_invoice` — writes an immutable Invoice PDA with merchant,
//!     amount, and expiry. Makes the invoice auditable on-chain so any
//!     party (merchant, customer, auditor) can verify the claim.
//!
//!   * `settle_invoice` — marks the Invoice PDA as PAID and emits an
//!     `InvoicePaid` event. Custody of settlement USDC is done via a Squads
//!     multisig vault off-program (see file 23 §12 rule #14). We are
//!     deliberately NOT a custodial program in v1.
//!
//! Design decisions (do not re-litigate — file 23):
//!
//!   * **2 instructions only.** The 5-instruction version (`authorize_ika_dwallet`,
//!     `approve_message`, `delegate_for_private_execution`) is v2, post-audit.
//!   * **No program-owned PDA escrow.** A Squads multisig vault holds the
//!     USDC and releases it based on `settle_invoice` events observed
//!     off-chain. This reduces attack surface until an audit exists.
//!   * **Upgrade authority = Squads 2-of-3 multisig**, NOT a single laptop key.
//!
//! License: MIT (see /LICENSE).

use anchor_lang::prelude::*;

declare_id!("5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt");

#[program]
pub mod dodorail {
    use super::*;

    /// Records a new Invoice on-chain. Called by the merchant (or a relayer
    /// paying on their behalf). `nonce` lets a merchant create multiple
    /// invoices in the same slot without PDA collision.
    pub fn create_invoice(
        ctx: Context<CreateInvoice>,
        nonce: u64,
        amount_usd_cents: u64,
        expires_at: i64,
        customer_ref_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount_usd_cents > 0, DodorailError::InvalidAmount);
        require!(expires_at > Clock::get()?.unix_timestamp, DodorailError::ExpiryInPast);

        let invoice = &mut ctx.accounts.invoice;
        invoice.merchant = ctx.accounts.merchant.key();
        invoice.nonce = nonce;
        invoice.amount_usd_cents = amount_usd_cents;
        invoice.expires_at = expires_at;
        invoice.customer_ref_hash = customer_ref_hash;
        invoice.status = InvoiceStatus::Open;
        invoice.created_at = Clock::get()?.unix_timestamp;
        invoice.bump = ctx.bumps.invoice;

        emit!(InvoiceCreated {
            invoice: invoice.key(),
            merchant: invoice.merchant,
            amount_usd_cents,
            expires_at,
        });
        Ok(())
    }

    /// Marks an open Invoice as PAID. The settlement authority is the
    /// merchant themselves (they confirm payment received) OR the
    /// Squads multisig signer. The program records the event; the transfer
    /// of actual USDC happened in the Squads vault via off-chain hooks.
    pub fn settle_invoice(ctx: Context<SettleInvoice>, settlement_tx_sig: [u8; 64]) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            invoice.status == InvoiceStatus::Open,
            DodorailError::InvoiceNotOpen
        );
        require!(
            Clock::get()?.unix_timestamp <= invoice.expires_at,
            DodorailError::InvoiceExpired
        );

        invoice.status = InvoiceStatus::Paid;
        invoice.settled_at = Clock::get()?.unix_timestamp;
        invoice.settlement_tx_sig = settlement_tx_sig;

        emit!(InvoicePaid {
            invoice: invoice.key(),
            merchant: invoice.merchant,
            settlement_tx_sig,
            settled_at: invoice.settled_at,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateInvoice<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,

    #[account(
        init,
        payer = merchant,
        space = Invoice::SIZE,
        seeds = [b"invoice", merchant.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub invoice: Account<'info, Invoice>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleInvoice<'info> {
    /// Either the merchant themselves OR a Squads-authorised signer. For
    /// the 2-instruction v1 we enforce equality with the invoice merchant.
    #[account(mut, address = invoice.merchant @ DodorailError::SignerNotMerchant)]
    pub merchant: Signer<'info>,

    #[account(
        mut,
        seeds = [b"invoice", invoice.merchant.as_ref(), &invoice.nonce.to_le_bytes()],
        bump = invoice.bump,
    )]
    pub invoice: Account<'info, Invoice>,
}

#[account]
pub struct Invoice {
    pub merchant: Pubkey,          // 32
    pub nonce: u64,                //  8
    pub amount_usd_cents: u64,     //  8
    pub expires_at: i64,           //  8
    pub customer_ref_hash: [u8; 32], // 32 — hash of (invoiceId|customerEmail) — zero-knowledge-friendly
    pub status: InvoiceStatus,     //  1 + 0
    pub created_at: i64,           //  8
    pub settled_at: i64,           //  8
    pub settlement_tx_sig: [u8; 64], // 64
    pub bump: u8,                  //  1
}

impl Invoice {
    // 8 (discriminator) + 32 + 8 + 8 + 8 + 32 + 1 + 8 + 8 + 64 + 1 = 178
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 32 + 1 + 8 + 8 + 64 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum InvoiceStatus {
    Open,
    Paid,
    Void,
    Expired,
}

#[event]
pub struct InvoiceCreated {
    pub invoice: Pubkey,
    pub merchant: Pubkey,
    pub amount_usd_cents: u64,
    pub expires_at: i64,
}

#[event]
pub struct InvoicePaid {
    pub invoice: Pubkey,
    pub merchant: Pubkey,
    pub settlement_tx_sig: [u8; 64],
    pub settled_at: i64,
}

#[error_code]
pub enum DodorailError {
    #[msg("Invoice amount must be > 0 cents.")]
    InvalidAmount,
    #[msg("Invoice expiry must be in the future.")]
    ExpiryInPast,
    #[msg("Invoice is not in OPEN state.")]
    InvoiceNotOpen,
    #[msg("Invoice has expired.")]
    InvoiceExpired,
    #[msg("Signer is not the invoice merchant.")]
    SignerNotMerchant,
}
