"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu } from "@/components/ui/menu";
import { ApiError } from "@/lib/api-client";
import { tutorApi } from "@/lib/api";
import { NEW_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/cn";
import { formatChatDate } from "@/lib/relative-time";
import type { ThreadSummary } from "@/types/api";

/** The chat in the address bar, if any. Read directly because the chat screen updates the address
 *  without a navigation when a new chat gets its first message. */
export function openChatId(): string | null {
  if (typeof window === "undefined") return null;
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
      className="h-10 w-full rounded-control border border-stone-strong bg-paper px-3 text-base text-ink"
    />
  );
}

type Props = {
  threads: ThreadSummary[];
  onChanged: () => void;
};

/** Chat rows with Rename and Delete in a small menu that shows on hover. */
export function ChatList({ threads, onChanged }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ThreadSummary | null>(null);
  const [pending, setPending] = useState(false);
  const active = openChatId();

  async function rename(thread: ThreadSummary, title: string | null) {
    setRenaming(null);
    if (!title || title === thread.title) return;
    try {
      await tutorApi.renameThread(thread.id, title);
      onChanged();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be renamed.");
    }
  }

  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await tutorApi.deleteThread(deleting.id);
      onChanged();
      if (deleting.id === active) window.dispatchEvent(new Event(NEW_CHAT_EVENT)); // the open chat is gone
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "The chat could not be deleted.");
    } finally {
      setPending(false);
      setDeleting(null);
    }
  }

  return (
    <>
      {notice ? (
        <p role="alert" className="mt-4 text-small text-danger">
          {notice}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-stone">
        {threads.map((thread) => {
          const current = thread.id === active;
          return (
            <li key={thread.id} className="group relative flex items-center gap-1">
              {renaming === thread.id ? (
                <div className="w-full py-2">
                  <RenameInput thread={thread} onDone={(title) => void rename(thread, title)} />
                </div>
              ) : (
                <>
                  <Link
                    href={`/tutor/${thread.id}`}
                    aria-current={current ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center justify-between gap-6 rounded-lg py-4 pr-1 hover:text-accent-ink"
                  >
                    <span className={cn("truncate text-base text-ink", current && "font-medium")}>{thread.title}</span>
                    <span className="shrink-0 text-sm text-ink-2" title={new Date(thread.updated_at).toLocaleString("en")}>
                      {formatChatDate(thread.updated_at)}
                    </span>
                  </Link>
                  <div>
                    <Menu
                      label={`Options for ${thread.title}`}
                      items={[
                        { label: "Rename", icon: Pencil, onSelect: () => setRenaming(thread.id) },
                        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleting(thread) },
                      ]}
                      triggerClassName="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                    />
                  </div>
                </>
              )}
            </li>
          );
        })}
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
    </>
  );
}
