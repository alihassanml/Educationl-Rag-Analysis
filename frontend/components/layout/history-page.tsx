"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { tutorApi } from "@/lib/api";
import { filterThreads } from "@/lib/thread-groups";
import { useApi } from "@/lib/use-api";
import { ChatList } from "./chat-list";

/** Every chat on one centred page with a wide search bar on top. No filters or tabs: finding a chat is just typing. */
export function HistoryPage() {
  const threads = useApi(tutorApi.threads); // read on every visit, so it is never stale
  const [query, setQuery] = useState("");
  const all = threads.data ?? [];
  const shown = filterThreads(all, query);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-8 sm:px-6 lg:pt-14">
      <h1 className="text-h1-lg font-semibold tracking-tight text-ink">Chats</h1>

      <div className="relative mt-6">
        <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
          className="h-12 w-full rounded-full border border-stone bg-stone-100 pl-11 pr-11 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none! focus-visible:border-accent-link focus-visible:bg-paper focus-visible:ring-4 focus-visible:ring-clay-200 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <IconButton label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full">
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      {threads.error ? <p className="mt-6 text-ink-2">{threads.error.message}</p> : null}
      {threads.loading && all.length === 0 ? <p className="mt-6 text-ink-2">Loading chats</p> : null}
      {!threads.loading && !threads.error && all.length === 0 ? <p className="mt-6 text-ink-2">Your chats are saved here. Press + to start one</p> : null}
      {all.length > 0 && shown.length === 0 ? <p className="mt-6 text-ink-2">No chats match “{query.trim()}”</p> : null}

      <ChatList threads={shown} onChanged={threads.reload} />
    </div>
  );
}
