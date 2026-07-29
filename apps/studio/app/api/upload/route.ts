import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo (le recadrage compresse déjà côté client)
/** Sans Vercel Blob, l'image est stockée en data-URI (petits fichiers only). */
const MAX_INLINE_SIZE = 2_500_000;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Téléversement d'une photo depuis l'éditeur (portrait du praticien, photo du
 * cabinet…). Stockage sur Vercel Blob si BLOB_READ_WRITE_TOKEN est configuré,
 * sinon repli en data-URI (développement / petits fichiers).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Format non pris en charge (JPEG, PNG, WebP ou AVIF)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop lourde (4 Mo maximum)" }, { status: 400 });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`sites/${session.siteId}/${randomUUID()}.${ext}`, file, {
        access: "public",
        contentType: file.type,
      });
      return NextResponse.json({ url: blob.url });
    } catch (err) {
      // Blob mal configuré (jeton invalide, store non relié) : on bascule sur
      // le stockage de secours plutôt que d'échouer.
      console.error("[upload] Vercel Blob indisponible, repli data-URI:", err);
    }
  }

  if (file.size > MAX_INLINE_SIZE) {
    return NextResponse.json(
      {
        error:
          "Image trop lourde pour le stockage local (1,5 Mo max). Configurez Vercel Blob ou réduisez l'image.",
      },
      { status: 400 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return NextResponse.json({
    url: `data:${file.type};base64,${buffer.toString("base64")}`,
  });
}
