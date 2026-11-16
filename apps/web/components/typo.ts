/**
 * Espaces insécables de la typographie française, posées à l'affichage : un
 * deux-points, un point-virgule, un point d'exclamation ou d'interrogation ne
 * passe jamais seul à la ligne, un guillemet ne reste pas seul en fin de
 * ligne. Les textes de la page restent écrits avec des espaces ordinaires.
 */
export function fr(text: string): string {
  return text.replace(/ ([:;!?»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}
