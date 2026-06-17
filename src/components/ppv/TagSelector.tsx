"use client";

import { PpvTag } from "./types";

type Props = {
  allTags: PpvTag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
};

export function TagSelector({ allTags, selectedIds, onToggle }: Props) {
  if (allTags.length === 0) {
    return (
      <p className="text-[12px] text-[#6b7280] italic">No tags yet. Create one via &quot;Manage Tags&quot;.</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {allTags.map((tag) => {
        const active = selectedIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all inline-flex items-center gap-1 ${
              active ? "ring-2 ring-offset-2 ring-offset-[#161a22]" : "opacity-50 hover:opacity-100"
            }`}
            style={{
              backgroundColor: `${tag.color}20`,
              color: tag.color,
              ...(active ? { boxShadow: `0 0 0 2px ${tag.color}` } : {}),
            }}
          >
            {tag.emoji && <span>{tag.emoji}</span>}
            <span>{tag.name}</span>
          </button>
        );
      })}
    </div>
  );
}
