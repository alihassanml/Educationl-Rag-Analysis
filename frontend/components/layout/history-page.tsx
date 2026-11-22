"use client";

import { Pencil, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Menu } from "@/components/ui/menu";
import { ApiError } from "@/lib/api-client";
import { tutorApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/cn";
import { formatChatDate } from "@/lib/relative-time";
import { filterThreads } from "@/lib/thread-groups";
import { useApi } from "@/lib/use-api";
import { useDismiss } from "@/lib/use-dismiss";
import type { ThreadSummary } from "@/types/api";

/** The chat in the address bar, if any. Read directly because the chat screen updates the address
 *  without a navigation when a new chat gets its first message. */
function openChatId(): string | null {
  return /^\/tutor\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null;
}

function RenameInput({ thread, onDone }: { thread: ThreadSummary; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(thread.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <input
      ref={ref}
      aria-label="Chat title"
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value.trim() || null);
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone(null);
        }
      }}
      onBlur={() => onDone(null)}
      className="h-10 w-full rounded-lg border border-stone-strong bg-paper px-3 text-base text-ink"
    />
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const threads = useApi(tutorApi.threads); // read again on every opening, so it is never stale
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ThreadSummary | null>(null);
  const [pending, setPending] = useState(false);
  const active = openChatId();

  const all = threads.data ?? [];
  const shown = filterThreads(all, query);

  async function rename(thread: ThreadSummary, title: string | null) {
    setRenaming(null);
    if (!title || title === thread.title) return;
    try {
      await tutorApi.renameThread(thread.id, title);
      threads.reload();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be renamed.");
    }
  }

  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await tutorApi.deleteThread(deleting.id);
      threads.reload();
      if (deleting.id === active) window.dispatchEvent(new Event(NEW_CHAT_EVENT)); // the open chat is gone
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be deleted.");
    } finally {
      setPending(false);
      setDeleting(null);
    }
  }

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

      {notice ? (
        <p role="alert" className="mt-4 text-small text-danger">
          {notice}
        </p>
      ) : null}
      {threads.error ? <p className="mt-6 text-ink-2">{threads.error.message}</p> : null}
      {threads.loading && all.length === 0 ? <p className="mt-6 text-ink-2">Loading chats</p> : null}
      {!threads.loading && !threads.error && all.length === 0 ? <p className="mt-6 text-ink-2">Your chats are saved here. Press + to start one</p> : null}
      {all.length > 0 && shown.length === 0 ? <p className="mt-6 text-ink-2">No chats match “{query.trim()}”</p> : null}

      <ul className="mt-4 divide-y divide-stone">
        {shown.map((thread) => (
          <li key={thread.id} className="group relative flex items-center gap-2">
            {renaming === thread.id ? (
              <div className="w-full py-2">
                <RenameInput thread={thread} onDone={(title) => void rename(thread, title)} />
              </div>
            ) : (
              <>
                <Link
                  href={`/tutor/${thread.id}`}
                  aria-current={thread.id === active ? "page" : undefined}
                  onClick={onClose}
                  className="flex min-w-0 flex-1 items-center justify-between gap-6 rounded-lg py-4 pr-1 hover:text-accent-ink"
                >
                  <span className={cn("truncate text-base text-ink", thread.id === active && "font-medium")}>{thread.title}</span>
                  <span className="shrink-0 text-sm text-ink-2" title={new Date(thread.updated_at).toLocaleString("en")}>
                    {formatChatDate(thread.updated_at)}
                  </span>
                </Link>
                <Menu
                  label={`Options for ${thread.title}`}
                  items={[
                    { label: "Rename", icon: Pencil, onSelect: () => setRenaming(thread.id) },
                    { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleting(thread) },
                  ]}
                  triggerClassName="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                />
              </>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.title}”` : "Delete chat"}
        description="This removes the chat, its answers and their feedback. Your documents are not affected."
        confirmLabel="Delete chat"
        pending={pending}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** Every chat on a full page that slides in from the left beside the rail, with one wide search
 *  bar on top. No filters or tabs: finding a chat is just typing. */
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
        // Below the top bar on small screens; beside the 76px rail from lg, matching the content panel's rounded corner
        "fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto bg-paper lg:inset-y-0 lg:left-[76px] lg:right-0 lg:rounded-l-[28px]",
        open ? "drawer-in" : "drawer-out",
      )}
    >
      <Body key={session} onClose={onClose} />
    </div>
  );
}
