"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";

export function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
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
    <div className="flex flex-col gap-1 border-t border-stone pt-3">
      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium text-ink-2 hover:bg-stone-100 hover:text-ink"
      >
        <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
        Settings
      </Link>
      <p className="truncate px-3 pt-2 text-small text-ink-2" title={user.email}>
        {user.email}
      </p>
      <Button variant="ghost" onClick={signOut} loading={pending} className="justify-start">
        {pending ? null : <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />}
        Sign out
      </Button>
    </div>
  );
}
