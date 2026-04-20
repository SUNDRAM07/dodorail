import Link from "next/link";
import { BRAND } from "@dodorail/sdk";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="wordmark text-burnt text-sm">404 · not found</p>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">
        This rail doesn&apos;t exist — yet.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Drop back to the homepage, or ping us on X at{" "}
        <a href={BRAND.social.xUrl} className="underline underline-offset-4 hover:text-burnt">
          {BRAND.social.x}
        </a>{" "}
        if you expected to find something here.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Back to {BRAND.name}</Link>
      </Button>
    </main>
  );
}
