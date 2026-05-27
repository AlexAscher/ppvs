"use client";

interface Model {
  id: string;
  name: string;
  unread: number;
}

interface ModelSelectorBarProps {
  models: Model[];
  selectedModel: string;
  onModelSelect: (model: string) => void;
}

/**
 * Classic ModelSelectorBar — pixel match of Create_prompt_design.
 * h-[42px], px-4 py-1.5 rounded-lg buttons, text-[11px] labels.
 */
export function ModelSelectorBar({ models, selectedModel, onModelSelect }: ModelSelectorBarProps) {
  return (
    <div className="h-[42px] bg-[#1a1d24] border-b border-[#2a2d35] flex items-center px-5 gap-2 overflow-x-auto">
      {models.map((model) => (
        <button
          key={model.id}
          onClick={() => onModelSelect(model.id)}
          className={`relative px-4 py-1.5 rounded-lg text-[11px] font-medium border whitespace-nowrap transition-all ${
            selectedModel === model.id
              ? "bg-[#6366f1] border-[#6366f1] text-white shadow-sm"
              : "bg-transparent border-[#374151] text-[#9ca3af] hover:border-[#4b5563] hover:text-[#d1d5db]"
          }`}
        >
          {model.name}
          {model.unread > 0 && (
            <div className="absolute -top-1 -right-1">
              {model.unread === 1 ? (
                <div className="w-[7px] h-[7px] bg-[#ef4444] rounded-full animate-pulse shadow-sm" />
              ) : (
                <div className="px-1.5 py-0.5 bg-[#ef4444] text-white text-[9px] font-bold rounded-full shadow-sm">
                  {model.unread}
                </div>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
