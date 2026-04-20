"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { disconnect } = useWallet();

  const onClick = () => {
    startTransition(async () => {
      try {
        await fetch("/api/auth/sign-out", { method: "POST" });
      } finally {
        await disconnect().catch(() => void 0);
        router.push("/");
        router.refresh();
      }
    });
  };

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} aria-label="Sign out">
      <LogOut className="size-4" />
      <span className="sr-only">Sign out</span>
    </Button>
  );
}
