import { Comparison } from "@/components/landing/comparison";
import { Faq, FinalCta, SiteFooter, Team } from "@/components/landing/faq-team-footer";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteHeader } from "@/components/landing/site-header";
import { Roadmap, Teachers } from "@/components/landing/teachers-roadmap";

export const metadata = {
  title: "EduRAG | Study from your own notes",
  description:
    "A private tutor built only from your own study material. Every answer cites the page it came from, and EduRAG says so when your notes don't cover a question.",
};

// The proof strip (docs/UI_REDESIGN.md 9.3) is intentionally absent: evaluation results are admin-only in the
// API, so there is no public number to show. It will render only once a public read-only endpoint exists.
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Comparison />
        <Teachers />
        <Roadmap />
        <Faq />
        <Team />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
