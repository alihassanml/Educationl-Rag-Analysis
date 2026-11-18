import { SourceCard } from "@/components/ui/citation";
import { pageText, type Source } from "./sources";

/** Sources of the selected answer. The API returns document and page for each citation (no snippet yet),
 *  so each card shows exactly that. */
export function SourcesList({ sources, activeMarker }: { sources: Source[]; activeMarker: number | null }) {
  if (sources.length === 0) {
    return <p className="text-sm text-ink-2">Sources for an answer appear here once you ask a question</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {sources.map((source) => (
        <li key={source.key}>
          <SourceCard marker={source.marker} title={source.document_title} page={pageText(source.page_number)} active={source.marker === activeMarker} />
        </li>
      ))}
    </ul>
  );
}

export function SourcesPanel({ sources, activeMarker }: { sources: Source[]; activeMarker: number | null }) {
  return (
    <aside aria-label="Sources" className="sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-y-auto rounded-panel bg-stone-100 p-5 xl:block">
      <h2 className="mb-3 text-lg font-semibold text-ink">Sources</h2>
      <SourcesList sources={sources} activeMarker={activeMarker} />
    </aside>
  );
}
