import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// Server-side Supabase client — service role key, хэзээ ч client-д илгээхгүй
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase not configured");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const BUCKET = "product-images";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const RequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive().max(MAX_SIZE_BYTES),
});

/**
 * POST /api/upload
 * Authenticated endpoint — returns a signed upload URL.
 * Client uploads directly to Supabase using the signed URL (no anon key needed).
 */
export async function POST(request: NextRequest) {
  // 20 uploads/min per IP
  const limited = await rateLimit(request, { limit: 20, window: 60, identifier: "upload" });
  if (limited) return limited;

  try {
    const ctx = await getOrgContext();

    const raw = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { contentType, size } = parsed.data;
    // Original filename is validated but not used in the storage path
    // (path uses timestamp+random to prevent collisions and path traversal)

    // MIME type whitelist — зөвхөн зураг
    if (!ALLOWED_MIME.has(contentType)) {
      return NextResponse.json(
        { error: "Only image files are allowed (JPEG, PNG, WebP, GIF, AVIF)" },
        { status: 400 }
      );
    }

    // File size limit
    if (size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File size must be under 5 MB" },
        { status: 400 }
      );
    }

    // Extension from content type — filename extension-д найдахгүй
    // Explicit switch to avoid dynamic key access
    let ext: string;
    switch (contentType) {
      case "image/jpeg": ext = "jpg"; break;
      case "image/png":  ext = "png"; break;
      case "image/webp": ext = "webp"; break;
      case "image/gif":  ext = "gif"; break;
      case "image/avif": ext = "avif"; break;
      default:           ext = "jpg";
    }

    // Org-scoped path — org ID-г prefix болгосноор tenant isolation хангана
    const path = `${ctx.organizationId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[upload] Signed URL error:", error?.message);
      return NextResponse.json({ error: "Upload service unavailable" }, { status: 500 });
    }

    // Public URL — upload дууссаны дараа ашиглах
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: urlData.publicUrl,
    });
  } catch {
    console.error("[upload] Unexpected error");
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
