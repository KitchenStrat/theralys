import { describe, expect, it } from "vitest";
import { resolveSocialSettings, voiceOf } from "./settings";

const blog = {
  voiceDesignation: "nous",
  voiceAccord: "masculin",
  voiceReader: "tu",
  voiceTone: "direct",
} as const;

const social = {
  voiceDesignation: "on",
  voiceAccord: "feminin",
  voiceReader: "vous",
  voiceTone: "pedagogue",
  instructions: "  Terminer par une question.\r\n\r\n\r\nNe jamais citer de tarif. ",
  postDays: [4, 1, 1],
} as const;

describe("resolveSocialSettings", () => {
  it("sans ligne social_settings ni blog : voix par défaut accordée au genre du prospect, cadence mardi/vendredi", () => {
    const view = resolveSocialSettings({ social: null, blog: null, prospectGender: "masculin" });
    expect(view).toEqual({
      voice: { designation: "je", accord: "masculin", reader: "vous", tone: "chaleureux" },
      instructions: "",
      postDays: [2, 5],
      saved: false,
    });
    expect(resolveSocialSettings({ social: null, blog: null, prospectGender: null }).voice.accord).toBe("feminin");
  });

  it("sans ligne social_settings : la voix du blog fait foi (comme avant l'option), rien d'enregistré", () => {
    const view = resolveSocialSettings({ social: null, blog, prospectGender: "feminin" });
    expect(view.voice).toEqual({ designation: "nous", accord: "masculin", reader: "tu", tone: "direct" });
    expect(view.saved).toBe(false);
    expect(view.postDays).toEqual([2, 5]);
  });

  it("avec une ligne social_settings : elle l'emporte sur le blog ; consignes nettoyées, jours triés et dédoublonnés", () => {
    const view = resolveSocialSettings({ social: { ...social, postDays: [...social.postDays] }, blog, prospectGender: "masculin" });
    expect(view).toEqual({
      voice: { designation: "on", accord: "feminin", reader: "vous", tone: "pedagogue" },
      instructions: "Terminer par une question.\n\nNe jamais citer de tarif.",
      postDays: [1, 4],
      saved: true,
    });
  });

  it("jsonb inattendu (null, objet, valeurs hors 1..7) : retour aux jours par défaut ; consignes null → chaîne vide", () => {
    const base = { ...social, instructions: null };
    expect(resolveSocialSettings({ social: { ...base, postDays: null }, blog: null, prospectGender: null }).postDays).toEqual([2, 5]);
    expect(resolveSocialSettings({ social: { ...base, postDays: { a: 1 } }, blog: null, prospectGender: null }).postDays).toEqual([2, 5]);
    expect(resolveSocialSettings({ social: { ...base, postDays: [0, 8, "3"] }, blog: null, prospectGender: null }).postDays).toEqual([2, 5]);
    expect(resolveSocialSettings({ social: { ...base, postDays: [7] }, blog: null, prospectGender: null }).instructions).toBe("");
  });

  it("voiceOf : colonnes de la base → SocialVoice", () => {
    expect(voiceOf(blog)).toEqual({ designation: "nous", accord: "masculin", reader: "tu", tone: "direct" });
  });
});
