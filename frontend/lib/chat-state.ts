import type { SseEvent } from "./sse";

/** A source shown with an answer. Markers come from the backend and are never renumbered. */
export type Source = {
  marker: number;
  chunkId: string | null;
  documentId: string | null;
  title: string;
  page: number | null;
  /** Chapter or heading the passage sits under, when the document has one */
  section: string | null;
  /** A lecture passage: seconds into the video, and the link that opens it there */
  startSeconds: number | null;
  url: string | null;
  /** From the student's teacher material */
  isTeacher: boolean;
  snippet: string;
  deleted: boolean;
};

export type LiveStage = "rewriting" | "searching" | "writing";

export type LiveAnswer = {
  stage: LiveStage | null;
  sources: Source[];
  text: string;
  status: "streaming" | "complete" | "stopped" | "failed";
  abstained: boolean;
  simplified: boolean;
  teacherStyle: boolean;
  messageId?: string;
  standaloneQuery?: string;
  rewriteUsed: boolean;
  unknownMarkers: number[];
  error?: string;
};

export const initialLive = (): LiveAnswer => ({
  stage: null,
  sources: [],
  text: "",
  status: "streaming",
  abstained: false,
  simplified: false,
  teacherStyle: false,
  rewriteUsed: false,
  unknownMarkers: [],
});

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const STAGES: LiveStage[] = ["rewriting", "searching", "writing"];

function toSource(raw: unknown): Source | null {
  if (!isObj(raw) || typeof raw.marker !== "number") return null;
  return {
    marker: raw.marker,
    chunkId: typeof raw.chunk_id === "string" ? raw.chunk_id : null,
    documentId: typeof raw.document_id === "string" ? raw.document_id : null,
    title: typeof raw.document_title === "string" ? raw.document_title : "Document",
    page: typeof raw.page_number === "number" ? raw.page_number : null,
    section: typeof raw.section_title === "string" && raw.section_title ? raw.section_title : null,
    startSeconds: typeof raw.start_seconds === "number" ? raw.start_seconds : null,
    url: typeof raw.source_url === "string" && raw.source_url ? raw.source_url : null,
    isTeacher: raw.is_teacher === true,
    snippet: typeof raw.snippet === "string" ? raw.snippet : "",
    deleted: false,
  };
}

/** Fold one server event into the answer being written. Unknown or malformed events change nothing. */
export function applyEvent(state: LiveAnswer, { event, data }: SseEvent): LiveAnswer {
  switch (event) {
    case "status":
      return isObj(data) && STAGES.includes(data.stage as LiveStage) ? { ...state, stage: data.stage as LiveStage } : state;
    case "sources":
      return Array.isArray(data)
        ? { ...state, sources: data.map(toSource).filter((s): s is Source => s !== null) }
        : state;
    case "token":
      return isObj(data) && typeof data.text === "string" ? { ...state, text: state.text + data.text } : state;
    case "done":
      return isObj(data)
        ? {
            ...state,
            stage: null,
            status: "complete",
            abstained: data.abstained === true,
            simplified: data.simplified === true,
            teacherStyle: data.teacher_style === true,
            messageId: typeof data.message_id === "string" ? data.message_id : undefined,
            standaloneQuery: typeof data.standalone_query === "string" ? data.standalone_query : undefined,
            rewriteUsed: data.rewrite_used === true,
            unknownMarkers: Array.isArray(data.unknown_markers) ? data.unknown_markers.filter((n): n is number => typeof n === "number") : [],
          }
        : state;
    case "error":
      return {
        ...state,
        stage: null,
        status: "failed",
        error: isObj(data) && typeof data.message === "string" ? data.message : "Something went wrong. Please try again.",
      };
    default:
      return state;
  }
}

/** The student pressed Stop: keep what was written so far. */
export const markStopped = (state: LiveAnswer): LiveAnswer => ({ ...state, stage: null, status: "stopped" });
