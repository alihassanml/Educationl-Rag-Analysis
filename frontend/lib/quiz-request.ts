/** What a student typed in Quiz me mode, read as a quiz request: how many questions, and on what.
 *  No topic means the whole of the selected material. Mirrors the server, which does the same for
 *  the written answer. */
export const DEFAULT_QUESTIONS = 5;
export const MAX_QUESTIONS = 10;

const COUNT = /(?:(?:max(?:imum)?|up\s+to|at\s+most|upto)\s*(?:of\s*)?(\d{1,3}))|(\d{1,3})\s*(?:quiz(?:zes)?|questions?|mcqs?|q\b)/i;

// Words that say what to do, not what about
const COMMAND_WORDS = new Set(
  ("a about all an and any ask at can cover covers create do for from generate give help i in is it make max maximum me most my of on please " +
    "practice practise question questions quiz quizzes revise short test the to topic topics up with write you every each everything whole entire " +
    "material materials documents document notes content sources source").split(" "),
);

export type QuizRequest = { topic: string | null; count: number };

export function parseQuizRequest(text: string): QuizRequest {
  const match = COUNT.exec(text);
  const asked = match ? Number(match[1] ?? match[2]) : DEFAULT_QUESTIONS;
  const count = Math.max(1, Math.min(asked, MAX_QUESTIONS));
  const withoutCount = text.replace(COUNT, " ").replace(/\b\d+\b/g, " ");
  const words = withoutCount.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const topicWords = words.filter((word) => !COMMAND_WORDS.has(word.toLowerCase()));
  return { topic: topicWords.length > 0 ? topicWords.join(" ") : null, count };
}
