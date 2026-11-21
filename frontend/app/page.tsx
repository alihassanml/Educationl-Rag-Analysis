import { Faq, FinalCta, SiteFooter } from "@/components/landing/faq-team-footer";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata = {
  title: "EduRAG | Study from your own notes",
  description:
    "A private tutor built only from your own study material. Every answer cites the page it came from, and EduRAG says so when your notes don't cover a question.",
};

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
