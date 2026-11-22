export type ExportTurn = {
  question: string;
  mode?: string;
  quiz?: { topic: string | null; count: number };
  answer: { text: string; abstained: boolean; sources: { title: string; page: number | null }[] } | null;
};

const MODE_LABEL: Record<string, string> = { quiz: "Quiz me", summary: "Summarise", simple: "Explain simply" };

/** A finished chat as Markdown the student can keep: questions, answers and the sources they cite. */
export function chatToMarkdown(title: string, turns: ExportTurn[]): string {
  const parts = [`# ${title.trim() || "Study chat"}`];
  for (const turn of turns) {
    const label = turn.mode && MODE_LABEL[turn.mode] ? ` (${MODE_LABEL[turn.mode]})` : "";
    parts.push(`## You${label}\n\n${turn.question}`);
    if (turn.quiz) {
      parts.push(`## Tutor\n\n_A ${turn.quiz.count}-question quiz${turn.quiz.topic ? ` on ${turn.quiz.topic}` : ""}. Take it in the app to see the marked result._`);
    } else if (turn.answer) {
      const text = turn.answer.abstained ? "_Not found in your material._" : turn.answer.text.trim();
      const sources = turn.answer.sources.map((s) => `- ${s.title}${s.page === null ? "" : `, page ${s.page}`}`).join("\n");
      parts.push(`## Tutor\n\n${text}${sources ? `\n\n**Sources**\n\n${sources}` : ""}`);
    }
  }
  return `${parts.join("\n\n")}\n`;
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
