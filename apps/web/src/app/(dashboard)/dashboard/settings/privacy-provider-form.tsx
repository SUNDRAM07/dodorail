"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { updatePrivacyProviderAction } from "./actions";

type Provider = "NONE" | "CLOAK" | "UMBRA" | "MAGICBLOCK";

interface ProviderOption {
  id: Provider;
  label: string;
  network: string;
  status: "live" | "architectural" | "off";
  blurb: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "CLOAK",
    label: "Cloak",
    network: "mainnet only",
    status: "live",
    blurb:
      "Browser-native Groth16 ZK proofs, ~3s prove, mainnet shielded pool. Strongest narrative match for the Cloak track.",
  },
  {
    id: "UMBRA",
    label: "Umbra",
    network: "mainnet + devnet",
    status: "live",
    blurb:
      "MPC + ZK via Arcium. Encrypted Token Accounts + private transfers + viewing keys. Ships on devnet so you can test for free.",
  },
  {
    id: "MAGICBLOCK",
    label: "MagicBlock Private Payments",
    network: "TDX-attested rollups",
    status: "architectural",
    blurb:
      "Hardware-attested privacy via Intel TDX. Architectural-only in DodoRail today — flips to live once we have a MagicBlock API key.",
  },
  {
    id: "NONE",
    label: "None",
    network: "no shielding",
    status: "off",
    blurb: "Disable Private Mode for this merchant. Invoices will not offer the privacy path.",
  },
];

export function PrivacyProviderForm({
  initialProvider,
  initialPrivateModeDefault,
}: {
  initialProvider: Provider;
  initialPrivateModeDefault: boolean;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [privateModeDefault, setPrivateModeDefault] = useState(initialPrivateModeDefault);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    provider !== initialProvider || privateModeDefault !== initialPrivateModeDefault;

  function onSave() {
    setErr(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("provider", provider);
      if (privateModeDefault) formData.set("privateModeDefault", "on");
      const result = await updatePrivacyProviderAction(undefined, formData);
      if (result.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {PROVIDERS.map((p) => {
          const selected = provider === p.id;
          return (
            <label
              key={p.id}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${
                selected
                  ? "border-burnt bg-burnt/5"
                  : "border-line hover:border-burnt/60"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={selected}
                onChange={() => setProvider(p.id)}
                className="mt-1 accent-burnt"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.label}</p>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {p.network}
                  </span>
                  {p.status === "live" && (
                    <span className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px font-mono text-[9px] uppercase text-emerald-400">
                      live
                    </span>
                  )}
                  {p.status === "architectural" && (
                    <span className="rounded-sm border border-line bg-background/60 px-1.5 py-px font-mono text-[9px] uppercase text-muted-foreground">
                      architectural
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
              </div>
            </label>
          );
        })}
      </div>

      <label className="flex items-start gap-3 rounded-md border border-line p-3 cursor-pointer hover:border-burnt/60 has-[:checked]:border-burnt has-[:checked]:bg-burnt/5">
        <input
          type="checkbox"
          checked={privateModeDefault}
          onChange={(e) => setPrivateModeDefault(e.target.checked)}
          className="mt-1 accent-burnt"
          disabled={provider === "NONE"}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">
            Default Private Mode to ON for all new invoices
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            merchants can still untick per-invoice. opt-in by default = stronger compliance posture.
          </p>
        </div>
      </label>

      <div className="flex items-center justify-between">
        <div className="text-xs">
          {savedAt && !dirty && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check className="size-3" /> Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          {err && <span className="text-destructive">{err}</span>}
        </div>
        <Button onClick={onSave} disabled={!dirty || pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}
