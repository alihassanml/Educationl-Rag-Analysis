"use client";

import { useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-page font-semibold tracking-tight text-ink">Chats</h1>

      <SearchInput value={query} onChange={setQuery} label="Search chats" size="lg" autoFocus className="mt-6" />

      {threads.error ? <p className="mt-6 text-ink-2">{threads.error.message}</p> : null}
      {threads.loading && all.length === 0 ? <p className="mt-6 text-ink-2">Loading chats</p> : null}
      {!threads.loading && !threads.error && all.length === 0 ? <p className="mt-6 text-ink-2">Your chats are saved here. Press + to start one</p> : null}
      {all.length > 0 && shown.length === 0 ? <p className="mt-6 text-ink-2">No chats match “{query.trim()}”</p> : null}

      <ChatList threads={shown} onChanged={threads.reload} />
    </div>
  );
}
