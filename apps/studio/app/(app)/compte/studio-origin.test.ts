import { describe, expect, it } from "vitest";
import { studioOrigin, type RequestOrigin } from "./studio-origin";

const FALLBACK = "https://app.harmony-web.fr";
const none: RequestOrigin = { origin: null, host: null, forwardedHost: null, forwardedProto: null };

describe("studioOrigin : adresse du studio pour le retour du portail de facturation", () => {
  it("STUDIO_BASE_URL d'abord, sans barre finale, quelle que soit la requête", () => {
    const request = { ...none, origin: "https://autre.example", host: "autre.example" };
    expect(studioOrigin("https://app.harmony-web.fr", request, FALLBACK)).toBe("https://app.harmony-web.fr");
    expect(studioOrigin(" https://harmony-studio.vercel.app/ ", request, FALLBACK)).toBe("https://harmony-studio.vercel.app");
    expect(studioOrigin("http://localhost:3002", request, FALLBACK)).toBe("http://localhost:3002");
    // Un chemin de base éventuel est gardé
    expect(studioOrigin("https://exemple.fr/studio/", request, FALLBACK)).toBe("https://exemple.fr/studio");
  });

  it("variable absente, vide ou qui n'est pas une adresse web : origine de la requête", () => {
    const request = { ...none, origin: "https://studio.exemple.fr", host: "interne:3002" };
    for (const configured of [undefined, "", "   ", "localhost:3002", "ftp://exemple.fr", "pas une adresse"]) {
      expect(studioOrigin(configured, request, FALLBACK)).toBe("https://studio.exemple.fr");
    }
    expect(studioOrigin(undefined, { ...none, origin: "http://localhost:3036" }, FALLBACK)).toBe("http://localhost:3036");
    // Seule l'origine est gardée, jamais un chemin
    expect(studioOrigin(undefined, { ...none, origin: "https://studio.exemple.fr/compte?x=1" }, FALLBACK)).toBe("https://studio.exemple.fr");
  });

  it("sans en-tête Origin exploitable : hôte de la requête, protocole transmis par le serveur frontal", () => {
    expect(studioOrigin(undefined, { origin: "null", host: "interne:3002", forwardedHost: "app.exemple.fr", forwardedProto: "https" }, FALLBACK)).toBe(
      "https://app.exemple.fr",
    );
    expect(studioOrigin(undefined, { ...none, host: "app.exemple.fr", forwardedProto: "https, http" }, FALLBACK)).toBe("https://app.exemple.fr");
    // Sans protocole transmis : https, sauf en local
    expect(studioOrigin(undefined, { ...none, host: "app.exemple.fr" }, FALLBACK)).toBe("https://app.exemple.fr");
    expect(studioOrigin(undefined, { ...none, host: "localhost:3002" }, FALLBACK)).toBe("http://localhost:3002");
    expect(studioOrigin(undefined, { ...none, host: "127.0.0.1:3002" }, FALLBACK)).toBe("http://127.0.0.1:3002");
    expect(studioOrigin(undefined, { ...none, host: "app.exemple.fr", forwardedProto: "javascript" }, FALLBACK)).toBe("https://app.exemple.fr");
  });

  it("rien d'exploitable : adresse de repli ; jamais l'ancienne adresse locale en dur", () => {
    expect(studioOrigin(undefined, none, FALLBACK)).toBe(FALLBACK);
    expect(studioOrigin(undefined, { ...none, host: "hôte invalide/" }, `${FALLBACK}/`)).toBe(FALLBACK);
    expect(studioOrigin("https://app.harmony-web.fr", none, FALLBACK)).not.toContain("localhost");
  });
});
