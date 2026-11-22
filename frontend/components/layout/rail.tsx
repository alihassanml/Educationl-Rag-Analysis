"use client";

import { History, LogOut, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth/session-provider";
import { authApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/features";
import { useDismiss } from "@/lib/use-dismiss";

const circle =
  "relative inline-flex size-11 items-center justify-center rounded-full transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2";

/** A rail button with its name shown beside it on hover and keyboard focus. */
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <span
        role="presentation"
        className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-small font-medium text-paper opacity-0 shadow-md transition-opacity duration-[120ms] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

type Props = {
  historyOpen: boolean;
  onToggleHistory: () => void;
  onSearch: () => void;
};

/** The slim icon rail: new chat, search, pages, history, and the account at the bottom. */
export function Rail({ historyOpen, onToggleHistory, onSearch }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  useDismiss(account, accountOpen, () => setAccountOpen(false));

  // Study tutor is the + button, so it is not repeated as a page icon
  const pages = navItems().filter((item) => item.href !== "/tutor" && (!item.adminOnly || user.is_admin));
  const stopDismiss = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  function newChat() {
    window.dispatchEvent(new Event(NEW_CHAT_EVENT)); // an open chat screen resets itself
    if (!pathname.startsWith("/tutor")) router.push("/tutor");
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await authApi.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <nav aria-label="Main" className="flex h-full flex-col items-center gap-3 py-4">
      <Tip label="New chat">
        <button type="button" aria-label="New chat" onClick={newChat} className={cn(circle, "bg-ink text-paper hover:bg-clay-stronger focus-visible:outline-ink")}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tip>
      <Tip label="Search chats">
        <button type="button" aria-label="Search chats" onClick={onSearch} {...stopDismiss} className={cn(circle, "bg-paper text-ink-2 hover:text-ink focus-visible:outline-ink")}>
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tip>

      {pages.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Tip key={href} label={label}>
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(circle, "focus-visible:outline-ink", active ? "bg-paper text-ink ring-2 ring-ink" : "bg-paper/70 text-ink-2 hover:bg-paper hover:text-ink")}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </Tip>
        );
      })}

      <Tip label="Chat history">
        <button
          type="button"
          aria-label="Chat history"
          aria-expanded={historyOpen}
          onClick={onToggleHistory}
          {...stopDismiss}
          className={cn(circle, "focus-visible:outline-ink", historyOpen ? "bg-paper text-ink ring-2 ring-ink" : "bg-paper/70 text-ink-2 hover:bg-paper hover:text-ink")}
        >
          <History size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tip>

      <div ref={account} className="relative mt-auto">
        <button
          type="button"
          aria-label="Account"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
          className={cn(circle, "bg-ink text-sm font-semibold uppercase text-paper focus-visible:outline-ink")}
        >
          {user.email.slice(0, 1)}
        </button>
        {accountOpen ? (
          <div role="menu" aria-label="Account" className="absolute bottom-0 left-full z-50 ml-3 w-60 rounded-2xl border border-stone bg-paper p-2 shadow-lg">
            <p className="truncate px-3 py-2 text-small text-ink-2" title={user.email}>
              {user.email}
            </p>
            <Link
              role="menuitem"
              href="/settings"
              onClick={() => setAccountOpen(false)}
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-ink hover:bg-stone-100"
            >
              <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
              Settings
            </Link>
            <button type="button" role="menuitem" onClick={signOut} disabled={signingOut} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-ink hover:bg-stone-100 disabled:opacity-60">
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              {signingOut ? "Signing out" : "Sign out"}
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
