import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Page not found | EduRAG" };

// The link goes to the dashboard; the proxy sends signed-out visitors on to the sign-in page
export default function NotFound() {
  return (
    <main>
      <PageContainer className="max-w-xl py-16">
        <h1 className="text-page font-medium text-ink">Page not found</h1>
        <p className="mt-2 text-ink-2">This page doesn&apos;t exist or has moved. Check the address, or go back to your dashboard</p>
        <ButtonLink href="/dashboard" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </PageContainer>
    </main>
  );
}
