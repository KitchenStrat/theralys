/**
 * Générateur de statistiques Search Console factices mais réalistes
 * (mode mock, en attendant l'OAuth Google réel). Déterministe par site.
 */

export type MockSearchStatRow = {
  siteId: string;
  day: string;
  query: string;
  impressions: number;
  clicks: number;
};

export function generateMockSearchStats(opts: {
  siteId: string;
  profession: string;
  city: string;
  days: number;
  until: Date;
}): MockSearchStatRow[] {
  const p = opts.profession.toLowerCase();
  const c = opts.city.toLowerCase();
  const queries: { query: string; weight: number }[] = [
    { query: `${p} ${c}`, weight: 10 },
    { query: `massage ${c}`, weight: 7 },
    { query: `${p} près de chez moi`, weight: 5 },
    { query: "bien-être", weight: 3 },
    { query: `détente ${c}`, weight: 2 },
    { query: `${p} avis`, weight: 2 },
    { query: "gestion du stress", weight: 2 },
    { query: `cabinet ${p}`, weight: 1 },
  ];

  const seed = hash(opts.siteId);
  const rows: MockSearchStatRow[] = [];

  for (let i = opts.days - 1; i >= 0; i--) {
    const date = new Date(opts.until.getTime() - i * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    // Tendance à la hausse + bruit déterministe + creux le week-end
    const dayIndex = opts.days - i;
    const weekend = [0, 6].includes(date.getUTCDay()) ? 0.6 : 1;
    const trend = 1 + (dayIndex / opts.days) * 1.2;

    for (const [qi, { query, weight }] of queries.entries()) {
      const noise = 0.6 + ((seed >> (qi + (dayIndex % 13))) % 100) / 120;
      const impressions = Math.round(weight * trend * weekend * noise);
      if (impressions <= 0) continue;
      rows.push({
        siteId: opts.siteId,
        day,
        query,
        impressions,
        clicks: Math.round(impressions * 0.08),
      });
    }
  }
  return rows;
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}
