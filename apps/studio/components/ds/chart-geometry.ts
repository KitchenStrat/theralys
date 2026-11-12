/** Géométrie partagée des petits graphiques (repère 0–100, étiré par le SVG). */
export type Point = readonly [x: number, y: number];

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Courbe lissée passant par tous les points, sans dépassement entre deux
 * valeurs (interpolation cubique monotone de Fritsch-Carlson) : la courbe ne
 * suggère jamais un creux ou un pic qui n'est pas dans les données.
 */
export function smoothPath(points: readonly Point[]): string {
  const n = points.length;
  const x = (i: number) => points[i]?.[0] ?? 0;
  const y = (i: number) => points[i]?.[1] ?? 0;
  if (n === 0) return "";
  if (n === 1) return `M${r(x(0))},${r(y(0))}`;

  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) slope.push((y(i + 1) - y(i)) / (x(i + 1) - x(i) || 1));
  const s = (i: number) => slope[i] ?? 0;

  const tangent: number[] = [s(0)];
  for (let i = 1; i < n - 1; i++) tangent.push(s(i - 1) * s(i) <= 0 ? 0 : (s(i - 1) + s(i)) / 2);
  tangent.push(s(n - 2));
  for (let i = 0; i < n - 1; i++) {
    if (s(i) === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = (tangent[i] ?? 0) / s(i);
    const b = (tangent[i + 1] ?? 0) / s(i);
    const norm = a * a + b * b;
    if (norm > 9) {
      const k = 3 / Math.sqrt(norm);
      tangent[i] = k * a * s(i);
      tangent[i + 1] = k * b * s(i);
    }
  }

  let d = `M${r(x(0))},${r(y(0))}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (x(i + 1) - x(i)) / 3;
    d += ` C${r(x(i) + h)},${r(y(i) + (tangent[i] ?? 0) * h)} ${r(x(i + 1) - h)},${r(y(i + 1) - (tangent[i + 1] ?? 0) * h)} ${r(x(i + 1))},${r(y(i + 1))}`;
  }
  return d;
}

/** Ferme la courbe sur la ligne de base pour dessiner l'aire. */
export function areaPath(linePath: string, points: readonly Point[], baseline = 100): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `${linePath} L${r(last[0])},${baseline} L${r(first[0])},${baseline} Z`;
}

/** Graduations « rondes » de 0 à un maximum arrondi (1, 2, 2,5, 5 × 10ⁿ). */
export function niceScale(maxValue: number, steps = 3): { max: number; ticks: number[] } {
  const safe = maxValue > 0 ? maxValue : 1;
  const raw = safe / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  const step = Math.max(nice * power, 1);
  const max = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return { max, ticks };
}
