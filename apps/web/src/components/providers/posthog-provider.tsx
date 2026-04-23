"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

/**
 * Posthog browser init + pageview tracking.
 *
 * Uses Posthog's React provider so `usePostHog()` works anywhere beneath.
 * Pageview events are fired manually on route changes because Next's App
 * Router doesn't emit a pageview event client-side the way the Pages
 * Router did.
 */

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    // Autocapture is ON by default — we explicitly opt into more.
    capture_pageview: false, // we handle manually on route changes
    capture_pageleave: true,
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true, // never record wallet addresses, emails, amounts
      maskTextSelector: "[data-ph-mask]",
    },
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug(false);
    },
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;
    let url = window.origin + pathname;
    if (searchParams?.toString()) url += `?${searchParams.toString()}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
