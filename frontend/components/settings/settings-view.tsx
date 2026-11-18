"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { authApi } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

/** Only what the backend returns for the account today: the email and when it was created. */
export function SettingsView() {
  const user = useUser();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await authApi.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your account details" />
      <div className="max-w-2xl">
        <Panel title="Account">
          <dl className="divide-y divide-stone text-sm">
            <div className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:gap-6">
              <dt className="w-40 shrink-0 text-ink-2">Email</dt>
              <dd className="break-all font-medium text-ink">{user.email}</dd>
            </div>
            <div className="flex flex-col gap-1 py-3 last:pb-0 sm:flex-row sm:gap-6">
              <dt className="w-40 shrink-0 text-ink-2">Member since</dt>
              <dd className="font-medium text-ink">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-stone pt-4">
            <Button variant="secondary" onClick={signOut} loading={pending}>
              {pending ? null : <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />}
              Sign out
            </Button>
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
