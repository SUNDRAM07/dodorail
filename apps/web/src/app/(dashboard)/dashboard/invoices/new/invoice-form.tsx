"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { createInvoiceAction, type CreateInvoiceResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type ProviderOverride = "" | "CLOAK" | "UMBRA" | "MAGICBLOCK";

interface InvoiceFormProps {
  /** The merchant's default privacy provider — used as the fallback hint
   * label in the override picker. */
  merchantDefaultProvider: "NONE" | "CLOAK" | "UMBRA" | "MAGICBLOCK";
  /** Whether the merchant has flipped Private Mode to "default ON" globally. */
  merchantPrivateModeDefault: boolean;
}

type RailOption = { id: string; label: string; feeBps: number; recommended?: boolean };

const RAILS: readonly RailOption[] = [
  { id: "SOLANA_USDC", label: "USDC on Solana", feeBps: 50, recommended: true },
  { id: "SOLANA_USDT", label: "USDT on Solana", feeBps: 50 },
  { id: "SOLANA_USDT0", label: "USDT cross-chain (USDT0)", feeBps: 75 },
  { id: "SOLANA_XAUT0", label: "Gold (XAUT0)", feeBps: 100 },
  { id: "DODO_CARD", label: "Card via Dodo", feeBps: 450 },
  { id: "DODO_UPI", label: "UPI (Indian customers)", feeBps: 250 },
  { id: "X402_AGENT", label: "Agent payment (x402)", feeBps: 10 },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> Creating…
        </>
      ) : (
        "Create invoice"
      )}
    </Button>
  );
}

const initialState: CreateInvoiceResult = { ok: false, error: "" };

export function InvoiceForm({
  merchantDefaultProvider = "NONE",
  merchantPrivateModeDefault = false,
}: Partial<InvoiceFormProps> = {}) {
  const [state, formAction] = useActionState<CreateInvoiceResult, FormData>(
    createInvoiceAction,
    initialState,
  );
  const fieldErrors = state.ok === false ? state.fieldErrors : undefined;

  const [privateMode, setPrivateMode] = useState(merchantPrivateModeDefault);
  const [providerOverride, setProviderOverride] = useState<ProviderOverride>("");

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amountUsd">Amount (USD)</Label>
          <Input
            id="amountUsd"
            name="amountUsd"
            type="number"
            step="0.01"
            min="0.50"
            placeholder="49.00"
            required
          />
          {fieldErrors?.amountUsd && (
            <p className="text-xs text-destructive">{fieldErrors.amountUsd[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customerEmail">Customer email</Label>
          <Input
            id="customerEmail"
            name="customerEmail"
            type="email"
            placeholder="buyer@example.com"
            required
          />
          {fieldErrors?.customerEmail && (
            <p className="text-xs text-destructive">{fieldErrors.customerEmail[0]}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerName">Customer name (optional)</Label>
        <Input id="customerName" name="customerName" placeholder="Acme Corp" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Acme Pro — monthly subscription"
          rows={3}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Accepted rails</legend>
        <p className="text-xs text-muted-foreground">
          Customer picks one at checkout. USDC on Solana settles instantly at 0.5% fee.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {RAILS.map((rail) => (
            <label
              key={rail.id}
              className="flex items-start gap-3 rounded-md border border-line p-3 cursor-pointer hover:border-burnt/60 has-[:checked]:border-burnt has-[:checked]:bg-burnt/5"
            >
              <input
                type="checkbox"
                name="acceptedRails"
                value={rail.id}
                defaultChecked={rail.recommended}
                className="mt-1 accent-burnt"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{rail.label}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  fee {(rail.feeBps / 100).toFixed(2)}%
                  {rail.recommended && <span className="ml-2 text-burnt">recommended</span>}
                </p>
              </div>
            </label>
          ))}
        </div>
        {fieldErrors?.acceptedRails && (
          <p className="text-xs text-destructive">{fieldErrors.acceptedRails[0]}</p>
        )}
      </fieldset>

      {/* Private mode toggle + per-invoice provider override.
          Flow:
            1. Customer ticks "Private mode"
            2. By default the merchant's settings-page provider runs
            3. Optionally override per-invoice (e.g. one invoice goes via Umbra
               for an EU customer who prefers MPC, others stay on Cloak) */}
      <fieldset className="space-y-2">
        <label className="flex items-start gap-3 rounded-md border border-line p-3 cursor-pointer hover:border-burnt/60 has-[:checked]:border-burnt has-[:checked]:bg-burnt/5">
          <input
            type="checkbox"
            name="privateMode"
            checked={privateMode}
            onChange={(e) => setPrivateMode(e.target.checked)}
            className="mt-1 accent-burnt"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">Private mode</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              shielded payment · viewing-key compliance export for audits
            </p>
          </div>
        </label>

        {privateMode && (
          <div className="ml-3 rounded-md border border-line bg-background/40 p-3 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              provider for this invoice
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <ProviderRadio
                value=""
                current={providerOverride}
                onChange={setProviderOverride}
                label={`Use merchant default${merchantDefaultProvider !== "NONE" ? ` · ${merchantDefaultProvider}` : ""}`}
                hint={
                  merchantDefaultProvider === "NONE"
                    ? "Settings → Privacy stack — pick one to enable per-merchant"
                    : "Falls back to your settings-page choice"
                }
              />
              <ProviderRadio
                value="CLOAK"
                current={providerOverride}
                onChange={setProviderOverride}
                label="Cloak"
                hint="ZK · mainnet · browser-native ~3s prove"
              />
              <ProviderRadio
                value="UMBRA"
                current={providerOverride}
                onChange={setProviderOverride}
                label="Umbra"
                hint="MPC + ZK via Arcium · mainnet + devnet"
              />
              <ProviderRadio
                value="MAGICBLOCK"
                current={providerOverride}
                onChange={setProviderOverride}
                label="MagicBlock (architectural)"
                hint="TDX-attested rollup · ships when API key lands"
              />
            </div>
            <input
              type="hidden"
              name="privateProviderOverride"
              value={providerOverride}
            />
          </div>
        )}
      </fieldset>

      {state.ok === false && state.error && state.error !== "validation" && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

function ProviderRadio({
  value,
  current,
  onChange,
  label,
  hint,
}: {
  value: ProviderOverride;
  current: ProviderOverride;
  onChange: (v: ProviderOverride) => void;
  label: string;
  hint: string;
}) {
  const selected = current === value;
  return (
    <label
      className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer text-xs ${
        selected ? "border-burnt bg-burnt/5" : "border-line hover:border-burnt/60"
      }`}
    >
      <input
        type="radio"
        name="_providerRadio"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className="mt-0.5 accent-burnt"
      />
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {hint}
        </p>
      </div>
    </label>
  );
}
