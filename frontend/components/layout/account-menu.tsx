"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";

export function AccountMenu() {
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
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <p className="truncate px-3 text-sm text-muted" title={user.email}>
        {user.email}
      </p>
      <Button variant="secondary" onClick={signOut} disabled={pending} className="justify-start">
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
