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

export function ModelSelectorBar({
  models,
  selectedModel,
  onModelSelect,
}: ModelSelectorBarProps) {
  return (
    <div className="h-[34px] bg-[#1a1d24] border-b border-[#2a2d35] flex items-center px-4 gap-1.5 overflow-x-auto">
      {models.map((model) => (
        <button
          key={model.id}
          onClick={() => onModelSelect(model.id)}
          className={`relative px-2.5 py-0.5 rounded-md text-[10px] font-medium border whitespace-nowrap transition-all ${
            selectedModel === model.id
              ? "bg-[#6366f1] border-[#6366f1] text-white shadow-sm"
              : "bg-transparent border-[#374151] text-[#9ca3af] hover:border-[#4b5563] hover:text-[#d1d5db]"
          }`}
        >
          {model.name}
          {model.unread > 0 && (
            <div className="absolute -top-1 -right-1">
              {model.unread === 1 ? (
                <div className="w-[6px] h-[6px] bg-[#ef4444] rounded-full animate-pulse shadow-sm" />
              ) : (
                <div className="px-1 py-px bg-[#ef4444] text-white text-[8px] font-bold rounded-full shadow-sm">
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
