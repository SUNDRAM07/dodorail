"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { AlertCircle, CheckCircle2, Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type State =
  | { kind: "idle" }
  | { kind: "requesting_challenge" }
  | { kind: "awaiting_signature" }
  | { kind: "verifying" }
  | { kind: "success"; slug: string }
  | { kind: "error"; message: string };

export function SignInCard({ next }: { next: string }) {
  const router = useRouter();
  const { publicKey, signMessage, disconnect, wallet, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [state, setState] = useState<State>({ kind: "idle" });

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setState({ kind: "error", message: "Wallet doesn't support message signing." });
      return;
    }
    const walletAddress = publicKey.toBase58();
    setState({ kind: "requesting_challenge" });
    try {
      // 1. Ask server for a challenge message.
      const challengeRes = await fetch("/api/auth/solana/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      if (!challengeRes.ok) throw new Error(`challenge failed: ${challengeRes.status}`);
      const { message } = (await challengeRes.json()) as { message: string };

      // 2. Sign the message with the wallet.
      setState({ kind: "awaiting_signature" });
      const messageBytes = new TextEncoder().encode(message);
      const sigBytes = await signMessage(messageBytes);
      const signature = bs58.encode(sigBytes);

      // 3. POST back for verification.
      setState({ kind: "verifying" });
      const verifyRes = await fetch("/api/auth/solana/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature, walletAddress }),
      });
      if (!verifyRes.ok) {
        const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `verify failed: ${verifyRes.status}`);
      }
      const { merchant } = (await verifyRes.json()) as { merchant: { slug: string } };
      setState({ kind: "success", slug: merchant.slug });

      // 4. Navigate.
      router.push(next);
      router.refresh();
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error.",
      });
    }
  }, [publicKey, signMessage, router, next]);

  const busy =
    state.kind === "requesting_challenge" ||
    state.kind === "awaiting_signature" ||
    state.kind === "verifying";

  return (
    <Card className="w-full max-w-md bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in with your Solana wallet</CardTitle>
        <CardDescription>
          Zero password to remember. Zero email to verify. The wallet is the account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!publicKey ? (
          <Button size="lg" className="w-full" onClick={() => setVisible(true)} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="animate-spin" /> Connecting…
              </>
            ) : (
              <>
                <Wallet /> Connect wallet
              </>
            )}
          </Button>
        ) : (
          <>
            <div className="rounded-md border border-line/70 bg-background/60 px-4 py-3 font-mono text-xs">
              <p className="text-muted-foreground">Connected via {wallet?.adapter.name}</p>
              <p className="mt-1 break-all text-foreground">{publicKey.toBase58()}</p>
            </div>

            <Button size="lg" className="w-full" onClick={signIn} disabled={busy}>
              {state.kind === "requesting_challenge" && (
                <>
                  <Loader2 className="animate-spin" /> Requesting challenge…
                </>
              )}
              {state.kind === "awaiting_signature" && (
                <>
                  <Loader2 className="animate-spin" /> Check your wallet to sign…
                </>
              )}
              {state.kind === "verifying" && (
                <>
                  <Loader2 className="animate-spin" /> Verifying signature…
                </>
              )}
              {state.kind === "success" && (
                <>
                  <CheckCircle2 /> Signed in as {state.slug}
                </>
              )}
              {(state.kind === "idle" || state.kind === "error") && <>Sign message to continue</>}
            </Button>

            {state.kind === "error" && (
              <p className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{state.message}</span>
              </p>
            )}

            <Separator />

            <Button variant="ghost" size="sm" className="w-full" onClick={() => disconnect()}>
              Use a different wallet
            </Button>
          </>
        )}

        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Signing is free. No transaction. No gas.
        </p>
      </CardContent>
    </Card>
  );
}
