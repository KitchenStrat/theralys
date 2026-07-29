"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@theralys/ui";

/**
 * Recadrage avant téléversement : cadre au format imposé, photo déplaçable
 * (glisser) et zoomable (curseur). Sortie JPEG nette (1024 px de large).
 */
export function CropModal({
  file,
  aspect,
  onCancel,
  onConfirm,
}: {
  file: File;
  /** Rapport largeur/hauteur du cadre (ex. 4/5 pour un portrait) */
  aspect: number;
  onCancel: () => void;
  onConfirm: (cropped: Blob) => void;
}) {
  const FRAME_W = 320;
  const frameH = Math.round(FRAME_W / aspect);

  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1); // multiplicateur au-dessus du « cover »
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  // Création + révocation dans le même effet (sinon le double-montage du mode
  // strict de React révoque une URL encore utilisée).
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Échelle minimale pour couvrir le cadre, puis zoom par-dessus
  const coverScale = natural ? Math.max(FRAME_W / natural.w, frameH / natural.h) : 1;
  const scale = coverScale * zoom;
  const imgW = natural ? natural.w * scale : 0;
  const imgH = natural ? natural.h * scale : 0;

  function clamp(next: { x: number; y: number }) {
    return {
      x: Math.min(0, Math.max(FRAME_W - imgW, next.x)),
      y: Math.min(0, Math.max(frameH - imgH, next.y)),
    };
  }

  // Recentre quand le zoom change
  useEffect(() => {
    setOffset((prev) => clamp(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const { startX, startY, baseX, baseY } = dragging.current;
    setOffset(clamp({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) }));
  }
  function onPointerUp() {
    dragging.current = null;
  }

  async function confirm() {
    if (!natural || !url) return;
    const outW = 1024;
    const outH = Math.round(outW / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.src = url;
    await img.decode();
    // Zone source (en pixels naturels) correspondant au cadre
    ctx.drawImage(
      img,
      -offset.x / scale,
      -offset.y / scale,
      FRAME_W / scale,
      frameH / scale,
      0,
      0,
      outW,
      outH,
    );
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.88,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
        <p className="font-semibold">Cadrez votre photo</p>
        <p className="mt-0.5 text-xs text-ink-500">
          Faites glisser pour positionner, ajustez le zoom si besoin.
        </p>
        <div
          className="relative mx-auto mt-4 cursor-grab touch-none overflow-hidden rounded-2xl bg-cream-100 active:cursor-grabbing"
          style={{ width: FRAME_W, height: frameH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {natural && url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: imgW, height: imgH, left: offset.x, top: offset.y }}
            />
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span aria-hidden className="text-xs text-ink-500">−</span>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary-500"
          />
          <span aria-hidden className="text-sm text-ink-500">+</span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="button" size="sm" onClick={confirm} disabled={!natural}>
            Valider le cadrage
          </Button>
        </div>
      </div>
    </div>
  );
}
