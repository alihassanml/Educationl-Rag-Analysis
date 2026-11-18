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
    <fieldset disabled={disabled} className="min-w-0 rounded-control bg-stone-100 p-3">
      <legend className="px-1 text-sm font-medium text-ink">Search in</legend>
      <div className="mt-1 flex flex-col gap-2">
        <label className="flex min-h-6 items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={all} onChange={() => onChange([])} className="size-4 accent-clay-strong" />
          All my documents
        </label>
        {documents.map((doc) => (
          <label key={doc.id} className="flex min-h-6 max-w-full items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggle(doc.id)} className="size-4 accent-clay-strong" />
            <span className="truncate">{doc.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
