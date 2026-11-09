import type { ReactNode } from "react";
import { SessionProvider } from "@/components/auth/session-provider";
import { AppShell } from "@/components/layout/app-shell";

// Pages here are client-rendered shells with their own loading states; skip dev-only prefetch insights
export const instant = false;

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
