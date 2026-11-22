"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/components/auth/session-provider";
import { cn } from "@/lib/cn";
import { NAV_GROUP_LABELS, navItemsFor, type NavGroup } from "@/lib/features";

const GROUP_ORDER: NavGroup[] = ["learn", "practise", "insights"];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useUser();
  const items = navItemsFor(user);

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1.5 px-3 text-small font-medium text-ink-2">{NAV_GROUP_LABELS[group]}</p>
            <ul className="flex flex-col gap-0.5">
              {groupItems.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-[120ms]",
                        active ? "bg-clay-soft text-accent-ink" : "text-ink-2 hover:bg-stone-100 hover:text-ink",
                      )}
                    >
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
