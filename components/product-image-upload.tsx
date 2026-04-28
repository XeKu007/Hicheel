"use client";

import { useState, useRef } from "react";
import { Camera, Upload, X, ImageIcon } from "lucide-react";

interface ProductImageUploadProps {
  onUpload: (url: string) => void;
  currentUrl?: string;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function ProductImageUpload({ onUpload, currentUrl }: ProductImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    // Client-side validation (server also validates)
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Зөвхөн зураг файл оруулна уу (JPEG, PNG, WebP, GIF, AVIF).");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Зургийн хэмжээ 5MB-аас бага байх ёстой.");
      return;
    }

    setError(null);
    setUploading(true);

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // 1. Server-аас signed upload URL авна — anon key ашиглахгүй
      const signRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        setError(body.error ?? "Зураг хуулахад алдаа гарлаа.");
        setUploading(false);
        return;
      }

      const { signedUrl, publicUrl } = await signRes.json() as {
        signedUrl: string;
        token: string;
        path: string;
        publicUrl: string;
      };

      // 2. Signed URL-ээр шууд Supabase-д upload хийнэ
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        setError("Зураг хуулахад алдаа гарлаа. Дахин оролдоно уу.");
        setUploading(false);
        return;
      }

      onUpload(publicUrl);
    } catch {
      setError("Зураг хуулахад алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function clearImage() {
    setPreview(null);
    onUpload("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden" style={{ height: "200px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Product preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(7,7,17,0.6) 0%, transparent 50%)" }} />
          <button
            type="button"
            onClick={clearImage}
            className="absolute top-2 right-2 p-1.5 rounded-lg transition-all hover:opacity-80"
            style={{ background: "rgba(239,68,68,0.9)", color: "white" }}
          >
            <X className="w-4 h-4" />
          </button>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(7,7,17,0.7)" }}>
              <div className="text-sm font-medium" style={{ color: "#38bdf8" }}>Хуулж байна...</div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all"
          style={{
            height: "160px",
            background: "rgba(99,102,241,0.04)",
            border: "2px dashed rgba(99,102,241,0.2)",
          }}
        >
          <div className="p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.1)" }}>
            <ImageIcon className="w-6 h-6" style={{ color: "#818cf8" }} />
          </div>
          <p className="text-xs text-center" style={{ color: "rgba(148,163,184,0.6)" }}>
            Зураг сонгох эсвэл камераар авах
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Галерей
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", color: "#38bdf8" }}
            >
              <Camera className="w-3.5 h-3.5" />
              Камер
            </button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

      {error && (
        <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>{error}</p>
      )}
    </div>
  );
}
