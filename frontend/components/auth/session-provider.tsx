"use client";

import { createContext, useContext, type ReactNode } from "react";
import { authApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import type { User } from "@/types/api";

const SessionContext = createContext<User | null>(null);

export function useUser(): User {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useUser must be used inside SessionProvider");
  return user;
}

/** Confirms the session with the backend before showing any student page. A 401 sends the
 *  student to the login page (handled in the API client). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, error, reload } = useApi(authApi.me);

  if (data) return <SessionContext.Provider value={data}>{children}</SessionContext.Provider>;
  if (error && error.status !== 401) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorBlock message={error.message} onRetry={reload} />
      </div>
    );
  }
  return (
    <div className="px-4 py-16">
      <LoadingBlock label="Loading your account" />
    </div>
  );
}
