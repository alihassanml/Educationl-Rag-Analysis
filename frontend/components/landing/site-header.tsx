"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/cn";

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Why EduRAG", href: "#why" },
  { label: "Evaluation", href: "#evaluation" },
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
      <PageContainer padded={false} className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          EduRAG
        </Link>
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="rounded-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-stone-100 hover:text-ink">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">{cta}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-control text-ink hover:bg-stone-100 lg:hidden"
        >
          {open ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      </PageContainer>
      {open ? (
        <div id="landing-menu" className="border-t border-stone bg-paper shadow-md lg:hidden">
          <PageContainer padded={false} className="flex flex-col gap-1 py-3">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex h-10 items-center rounded-control px-3 text-sm font-medium text-ink hover:bg-stone-100">
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">{cta}</div>
          </PageContainer>
        </div>
      ) : null}
    </header>
  );
}
