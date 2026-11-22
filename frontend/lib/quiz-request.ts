/** What a student typed in Quiz me mode, read as a quiz request: how many questions, and on what.
 *  No topic means the whole of the selected material. Mirrors the server, which does the same for
 *  the written answer. */
export const DEFAULT_QUESTIONS = 5;
/** The quiz service writes between 3 and 10 questions */
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 10;

const COUNT = /(?:(?:max(?:imum)?|up\s+to|at\s+most|upto)\s*(?:of\s*)?(\d{1,3}))|(\d{1,3})\s*(?:more\b|quiz(?:zes)?|questions?|mcqs?|q\b)|^\s*(\d{1,3})\s*$/i;

// Words that say what to do, not what about
const COMMAND_WORDS = new Set(
  ("a about all an and any ask at can cover covers create do for from generate give help i in is it make max maximum me most my of on please " +
    "practice practise question questions quiz quizzes revise short test the to topic topics up with write you every each everything whole entire " +
    "material materials documents document notes content sources source").split(" "),
);

// Words of a follow-up to the last quiz ("10 more", "another one", "again")
const FOLLOW_UP_WORDS = new Set("more another again next extra additional different new same one ones round set batch".split(" "));

export type QuizRequest = {
  topic: string | null;
  count: number;
  /** A quiz whose questions this one must not repeat ("give me 10 more") */
  excludeQuizId?: string;
};

/** The last quiz in the conversation, for a follow-up such as "give me 10 more". */
export type PreviousQuiz = { request: QuizRequest; quizId: string | null };

export function parseQuizRequest(text: string, previous: PreviousQuiz | null = null): QuizRequest {
  const match = COUNT.exec(text);
  const asked = match ? Number(match[1] ?? match[2] ?? match[3]) : DEFAULT_QUESTIONS;
  const count = Math.max(MIN_QUESTIONS, Math.min(asked, MAX_QUESTIONS));
  const withoutCount = text.replace(COUNT, " ").replace(/\b\d+\b/g, " ");
  const words = (withoutCount.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).map((w) => w.toLowerCase());
  const topicWords = words.filter((word) => !COMMAND_WORDS.has(word) && !FOLLOW_UP_WORDS.has(word));
  const allWords = (text.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).map((w) => w.toLowerCase());
  const followUp = topicWords.length === 0 && (allWords.some((w) => FOLLOW_UP_WORDS.has(w)) || /^\s*\d{1,3}\s*$/.test(text));

  if (followUp && previous) {
    // Same subject as the last quiz, new questions
    return { topic: previous.request.topic, count, ...(previous.quizId ? { excludeQuizId: previous.quizId } : {}) };
  }
  const original = (withoutCount.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).filter((w) => topicWords.includes(w.toLowerCase()));
  return { topic: original.length > 0 ? original.join(" ") : null, count };
}
