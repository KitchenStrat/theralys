/** "il y a 3 jours", "il y a 2 h", "à l'instant" — pour la colonne « Créée ». */
export function relativeTimeFr(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 31) return rtf.format(-days, "day");
  const months = Math.round(days / 30.44);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.round(months / 12), "year");
}

export function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    date,
  );
}

/** Temps de lecture estimé en minutes (200 mots/min, minimum 1). */
export function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
