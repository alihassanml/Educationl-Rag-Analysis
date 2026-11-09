"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PAGE_GUTTER } from "./page-container";
import { AccountMenu } from "./account-menu";
import { SidebarNav } from "./sidebar-nav";

function Brand() {
  return <span className="text-lg font-semibold tracking-tight text-foreground">EduRAG</span>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-58 shrink-0 border-r border-border bg-surface-2 lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-6 px-4 py-6">
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
        <div className="glass sticky top-0 z-30 border-b lg:hidden">
          <div className={cn("flex h-14 items-center justify-between", PAGE_GUTTER)}>
            <Brand />
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-control text-foreground hover:bg-background"
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
          {menuOpen ? (
            <div id="mobile-nav" className={cn("border-t border-border py-3", PAGE_GUTTER)}>
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
              <div className="mt-4">
                <AccountMenu />
              </div>
            </div>
          ) : null}
        </div>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
