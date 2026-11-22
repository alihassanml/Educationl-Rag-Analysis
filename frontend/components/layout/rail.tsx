"use client";

import { History, LogOut, Plus, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUser } from "@/components/auth/session-provider";
import { authApi, tutorApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/features";
import { filterThreads } from "@/lib/thread-groups";
import { useApi } from "@/lib/use-api";
import { useDismiss } from "@/lib/use-dismiss";
import { ChatList } from "./chat-list";

/** Width of the sidebar's content when open; the 16px side padding is added around it */
const OPEN_INNER = "w-[248px]";

const circle =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms]";

/** Fades in as the sidebar widens, and out before it narrows. */
const reveal = (expanded: boolean) =>
  cn("transition-[opacity,visibility] duration-200 ease-standard", expanded ? "visible opacity-100 delay-75" : "invisible opacity-0");

/** The name beside an icon. It takes the room left in the row and clips itself, so while the sidebar
 *  widens the text is uncovered in place instead of spilling over the page. */
function Label({ expanded, className, children }: { expanded: boolean; className?: string; children: ReactNode }) {
  return <span className={cn("min-w-0 flex-1 overflow-hidden whitespace-nowrap", reveal(expanded), className)}>{children}</span>;
}

/** A row whose name shows on hover while the sidebar is narrow. Open, the name is written beside the icon. */
function Tip({ label, show, children }: { label: string; show: boolean; children: ReactNode }) {
  return (
    <div className="group relative">
      {children}
      {show ? (
        <span
          role="presentation"
          className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-small font-medium text-paper opacity-0 shadow-md transition-opacity duration-[120ms] group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Row layout shared by every sidebar entry: the icon stays in place and the name sits to its right. */
const row = "flex h-11 w-full items-center gap-3 rounded-full pr-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function RecentChats({ expanded, query }: { expanded: boolean; query: string }) {
  const threads = useApi(tutorApi.threads);
  const pathname = usePathname();
  const { reload } = threads;
  // Read again whenever the sidebar opens or a chat is opened or created, so the list is never stale.
  // The first run is skipped: mounting has just read it.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (expanded) reload();
  }, [expanded, pathname, reload]);

  const all = threads.data ?? [];
  const shown = filterThreads(all, query);
  const hint = threads.error
    ? threads.error.message
    : threads.loading && all.length === 0
      ? "Loading chats"
      : all.length === 0
        ? "Your chats are saved here. Press + to start one"
        : shown.length === 0
          ? `No chats match “${query.trim()}”`
          : null;

  return (
    <section aria-label="Recent chats" aria-hidden={expanded ? undefined : true} inert={!expanded} className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", reveal(expanded))}>
      {/* A fixed width inside, so titles do not re-wrap while the sidebar changes size */}
      <div className={cn("flex min-h-0 flex-1 flex-col", OPEN_INNER)}>
        <h2 className="px-3 pb-1.5 pt-3 text-small font-medium text-ink-2">Recents</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hint ? <p className="px-3 py-2 text-small text-ink-2">{hint}</p> : null}
          <ChatList threads={shown} variant="rail" onChanged={reload} />
        </div>
      </div>
    </section>
  );
}

type Props = {
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
};

/** The sidebar: a slim icon rail that widens in place to show every name and the recent chats. */
export function Rail({ expanded, onToggle, onExpand }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [query, setQuery] = useState("");
  // The chat list is first read when the sidebar first opens, then kept so it can fade out
  const [listMounted, setListMounted] = useState(expanded);
  if (expanded && !listMounted) setListMounted(true);
  const account = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useDismiss(account, accountOpen, () => setAccountOpen(false));

  // Study tutor is the + button, so it is not repeated as a page icon
  const pages = navItems().filter((item) => item.href !== "/tutor" && (!item.adminOnly || user.is_admin));

  function newChat() {
    window.dispatchEvent(new Event(NEW_CHAT_EVENT)); // an open chat screen resets itself
    if (!pathname.startsWith("/tutor")) router.push("/tutor");
  }

  function openSearch() {
    onExpand();
    // After the open sidebar is on screen; the box has no width while the sidebar is narrow
    requestAnimationFrame(() => search.current?.focus());
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
      <Tip label="New chat" show={!expanded}>
        <button type="button" aria-label="New chat" onClick={newChat} className={cn(row, "group/row text-ink")}>
          <span className={cn(circle, "bg-ink text-paper group-hover/row:bg-clay-stronger")}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <Label expanded={expanded}>New chat</Label>
        </button>
      </Tip>

      <Tip label="Search chats" show={!expanded}>
        <div className={cn(row, "group/row relative text-ink-2")}>
          <button
            type="button"
            aria-label="Search chats"
            onClick={openSearch}
            className={cn(circle, "bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink")}
          >
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <input
            ref={search}
            type="search"
            aria-label="Search chats"
            placeholder="Search chats"
            value={query}
            tabIndex={expanded ? undefined : -1}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-full bg-paper/60 px-4 pr-9 text-sm text-ink transition-opacity duration-200 ease-standard placeholder:text-ink-2 focus-visible:bg-paper focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-ink [&::-webkit-search-cancel-button]:hidden",
              expanded ? "opacity-100 delay-75" : "pointer-events-none opacity-0",
            )}
          />
          {query && expanded ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
              className="absolute right-6 inline-flex size-7 items-center justify-center rounded-full text-ink-2 hover:bg-stone-100 hover:text-ink"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </Tip>

      {pages.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Tip key={href} label={label} show={!expanded}>
            <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cn(row, "group/row", active ? "text-ink" : "text-ink-2 hover:text-ink")}>
              <span className={cn(circle, active ? "bg-paper text-ink ring-2 ring-ink" : "bg-paper/70 group-hover/row:bg-paper")}>
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <Label expanded={expanded}>{label}</Label>
            </Link>
          </Tip>
        );
      })}

      <Tip label="Chat history" show={!expanded}>
        <button
          type="button"
          aria-label="Chat history"
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(row, "group/row", expanded ? "text-ink" : "text-ink-2 hover:text-ink")}
        >
          <span className={cn(circle, expanded ? "bg-paper text-ink ring-2 ring-ink" : "bg-paper/70 group-hover/row:bg-paper")}>
            <History size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <Label expanded={expanded}>Chat history</Label>
        </button>
      </Tip>

      {listMounted ? <RecentChats expanded={expanded} query={query} /> : <div className="flex-1" />}

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
          <Label expanded={expanded} className="text-ellipsis font-normal">{user.email}</Label>
        </button>
        {accountOpen ? (
          <div
            role="menu"
            aria-label="Account"
            className={cn(
              "absolute z-50 w-60 rounded-2xl border border-stone bg-paper p-2 shadow-lg",
              expanded ? "bottom-full left-0 mb-2" : "bottom-0 left-full ml-3",
            )}
          >
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
