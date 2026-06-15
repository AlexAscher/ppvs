"use client";

import { useRef, useState, useEffect } from "react";
import { Upload, X, Music } from "lucide-react";
import { validatePpvFile, ppvMediaKind, PPV_ACCEPT, type PpvMediaKind } from "@/lib/ppv-storage";

type Props = {
  initialUrl?: string | null;
  onFileChange: (file: File | null) => void;
};

export function PpvMediaInput({ initialUrl, onFileChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [kind, setKind] = useState<PpvMediaKind | null>(
    initialUrl ? ppvMediaKind(initialUrl) ?? "image" : null,
  );
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(file: File | null) {
    if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(initialUrl ?? null);
      setKind(initialUrl ? ppvMediaKind(initialUrl) ?? "image" : null);
      setError("");
      onFileChange(null);
      return;
    }
    // Refuse anything Telegram can't display inline (e.g. .jfif, .heic).
    const valid = validatePpvFile(file);
    if (!valid.ok) {
      setError(valid.error);
      onFileChange(null);
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(file));
    setKind(valid.kind);
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
        // Only Telegram-displayable formats — images, clips, and audio. The
        // real gatekeeper is validatePpvFile() in handleFile (accept is just
        // a UI hint the OS file picker can ignore).
        accept={PPV_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative w-full aspect-[4/3] rounded-lg border-2 border-dashed cursor-pointer transition-all overflow-hidden ${
          dragOver ? "border-[#00AFF0] bg-[#00AFF0]/5" : "border-[#374151] bg-[#1f2937] hover:border-[#4b5563]"
        }`}
      >
        {preview ? (
          <>
            {kind === "video" ? (
              <video
                src={preview}
                muted
                loop
                playsInline
                autoPlay
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />
            ) : kind === "audio" ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#1f2937] to-[#111827] px-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 rounded-full bg-[#00AFF0]/20 flex items-center justify-center">
                  <Music className="w-7 h-7 text-[#00AFF0]" />
                </div>
                <audio src={preview} controls className="w-full max-w-[280px]" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleFile(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#6b7280]">
            <Upload className="w-8 h-8" />
            <span className="text-[13px] font-medium">Click or drop image, video or audio</span>
            <span className="text-[11px] text-[#4b5563]">JPG · PNG · WebP · GIF · MP4 · MOV · MP3 · M4A</span>
          </div>
        )}
      </div>
      {error && <p className="text-[12px] text-red-400 mt-2">{error}</p>}
    </div>
  );
}
