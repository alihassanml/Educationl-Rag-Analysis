"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A 401 here just means "not signed in"; the API client does not redirect for /auth/ paths
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then(() => setSignedIn(true))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const cta = signedIn ? (
    <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
  ) : (
    <>
      <ButtonLink href="/login" variant="ghost">
        Sign in
      </ButtonLink>
      <ButtonLink href="/register">Get started</ButtonLink>
    </>
  );

  return (
    <header className={cn("sticky top-0 z-40 border-b bg-paper transition-shadow duration-[180ms]", scrolled ? "border-stone shadow-md" : "border-transparent")}>
      <div className="flex h-16 w-full items-center justify-between gap-6 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Logo className="justify-self-start" />
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-1 rounded-full border border-stone bg-paper p-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="block rounded-full px-4 py-1.5 text-sm font-medium text-ink-2 hover:bg-stone-100 hover:text-ink">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center justify-end gap-2 lg:flex">{cta}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-stone-strong bg-paper text-ink hover:bg-stone-100 lg:hidden"
        >
          {open ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      </div>
      {open ? (
        <div id="landing-menu" className="border-t border-stone bg-paper shadow-md lg:hidden">
          <div className="flex flex-col gap-1 px-4 py-3 sm:px-6">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex h-10 items-center rounded-control px-3 text-sm font-medium text-ink hover:bg-stone-100">
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">{cta}</div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
