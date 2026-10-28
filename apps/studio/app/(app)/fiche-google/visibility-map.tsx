"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rankTone, type GoogleGridPoint, type GoogleScanGrid } from "@theralys/shared";
import { rankColor, rankOrdinal } from "@/lib/google/rank-colors";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = "© OpenStreetMap contributors";
/** Calque de la nappe de visibilité (classe Leaflet `leaflet-vm-heat-pane`, flouté par CSS), entre les tuiles (200) et les marqueurs (600). */
const HEAT_PANE = "vm-heat";
/** Décalage d'apparition par anneau autour du cabinet (ms) : une onde qui part du centre. */
const RING_DELAY_MS = 110;

/** Taille de référence de la pastille (px, espacement ≥ 64 px) selon le ton du rang : le pack local domine, les absents s'effacent. */
const SIZE: Record<ReturnType<typeof rankTone>, number> = { top: 36, good: 31, weak: 27, none: 22 };

/**
 * HTML de la pastille : uniquement des nombres, des classes et des couleurs
 * calculées — jamais de donnée fournisseur ici (Leaflet injecte les chaînes en
 * innerHTML). Les styles vivent dans `app/globals.css` (préfixe `vm-`).
 */
function markerHtml(point: GoogleGridPoint, delayMs: number, size: number): string {
  const tone = point.missing ? "none" : rankTone(point.rank);
  const color = point.missing ? "var(--color-ink-300)" : rankColor(point.rank);
  const label = point.missing ? "?" : point.rank === null ? "20+" : String(point.rank);
  const classes = ["vm", `vm-${tone}`, point.missing ? "vm-missing" : ""].filter(Boolean).join(" ");
  const fontSize = Math.max(9, Math.round(size * (tone === "none" ? 0.42 : 0.4)));
  return `<span class="${classes}" style="--c:${color};--d:${delayMs}ms;--s:${size}px;--f:${fontSize}px"><span class="vm-glow"></span><span class="vm-dot">${label}</span></span>`;
}

const HOME_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>';

function centerHtml(size: number): string {
  return `<span class="vm-home" style="--s:${size}px"><span class="vm-ring"></span><span class="vm-ring"></span><span class="vm-home-dot">${HOME_SVG}</span></span>`;
}

/** Distance en pixels entre deux emplacements voisins de la grille au zoom courant (≥ 24). */
function spacingPx(m: L.Map, points: GoogleGridPoint[]): number {
  const [a, b] = points;
  if (!a || !b) return 64;
  const pa = m.latLngToLayerPoint([a.lat, a.lng]);
  const pb = m.latLngToLayerPoint([b.lat, b.lng]);
  return Math.max(24, Math.hypot(pb.x - pa.x, pb.y - pa.y));
}

/** Anneau (distance de Tchebychev en cases) d'un emplacement autour du centre de la grille. */
function ringOf(index: number, grid: GoogleScanGrid): number {
  const row = Math.floor(index / grid.cols);
  const col = index % grid.cols;
  return Math.max(Math.abs(row - Math.floor(grid.rows / 2)), Math.abs(col - Math.floor(grid.cols / 2)));
}

/** Infobulle construite en DOM (textContent) : le nom du concurrent vient de Google Maps, jamais interpolé dans du HTML. */
function tooltipFor(point: GoogleGridPoint): HTMLElement {
  const root = document.createElement("span");
  root.className = "vm-tip-body";
  const title = document.createElement("strong");
  title.textContent = point.missing ? "Pas de réponse pour cet emplacement" : point.rank === null ? "Au-delà de la 20e place" : `${rankOrdinal(point.rank)} place`;
  root.appendChild(title);
  if (point.top[0] && !point.missing) {
    const leader = document.createElement("span");
    leader.className = "vm-tip-sub";
    leader.textContent = point.rank === 1 ? "Votre fiche est en tête ici" : `1er ici : ${point.top[0].title}`;
    root.appendChild(leader);
  }
  return root;
}

/**
 * Carte Leaflet (tuiles OpenStreetMap adoucies) des emplacements d'un relevé :
 * une nappe colorée floutée dessine les zones où la fiche est visible, chaque
 * emplacement porte une pastille en relief colorée selon le rang (échelle
 * continue 1re → 20e), le cabinet au centre émet des ondes. Les pastilles
 * apparaissent en vague depuis le cabinet. Rendue côté client seulement
 * (import dynamique `ssr: false` par l'appelant) : aucun autre module ne doit
 * importer ce fichier statiquement (Leaflet lit `window` au chargement).
 */
export function VisibilityMap({ grid, points, keyword }: { grid: GoogleScanGrid; points: GoogleGridPoint[]; keyword: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const heat = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = L.map(container.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(m);
    const pane = m.createPane(HEAT_PANE);
    pane.style.zIndex = "350";
    heat.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      heat.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    const heatGroup = heat.current;
    if (!m || !group || !heatGroup) return;
    const bounds = L.latLngBounds(points.length > 0 ? points.map((p) => [p.lat, p.lng] as [number, number]) : [[grid.center.lat, grid.center.lng]]);
    m.fitBounds(bounds.pad(0.08), { animate: false });

    // Première apparition animée (vague depuis le cabinet) ; les redessins au zoom sont immédiats
    let animate = true;
    const render = () => {
      group.clearLayers();
      heatGroup.clearLayers();
      const renderer = L.svg({ pane: HEAT_PANE });
      const spacing = spacingPx(m, points);
      const scale = Math.min(1, spacing / 64);

      points.forEach((point, index) => {
        const delay = animate ? ringOf(index, grid) * RING_DELAY_MS + (index % 3) * 30 : 0;
        // Nappe : un disque par emplacement, fondu par le flou du calque ; les absents restent très discrets
        if (!point.missing) {
          L.circleMarker([point.lat, point.lng], {
            pane: HEAT_PANE,
            renderer,
            radius: Math.round(spacing * 0.5),
            stroke: false,
            fillColor: rankColor(point.rank),
            fillOpacity: point.rank === null ? 0.18 : 0.85,
            interactive: false,
          }).addTo(heatGroup);
        }
        const tone = point.missing ? "none" : rankTone(point.rank);
        const size = Math.round(SIZE[tone] * scale);
        const icon = L.divIcon({ html: markerHtml(point, delay, size), className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const alt = point.missing ? "Emplacement sans réponse" : point.rank === null ? "Au-delà de la 20e place" : `${rankOrdinal(point.rank)} place`;
        L.marker([point.lat, point.lng], { icon, keyboard: false, alt, riseOnHover: true, zIndexOffset: tone === "top" ? 500 : 0 })
          .bindTooltip(tooltipFor(point), { className: "vm-tip", direction: "auto", offset: [size / 2 + 6, 0], opacity: 1 })
          .addTo(group);
      });

      const homeSize = Math.round(40 * Math.max(scale, 0.8));
      const centerIcon = L.divIcon({ html: centerHtml(homeSize), className: "", iconSize: [homeSize, homeSize], iconAnchor: [homeSize / 2, homeSize / 2] });
      L.marker([grid.center.lat, grid.center.lng], { icon: centerIcon, zIndexOffset: 1000, alt: "Votre cabinet" })
        .bindTooltip("Votre cabinet", { className: "vm-tip", direction: "auto", offset: [homeSize / 2 + 6, 0], opacity: 1 })
        .addTo(group);
      animate = false;
    };
    render();
    m.on("zoomend", render);
    return () => {
      m.off("zoomend", render);
    };
  }, [grid, points]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={`Carte de visibilité pour « ${keyword} » : ${grid.rows * grid.cols} emplacements sur ${grid.radiusKm} km autour du cabinet`}
      className="vm-map h-[360px] w-full overflow-hidden rounded-2xl border border-cream-200 bg-cream-100 sm:h-[460px]"
    />
  );
}
