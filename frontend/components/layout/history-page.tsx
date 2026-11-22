"use client";

import { Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { tutorApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { filterThreads } from "@/lib/thread-groups";
import { useApi } from "@/lib/use-api";
import { useDismiss } from "@/lib/use-dismiss";
import { ChatList } from "./chat-list";

function Body({ onClose }: { onClose: () => void }) {
  const threads = useApi(tutorApi.threads); // read again on every opening, so it is never stale
  const [query, setQuery] = useState("");
  const all = threads.data ?? [];
  const shown = filterThreads(all, query);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-8 sm:px-6 lg:pt-14">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-h1-lg font-semibold tracking-tight text-ink">Chats</h2>
        <IconButton label="Close chats" onClick={onClose}>
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="relative mt-6">
        <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-xl border border-stone bg-stone-100 pl-11 pr-11 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none! focus-visible:border-accent-link focus-visible:bg-paper focus-visible:ring-4 focus-visible:ring-clay-200 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <IconButton label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {threads.error ? <p className="mt-6 text-ink-2">{threads.error.message}</p> : null}
      {threads.loading && all.length === 0 ? <p className="mt-6 text-ink-2">Loading chats</p> : null}
      {!threads.loading && !threads.error && all.length === 0 ? <p className="mt-6 text-ink-2">Your chats are saved here. Press + to start one</p> : null}
      {all.length > 0 && shown.length === 0 ? <p className="mt-6 text-ink-2">No chats match “{query.trim()}”</p> : null}

      <ChatList threads={shown} variant="page" onOpen={onClose} onChanged={threads.reload} />
    </div>
  );
}

/** Every chat on a full page with one wide search bar on top, for small screens where there is no
 *  sidebar (from lg the sidebar expands in place instead). No filters or tabs: finding a chat is just typing. */
export function HistoryPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // The rail buttons that open the page are outside it; they toggle it themselves
  useDismiss(root, open, onClose);

  // Stays mounted while it slides out. Each opening is a new "session", so the chats are read again.
  const [mounted, setMounted] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  const [session, setSession] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMounted(true);
      setSession((n) => n + 1);
    }
  }
  if (!mounted) return null;

  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Chat history"
      aria-hidden={open ? undefined : true}
      inert={!open}
      onAnimationEnd={() => {
        if (!open) setMounted(false);
      }}
      className={cn(
        // Below the small-screen top bar; the sidebar replaces it from lg
        "fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-paper lg:hidden",
        open ? "drawer-in" : "drawer-out",
      )}
    >
      <Body key={session} onClose={onClose} />
    </div>
  );
}
