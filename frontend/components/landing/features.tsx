import { FileText, Lock } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";

/** A big heading with one short sentence: the only text any feature gets. */
function Copy({ title, body, large = false }: { title: string; body: string; large?: boolean }) {
  return (
    <div className="flex flex-col justify-center gap-4 p-8 lg:p-14">
      <h2 className={cn("text-balance font-medium tracking-[-0.03em] text-ink", large ? "text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.06]" : "text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1]")}>
        {title}
      </h2>
      <p className="max-w-[34ch] text-balance text-lead text-ink-2">{body}</p>
    </div>
  );
}

function Window({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border border-stone bg-paper shadow-lg", className)}>{children}</div>;
}

export function Features() {
  return (
    <div id="features" className="scroll-mt-16">
      {/* One large panel: text on the left, a real screenshot on a clay background on the right */}
      <section className="bg-paper">
        <PageContainer padded={false} className="pt-24 lg:pt-36">
          <Reveal className="grid overflow-hidden rounded-[28px] border border-stone lg:grid-cols-2">
            <Copy large title="It says when it doesn’t know" body="If your notes don’t cover a question, EduRAG tells you instead of guessing." />
            <div className="flex items-center bg-clay p-8 lg:p-14">
              <Window className="w-full">
                <Image src="/landing/tutor-not-found.png" alt="The study tutor saying a question is not found in the student’s material" width={1272} height={572} className="h-auto w-full" />
              </Window>
            </div>
          </Reveal>
        </PageContainer>
      </section>

      {/* Three joined rows with a visual beside each, like a bento grid */}
      <section className="bg-paper">
        <PageContainer padded={false} className="py-6 lg:py-8">
          <Reveal className="overflow-hidden rounded-[28px] border border-stone">
            <div className="grid border-b border-stone lg:grid-cols-2">
              <Copy title="Quizzes from your own files" body="See the right answer, an explanation and the source page." />
              <div className="dot-grid flex items-end justify-center bg-stone-50 px-8 pt-10 lg:border-l lg:border-stone lg:px-14">
                <Window className="h-[300px] w-full rounded-b-none border-b-0">
                  <Image src="/landing/quiz-result.png" alt="A quiz result with explanations and source pages" width={1584} height={1640} className="h-auto w-full" />
                </Window>
              </div>
            </div>

            <div className="grid border-b border-stone lg:grid-cols-2">
              <div className="dot-grid order-2 flex items-center justify-center bg-stone-50 p-8 lg:order-1 lg:border-r lg:border-stone lg:p-6">
                <Window className="w-full">
                  <Image src="/landing/progress.png" alt="Progress page with accuracy for each topic and the rule used to find weak topics" width={2000} height={880} className="h-auto w-full" />
                </Window>
              </div>
              <div className="order-1 lg:order-2">
                <Copy title="Know what to revise next" body="Your quiz results point to the topics that need more work." />
              </div>
            </div>

            <div className="grid lg:grid-cols-2">
              <Copy title="Your notes stay yours" body="Files are private to your account. Nobody else can search them." />
              <div className="dot-grid flex items-center justify-center bg-stone-50 p-12 lg:border-l lg:border-stone">
                <div className="flex items-center gap-4">
                  <span className="flex size-20 items-center justify-center rounded-2xl border border-stone bg-paper shadow-md">
                    <FileText size={32} strokeWidth={1.5} className="text-ink-2" aria-hidden="true" />
                  </span>
                  <span aria-hidden="true" className="h-px w-10 bg-stone-strong" />
                  <span className="flex size-20 items-center justify-center rounded-2xl bg-clay-strong shadow-md">
                    <Lock size={32} strokeWidth={1.5} className="text-paper" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </PageContainer>
      </section>
    </div>
  );
}
