import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hitRateLimit, type RateLimitRule } from "@theralys/db";
import { isCrossOriginRequest } from "@theralys/shared";
import { getSession } from "@/lib/auth";
import { sniffImageType } from "@/lib/upload/sniff";

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

/** Téléversements par site et par jour : large pour un praticien qui refait ses photos, court pour un script. */
const UPLOAD_LIMIT: RateLimitRule = { scope: "upload:site", limit: 200, windowSeconds: 24 * 60 * 60 };

/**
 * Téléversement d'une photo depuis l'éditeur (portrait du praticien, photo du
 * cabinet…). Stockage sur Vercel Blob si BLOB_READ_WRITE_TOKEN est configuré,
 * sinon repli en data-URI (développement / petits fichiers).
 * Accès : session, même origine seulement (une page tierce ne peut pas remplir
 * le stockage d'un praticien connecté), quota quotidien par site. Le format
 * est lu dans les premiers octets du fichier, pas dans le type annoncé.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (isCrossOriginRequest(request.headers)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  // Corps annoncé trop lourd : refusé avant d'être lu
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "Image trop lourde (8 Mo maximum)" }, { status: 413 });
  }
  const quota = await hitRateLimit(getDb(), UPLOAD_LIMIT, session.siteId);
  if (!quota.allowed) {
    return NextResponse.json({ error: "Beaucoup d'images envoyées aujourd'hui : réessayez demain, ou contactez Harmony." }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop lourde (8 Mo maximum)" }, { status: 400 });
  }
  // Le format est celui du contenu, lu dans ses premiers octets : le type annoncé par le navigateur (ou une
  // extension trompeuse) ne décide de rien. Tout ce qui n'est pas une de ces images est refusé.
  const type = sniffImageType(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  const ext = type ? ALLOWED_TYPES[type] : undefined;
  if (!type || !ext) {
    return NextResponse.json(
      { error: "Format non pris en charge (JPEG, PNG, WebP ou AVIF)" },
      { status: 400 },
    );
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`sites/${session.siteId}/${randomUUID()}.${ext}`, file, {
        access: "public",
        contentType: type,
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
          "Image trop lourde pour le stockage local (2,5 Mo max). Configurez Vercel Blob ou réduisez l'image.",
      },
      { status: 400 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return NextResponse.json({
    url: `data:${type};base64,${buffer.toString("base64")}`,
  });
}
