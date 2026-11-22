"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Button, ButtonLink } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The error itself is never shown: no stack traces or internal messages reach the screen
  return (
    <main>
      <PageContainer className="max-w-xl py-16">
        <h1 className="text-page font-semibold tracking-tight text-ink">Something went wrong</h1>
        <p className="mt-2 text-ink-2">The page could not be shown. Try again, and if it keeps happening, come back in a few minutes</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to dashboard
          </ButtonLink>
        </div>
      </PageContainer>
    </main>
  );
}
