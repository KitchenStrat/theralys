"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rankTone, type GoogleGridPoint, type GoogleScanGrid } from "@theralys/shared";
import { TONE_COLOR } from "./tones";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = "© OpenStreetMap contributors";

function rankText(rank: number | null): string {
  return rank === null ? "20+" : String(rank);
}

/**
 * HTML de la pastille : uniquement des nombres et des couleurs constantes —
 * jamais de donnée fournisseur ici (Leaflet injecte les chaînes en innerHTML).
 */
function markerHtml(point: GoogleGridPoint): string {
  const color = TONE_COLOR[rankTone(point.rank)];
  return `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${color};color:#fff;font:600 12px/1 system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.35);border:2px solid #fff">${rankText(point.rank)}</span>`;
}

const CENTER_HTML =
  '<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:var(--color-ink-900);color:#fff;font:700 14px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff">⌂</span>';

/**
 * Carte Leaflet (tuiles OpenStreetMap) des 49 points d'un relevé : une
 * pastille ronde colorée selon le rang (DivIcon), le cabinet marqué au centre.
 * Rendue côté client seulement (import dynamique `ssr: false` par l'appelant) :
 * aucun autre module ne doit importer ce fichier statiquement (Leaflet lit
 * `window` au chargement).
 */
export function VisibilityMap({ grid, points, keyword }: { grid: GoogleScanGrid; points: GoogleGridPoint[]; keyword: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = L.map(container.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const point of points) {
      const icon = L.divIcon({ html: markerHtml(point), className: "", iconSize: [30, 30], iconAnchor: [15, 15] });
      // Infobulle construite en DOM (textContent) : le nom du concurrent vient
      // de Google Maps via le fournisseur, jamais interpolé dans du HTML.
      const tooltip = document.createElement("span");
      tooltip.textContent = `${point.rank === null ? "Au-delà de la 20e place" : `${point.rank}${point.rank === 1 ? "re" : "e"} place`}${
        point.top[0] ? ` · 1er : ${point.top[0].title}` : ""
      }`;
      L.marker([point.lat, point.lng], { icon, keyboard: false, alt: `Position ${rankText(point.rank)}` })
        .bindTooltip(tooltip)
        .addTo(group);
    }
    const centerIcon = L.divIcon({ html: CENTER_HTML, className: "", iconSize: [34, 34], iconAnchor: [17, 17] });
    L.marker([grid.center.lat, grid.center.lng], { icon: centerIcon, zIndexOffset: 1000, alt: "Votre cabinet" })
      .bindTooltip("Votre cabinet")
      .addTo(group);
    const bounds = L.latLngBounds(points.length > 0 ? points.map((p) => [p.lat, p.lng] as [number, number]) : [[grid.center.lat, grid.center.lng]]);
    m.fitBounds(bounds.pad(0.08), { animate: false });
  }, [grid, points]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={`Carte de visibilité pour « ${keyword} » : ${grid.rows}×${grid.cols} points sur ${grid.radiusKm} km autour du cabinet`}
      className="h-[360px] w-full overflow-hidden rounded-2xl border border-cream-200 bg-cream-100 sm:h-[460px]"
    />
  );
}
