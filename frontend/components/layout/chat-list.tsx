"use client";

import { MessageSquare, Pencil, Trash2 } from "lucide-react";
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

function RenameInput({ thread, compact, onDone }: { thread: ThreadSummary; compact: boolean; onDone: (title: string | null) => void }) {
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
      className={cn("w-full rounded-lg border border-stone-strong bg-paper px-3 text-ink", compact ? "h-9 text-sm" : "h-10 text-base")}
    />
  );
}

type Props = {
  threads: ThreadSummary[];
  /** "page": the full history page with dates; "rail": compact rows with an icon, inside the sidebar */
  variant: "page" | "rail";
  onOpen?: () => void;
  onChanged: () => void;
};

/** Chat rows with Rename and Delete in a small menu that shows on hover. */
export function ChatList({ threads, variant, onOpen, onChanged }: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ThreadSummary | null>(null);
  const [pending, setPending] = useState(false);
  const active = openChatId();
  const rail = variant === "rail";

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
        <p role="alert" className={cn("text-small text-danger", rail ? "px-3 py-2" : "mt-4")}>
          {notice}
        </p>
      ) : null}

      <ul className={rail ? "flex flex-col gap-0.5" : "mt-4 divide-y divide-stone"}>
        {threads.map((thread) => {
          const current = thread.id === active;
          return (
            <li key={thread.id} className="group relative flex items-center gap-1">
              {renaming === thread.id ? (
                <div className={cn("w-full", rail ? "py-0.5" : "py-2")}>
                  <RenameInput thread={thread} compact={rail} onDone={(title) => void rename(thread, title)} />
                </div>
              ) : (
                <>
                  <Link
                    href={`/tutor/${thread.id}`}
                    aria-current={current ? "page" : undefined}
                    onClick={onOpen}
                    className={
                      rail
                        ? cn(
                            "flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg pl-3 pr-9 text-sm transition-colors duration-[120ms]",
                            current ? "bg-paper font-medium text-ink" : "text-ink-2 hover:bg-paper/60 hover:text-ink",
                          )
                        : "flex min-w-0 flex-1 items-center justify-between gap-6 rounded-lg py-4 pr-1 hover:text-accent-ink"
                    }
                  >
                    {rail ? <MessageSquare size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /> : null}
                    <span className={cn("truncate", !rail && "text-base text-ink", !rail && current && "font-medium")}>{thread.title}</span>
                    {rail ? null : (
                      <span className="shrink-0 text-sm text-ink-2" title={new Date(thread.updated_at).toLocaleString("en")}>
                        {formatChatDate(thread.updated_at)}
                      </span>
                    )}
                  </Link>
                  <div className={rail ? "absolute right-1 top-1/2 -translate-y-1/2" : undefined}>
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
