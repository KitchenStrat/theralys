/**
 * Réglages « Paramétrage » des contenus réseaux sociaux : voix, consignes au
 * générateur, jours de publication. Une ligne `social_settings` fait foi ;
 * sinon la voix du blog (`blog_settings`, comme avant l'option), sinon la voix
 * par défaut accordée au genre du prospect ; cadence par défaut (mardi,
 * vendredi). `resolveSocialSettings` est pure (testée sans base).
 */

import { eq } from "drizzle-orm";
import { blogSettings, getDb, prospects, sites, socialSettings } from "@theralys/db";
import { isMissingSchemaError } from "./data";
import {
  DEFAULT_SOCIAL_VOICE,
  SOCIAL_POST_DAYS,
  cleanSocialInstructions,
  normalizePostDays,
  type SocialVoice,
} from "@theralys/shared";

/** Colonnes de voix communes à `blog_settings` et `social_settings`. */
export type VoiceColumns = {
  voiceDesignation: SocialVoice["designation"];
  voiceAccord: SocialVoice["accord"];
  voiceReader: SocialVoice["reader"];
  voiceTone: SocialVoice["tone"];
};

/** Ligne `social_settings` (projection utile ; `postDays` tel que stocké en jsonb). */
export type SocialSettingsRow = VoiceColumns & { instructions: string | null; postDays: unknown };

/** Réglages effectifs, prêts pour la page, le brief et les créneaux. */
export type SocialSettingsView = {
  voice: SocialVoice;
  /** Consignes nettoyées ; "" = aucune */
  instructions: string;
  /** Jours ISO (1 = lundi … 7 = dimanche), dédoublonnés, triés */
  postDays: number[];
  /** Vrai si le praticien a enregistré ses réglages (ligne `social_settings`) */
  saved: boolean;
};

const VOICE_COLUMNS = {
  voiceDesignation: true,
  voiceAccord: true,
  voiceReader: true,
  voiceTone: true,
} as const;

export function voiceOf(row: VoiceColumns): SocialVoice {
  return {
    designation: row.voiceDesignation,
    accord: row.voiceAccord,
    reader: row.voiceReader,
    tone: row.voiceTone,
  };
}

/**
 * Réglages effectifs : la ligne `social_settings` fait foi ; sinon la voix du
 * blog ; sinon la voix par défaut accordée au genre du prospect (féminin sans
 * prospect) et les jours par défaut.
 */
export function resolveSocialSettings(input: {
  social: SocialSettingsRow | null;
  blog: VoiceColumns | null;
  prospectGender: SocialVoice["accord"] | null;
}): SocialSettingsView {
  if (input.social) {
    return {
      voice: voiceOf(input.social),
      instructions: cleanSocialInstructions(input.social.instructions),
      postDays: normalizePostDays(Array.isArray(input.social.postDays) ? input.social.postDays : null),
      saved: true,
    };
  }
  return {
    voice: input.blog
      ? voiceOf(input.blog)
      : { ...DEFAULT_SOCIAL_VOICE, accord: input.prospectGender ?? DEFAULT_SOCIAL_VOICE.accord },
    instructions: "",
    postDays: [...SOCIAL_POST_DAYS],
    saved: false,
  };
}

/** Réglages effectifs d'un site (3 lectures courtes, en parallèle). */
export async function getSocialSettings(siteId: string): Promise<SocialSettingsView> {
  const db = getDb();
  const [social, blog, [owner]] = await Promise.all([
    // Tant que la migration 0002 n'est pas appliquée en production, la section
    // continue de fonctionner avec les réglages par défaut
    db.query.socialSettings
      .findFirst({
        where: eq(socialSettings.siteId, siteId),
        columns: { ...VOICE_COLUMNS, instructions: true, postDays: true },
      })
      .catch((err: unknown) => {
        if (!isMissingSchemaError(err)) throw err;
        console.warn("[social] table social_settings absente : réglages par défaut (migration 0002 à appliquer)");
        return undefined;
      }),
    db.query.blogSettings.findFirst({ where: eq(blogSettings.siteId, siteId), columns: VOICE_COLUMNS }),
    db
      .select({ gender: prospects.gender })
      .from(sites)
      .leftJoin(prospects, eq(prospects.id, sites.prospectId))
      .where(eq(sites.id, siteId))
      .limit(1),
  ]);
  return resolveSocialSettings({
    social: social ?? null,
    blog: blog ?? null,
    prospectGender: owner?.gender ?? null,
  });
}
