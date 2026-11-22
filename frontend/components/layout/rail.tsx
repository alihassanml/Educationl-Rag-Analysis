"use client";

import { History, LogOut, Plus, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth/session-provider";
import { authApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/cn";
import { navItemsFor } from "@/lib/features";
import { useDismiss } from "@/lib/use-dismiss";
import { NotificationsButton } from "./notifications-button";

const circle = "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms]";

/** Row shared by every sidebar entry: the icon stays in place and the name sits to its right. */
const row =
  "group/row flex h-11 w-full items-center gap-3 rounded-full pr-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The name beside an icon. It fades in as the sidebar widens and clips itself, so it never spills over the page. */
function Label({ expanded, className, children }: { expanded: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,visibility] duration-200 ease-standard",
        expanded ? "visible opacity-100 delay-75" : "invisible opacity-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

function PageRow({ label, href, icon: Icon, active, expanded }: { label: string; href: string; icon: LucideIcon; active: boolean; expanded: boolean }) {
  return (
    <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cn(row, active ? "text-ink" : "text-ink-2 hover:text-ink")}>
      <span className={cn(circle, active ? "bg-paper text-ink ring-2 ring-ink" : "bg-paper/70 group-hover/row:bg-paper")}>
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <Label expanded={expanded}>{label}</Label>
    </Link>
  );
}

/** The sidebar: a slim rail of icons that widens to show their names while the cursor is over it.
 *  Chat history is its own page, so the rail holds no chat list or search. */
export function Rail({ expanded }: { expanded: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  useDismiss(account, accountOpen, () => setAccountOpen(false));

  // Study tutor is the + button, so it is not repeated as a page icon
  const pages = navItemsFor(user).filter((item) => item.href !== "/tutor");
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
    <nav aria-label="Main" className="flex h-full flex-col gap-2 px-4 py-4">
      {/* The product name, centred over the icon column so it reads the same narrow or wide */}
      <Link href="/dashboard" className="mb-2 flex h-9 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-ink">EduRAG</span>
      </Link>
      <button type="button" aria-label="New chat" onClick={newChat} className={cn(row, "text-ink")}>
        <span className={cn(circle, "bg-ink text-paper group-hover/row:bg-clay-stronger")}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <Label expanded={expanded}>New chat</Label>
      </button>

      {pages.map(({ label, href, icon }) => (
        <PageRow key={href} label={label} href={href} icon={icon} active={isActive(href)} expanded={expanded} />
      ))}

      <PageRow label="Chat history" href="/history" icon={History} active={isActive("/history")} expanded={expanded} />

      <NotificationsButton expanded={expanded} />

      <div className="flex-1" />

      <div ref={account} className="relative">
        <button
          type="button"
          aria-label="Account"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
          className={cn(row, "text-ink-2 hover:text-ink")}
        >
          <span className={cn(circle, "bg-ink text-sm font-semibold uppercase text-paper")}>{user.email.slice(0, 1)}</span>
          <Label expanded={expanded} className="text-ellipsis font-normal">
            {user.email}
          </Label>
        </button>
        {accountOpen ? (
          <div role="menu" aria-label="Account" className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-2xl border border-stone bg-paper p-2 shadow-lg">
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
