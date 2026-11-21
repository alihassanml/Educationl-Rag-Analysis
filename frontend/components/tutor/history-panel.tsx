"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { filterThreads, groupThreads } from "@/lib/thread-groups";
import type { ThreadSummary } from "@/types/api";

type Props = {
  threads: ThreadSummary[];
  loading?: boolean;
  error?: string | null;
  activeId: string | null;
  onNewChat: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Called after a chat is opened, so a sheet holding this list can close. */
  onNavigate?: () => void;
};

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
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(null)}
      className="h-9 w-full rounded-control border border-stone-strong bg-paper px-3 text-sm text-ink"
    />
  );
}

/** Past chats, grouped by day. The active chat uses the same style as the active nav item. */
export function HistoryPanel({ threads, loading, error, activeId, onNewChat, onRename, onDelete, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ThreadSummary | null>(null);
  const [pending, setPending] = useState(false);

  const groups = groupThreads(filterThreads(threads, query));

  async function finishRename(thread: ThreadSummary, title: string | null) {
    setRenaming(null);
    if (title && title !== thread.title) await onRename(thread.id, title);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setPending(true);
    try {
      await onDelete(deleting.id);
    } finally {
      setPending(false);
      setDeleting(null);
    }
  }

  return (
    <nav aria-label="Chat history" className="flex flex-col gap-4">
      <Button onClick={onNewChat} className="w-full">
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
        New chat
      </Button>
      <input
        type="search"
        aria-label="Search chats"
        placeholder="Search chats"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 w-full rounded-control border border-stone-strong bg-paper px-3 text-sm text-ink placeholder:text-ink-3"
      />
      {error ? <p className="text-small text-danger">{error}</p> : null}
      {loading && threads.length === 0 ? <p className="text-small text-ink-2">Loading chats</p> : null}
      {!loading && !error && threads.length === 0 ? <p className="text-small text-ink-2">Your chats are saved here</p> : null}
      {threads.length > 0 && groups.length === 0 ? <p className="text-small text-ink-2">No chats match your search</p> : null}

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{group.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {group.threads.map((thread) => {
              const active = thread.id === activeId;
              return (
                <li key={thread.id} className={cn("group relative flex items-center rounded-control", active && "bg-clay-soft")}>
                  {active ? <span aria-hidden="true" className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-clay" /> : null}
                  {renaming === thread.id ? (
                    <div className="w-full p-1">
                      <RenameInput thread={thread} onDone={(title) => void finishRename(thread, title)} />
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/tutor/${thread.id}`}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                        className={cn("min-w-0 flex-1 truncate rounded-control px-3 py-2 text-sm", active ? "font-medium text-clay-stronger" : "text-ink hover:bg-stone-100")}
                      >
                        {thread.title}
                      </Link>
                      <Menu
                        label={`Options for ${thread.title}`}
                        items={[
                          { label: "Rename", icon: Pencil, onSelect: () => setRenaming(thread.id) },
                          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleting(thread) },
                        ]}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.title}”` : "Delete chat"}
        description="This removes the chat, its answers and their feedback. Your documents are not affected."
        confirmLabel="Delete chat"
        pending={pending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </nav>
  );
}
