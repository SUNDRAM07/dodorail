"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowDownToLine, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { triggerZapOutAction } from "@/app/(dashboard)/dashboard/actions";

/** One-click withdraw on an open Treasury position. Calls the server action
 * which delegates to `executeZapOut` → LP Agent submit + Prisma close +
 * `YIELD_ZAP_OUT` event. The dashboard re-renders on success.
 *
 * Mock mode is fully end-to-end safe — no real on-chain tx is submitted. */
export function ZapOutButton({ positionId }: { positionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setErr(null);
    setDone(false);
    startTransition(async () => {
      const result = await triggerZapOutAction({ positionId });
      if (result.ok) {
        setDone(true);
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={onClick} disabled={pending || done}>
        {pending ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Withdrawing…
          </>
        ) : done ? (
          <>
            <Check className="size-3 text-emerald-400" /> Withdrawn
          </>
        ) : (
          <>
            <ArrowDownToLine className="size-3" /> Withdraw
          </>
        )}
      </Button>
      {err && <span className="font-mono text-[10px] text-destructive">{err}</span>}
    </div>
  );
}
