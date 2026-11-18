"use client";

import type { StudyDocument } from "@/types/api";

type Props = {
  documents: StudyDocument[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function ScopeSelector({ documents, selected, onChange, disabled }: Props) {
  const all = selected.length === 0;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <fieldset disabled={disabled} className="rounded-panel border border-stone bg-paper p-4">
      <legend className="px-1 text-sm font-medium">Search in</legend>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={() => onChange([])} className="accent-clay-strong" />
          All my documents
        </label>
        {documents.map((doc) => (
          <label key={doc.id} className="flex max-w-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(doc.id)}
              onChange={() => toggle(doc.id)}
              className="accent-clay-strong"
            />
            <span className="truncate">{doc.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
