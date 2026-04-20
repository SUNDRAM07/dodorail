import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceForm } from "./invoice-form";

export const metadata = {
  title: "New invoice",
};

export default function NewInvoicePage() {
  return (
    <div className="container max-w-2xl py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-burnt mb-6"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>New invoice</CardTitle>
          <CardDescription>
            Create a customer-facing payment link. We&apos;ll generate a Dodo checkout session + a
            Solana Pay URL + the agent-ready x402 header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceForm />
        </CardContent>
      </Card>
    </div>
  );
}
