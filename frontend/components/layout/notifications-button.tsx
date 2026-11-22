"use client";

import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { notificationsApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/relative-time";
import { useDismiss } from "@/lib/use-dismiss";
import type { Notification } from "@/types/api";

const circle = "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms]";
const row =
  "group/row flex h-11 w-full items-center gap-3 rounded-full pr-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function NotificationsButton({ expanded = false }: { expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismiss(containerRef, open, () => setOpen(false));

  async function fetchNotifications() {
    try {
      setLoading(true);
      const res = await notificationsApi.list();
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch {
      // Background poll fail is silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    notificationsApi
      .list()
      .then((res) => {
        if (!active) return;
        setNotifications(res.notifications);
        setUnreadCount(res.unread_count);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      notificationsApi
        .list()
        .then((res) => {
          if (!active) return;
          setNotifications(res.notifications);
          setUnreadCount(res.unread_count);
        })
        .catch(() => {});
    }, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function handleMarkRead(id: string) {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignored
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // Ignored
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchNotifications();
        }}
        className={cn(row, "text-ink-2 hover:text-ink")}
      >
        <span className={cn(circle, "bg-paper/70 group-hover/row:bg-paper")}>
          <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              data-testid="unread-badge"
              className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-paper"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,visibility] duration-200 ease-standard",
            expanded ? "visible opacity-100 delay-75" : "invisible opacity-0"
          )}
        >
          Notifications
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute bottom-full left-0 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone bg-paper p-3 shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-stone pb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">Notifications</span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-ink">
                  {unreadCount} new
                </span>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"
              >
                <CheckCheck size={14} aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-80 overflow-y-auto space-y-2">
            {loading && notifications.length === 0 ? (
              <div className="py-6 text-center text-xs text-ink-2">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-2">No notifications yet.</div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (isUnread) handleMarkRead(n.id);
                    }}
                    className={cn(
                      "group relative rounded-xl p-2.5 text-left text-xs transition-colors",
                      isUnread ? "bg-clay-soft/60 hover:bg-clay-soft" : "hover:bg-stone-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("font-medium", isUnread ? "text-ink font-semibold" : "text-ink-2")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-ink-3">
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-ink-2 leading-relaxed">{n.body}</p>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          if (isUnread) handleMarkRead(n.id);
                          setOpen(false);
                        }}
                        className="mt-2 inline-flex items-center gap-1 font-medium text-ink hover:underline"
                      >
                        Open <ExternalLink size={12} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
