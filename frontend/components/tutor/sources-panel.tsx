import { SourceCard } from "@/components/ui/citation";
import type { Source } from "@/lib/chat-state";
import { pageText } from "./sources";

/** Sources of the selected answer, each with the passage that was found. A source whose document was
 *  deleted keeps its title and passage and says so. */
export function SourcesList({ sources, activeMarker }: { sources: Source[]; activeMarker: number | null }) {
  if (sources.length === 0) {
    return <p className="text-sm text-ink-2">Sources for an answer appear here once you ask a question</p>;
  }
  return (
    <ul className="flex flex-col gap-5">
      {sources.map((source) => (
        <li key={source.marker} id={`source-${source.marker}`}>
          <SourceCard
            marker={source.marker}
            title={source.title}
            page={source.deleted ? `${pageText(source.page)} · Source deleted` : pageText(source.page)}
            snippet={source.snippet || undefined}
            active={source.marker === activeMarker}
            flat
          />
        </li>
      ))}
    </ul>
  );
}

export function SourcesPanel({ sources, activeMarker }: { sources: Source[]; activeMarker: number | null }) {
  return (
    <aside aria-label="Sources" className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-stone bg-stone-50 p-5 2xl:block">
      <h2 className="mb-3 text-base font-semibold text-ink">Sources</h2>
      <SourcesList sources={sources} activeMarker={activeMarker} />
    </aside>
  );
}
