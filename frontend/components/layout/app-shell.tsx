"use client";

import { History, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AccountMenu } from "./account-menu";
import { HistoryPage } from "./history-page";
import { PAGE_GUTTER } from "./page-container";
import { Rail } from "./rail";
import { SidebarNav } from "./sidebar-nav";

export function Brand() {
  return (
    <Link href="/tutor" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-ink">
      <span aria-hidden="true" className="size-6 rounded-lg bg-clay-300" />
      EduRAG
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // the full-page history on small screens
  const [expanded, setExpanded] = useState(false); // the sidebar from lg

  return (
    <div className="min-h-screen bg-linear-to-b from-clay-300 to-clay-soft lg:flex">
      {/* Widens in place to show names and recent chats; the page beside it narrows with it, nothing slides over it */}
      <aside className={cn("hidden shrink-0 transition-[width] duration-300 ease-standard lg:block", expanded ? "w-[280px]" : "w-[76px]")}>
        <div className="sticky top-0 z-50 h-screen">
          <Rail expanded={expanded} onToggle={() => setExpanded((open) => !open)} onExpand={() => setExpanded(true)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-paper lg:rounded-l-[28px]">
        <div className="sticky top-0 z-30 border-b border-stone bg-paper lg:hidden">
          <div className={cn("flex h-14 items-center justify-between", PAGE_GUTTER)}>
            <Brand />
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Chat history"
                aria-expanded={historyOpen}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setHistoryOpen((open) => !open)}
                className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-stone-100"
              >
                <History size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-stone-100"
              >
                {menuOpen ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div id="mobile-nav" className={cn("max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-stone bg-paper py-3 shadow-md", PAGE_GUTTER)}>
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
              <div className="mt-4">
                <AccountMenu onNavigate={() => setMenuOpen(false)} />
              </div>
            </div>
          ) : null}
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <HistoryPage open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
