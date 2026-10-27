/**
 * Détection des erreurs Postgres par code SQLSTATE, que l'erreur soit directe
 * (pilote postgres) ou en cause d'une erreur drizzle (`DrizzleQueryError`).
 * Sert aux replis « déploiement avant migration » de /api/track.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Code SQLSTATE de l'erreur, cherché jusqu'à quatre niveaux de `cause` ; null si aucun. */
export function pgErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** « column does not exist » (42703) : colonne ajoutée par une migration non appliquée. */
export function isMissingColumnError(err: unknown): boolean {
  return pgErrorCode(err) === "42703";
}

/** « invalid input value for enum » (22P02) : valeur d'enum ajoutée par une migration non appliquée. */
export function isInvalidEnumError(err: unknown): boolean {
  return pgErrorCode(err) === "22P02";
}
