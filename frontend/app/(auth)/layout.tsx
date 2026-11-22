import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { HeroIllustration } from "@/components/landing/hero-illustration";
import { PageContainer } from "@/components/layout/page-container";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <main className="bg-paper">
        <PageContainer className="flex min-h-screen items-center">
          {/* One column: the logo, the heading and the fields share a left edge */}
          <div className="mx-auto w-full max-w-[400px]">
            <Logo className="mb-12" />
            {children}
          </div>
        </PageContainer>
      </main>
      <aside aria-label="About EduRAG" className="hidden items-center justify-center bg-stone-50 p-12 lg:flex">
        <div className="w-full max-w-[460px]">
          <HeroIllustration animated={false} />
          <p className="mt-6 text-lead text-ink">Every answer shows where it came from</p>
        </div>
      </aside>
    </div>
  );
}
