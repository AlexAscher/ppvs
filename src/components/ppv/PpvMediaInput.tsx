"use client";

import { useRef, useState, useEffect } from "react";
import { Upload, X } from "lucide-react";

type Props = {
  initialUrl?: string | null;
  onFileChange: (file: File | null) => void;
};

export function PpvMediaInput({ initialUrl, onFileChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File | null) {
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(initialUrl ?? null);
      onFileChange(null);
      return;
    }
    setPreview(URL.createObjectURL(file));
    onFileChange(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative w-full aspect-[4/3] rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
          dragOver ? "border-[#6366f1] bg-[#6366f1]/5" : "border-[#374151] bg-[#1f2937] hover:border-[#4b5563]"
        }`}
      >
        {preview ? (
          <>
            <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); handleFile(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#6b7280]">
            <Upload className="w-8 h-8" />
            <span className="text-[13px] font-medium">Click or drop image</span>
            <span className="text-[11px] text-[#4b5563]">JPG, PNG, WebP</span>
          </div>
        )}
      </div>
    </div>
  );
}
