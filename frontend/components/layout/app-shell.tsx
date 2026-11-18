"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PAGE_GUTTER } from "./page-container";
import { AccountMenu } from "./account-menu";
import { SidebarNav } from "./sidebar-nav";

export function Brand() {
  return (
    <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-ink">
      EduRAG
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-stone bg-paper lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto px-4 py-6">
          <div className="px-3">
            <Brand />
          </div>
          <SidebarNav />
          <div className="mt-auto">
            <AccountMenu />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 border-b border-stone bg-paper lg:hidden">
          <div className={cn("flex h-14 items-center justify-between", PAGE_GUTTER)}>
            <Brand />
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-control text-ink hover:bg-stone-100"
            >
              {menuOpen ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
            </button>
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
    </div>
  );
}
