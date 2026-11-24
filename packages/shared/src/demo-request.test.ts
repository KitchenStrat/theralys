import { describe, expect, it } from "vitest";
import { DEMO_LIMITS, appendNotes, cleanEmail, callablePhone, demoDetailsNotes, demoLeadNotes } from "./demo-request";

describe("téléphone d'une demande de démo", () => {
  it("un numéro français s'écrit comme on veut : espaces, points, tirets", () => {
    expect(callablePhone("06 12 34 56 78")).toBe("0612345678");
    expect(callablePhone("06.12.34.56.78")).toBe("0612345678");
    expect(callablePhone(" 05-63-12-34-56 ")).toBe("0563123456");
    expect(callablePhone("0612345678")).toBe("0612345678");
  });

  it("avec son indicatif : +33, 0033, ou un numéro d'un autre pays", () => {
    expect(callablePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(callablePhone("0033 6 12 34 56 78")).toBe("+33612345678");
    expect(callablePhone("+32 470 12 34 56")).toBe("+32470123456");
    expect(callablePhone("+41 (0)79 123 45 67".replace("(0)", ""))).toBe("+41791234567");
  });

  it("refusé : trop court, trop long, des lettres, rien", () => {
    for (const wrong of ["", "   ", "0612", "06 12 34 56", "06 12 34 56 78 9", "1612345678", "mon numéro", "06 12 34 56 7a", "+0612345678", "+33", "+1234567890123456", null, 612345678]) {
      expect(callablePhone(wrong), String(wrong)).toBeNull();
    }
    expect(callablePhone("0".repeat(DEMO_LIMITS.phone + 1))).toBeNull();
  });
});

describe("notes d'une demande de démo", () => {
  it("« Métier à Ville » : le format que le CRM sait relire", () => {
    expect(demoLeadNotes({ profession: " Sophrologue ", city: "Albi" })).toBe("Sophrologue à Albi");
    expect(demoLeadNotes({ profession: "Naturopathe" })).toBe("Naturopathe");
    expect(demoLeadNotes({ city: "Lyon" })).toBe("Lyon");
    expect(demoLeadNotes({})).toBe("");
    // Rien qui casse la ligne : retours à la ligne et espaces resserrés, longueur bornée
    expect(demoLeadNotes({ profession: "Sophro\nlogue", city: "  Saint   Juéry " })).toBe("Sophro logue à Saint Juéry");
    expect(demoLeadNotes({ profession: "a".repeat(500) })).toHaveLength(DEMO_LIMITS.profession);
  });

  it("les précisions : site actuel et mot sur la pratique, seulement ce qui est rempli", () => {
    expect(demoDetailsNotes({ currentSite: "www.mon-cabinet.fr", message: "Sophrologie et sommeil.\r\n\r\n\r\nEn cabinet." })).toBe("Site actuel : www.mon-cabinet.fr — Sophrologie et sommeil.\n\nEn cabinet.");
    expect(demoDetailsNotes({ message: "  Gestion du   stress " })).toBe("Gestion du stress");
    expect(demoDetailsNotes({ currentSite: "", message: " " })).toBe("");
    expect(demoDetailsNotes({ currentSite: 12, message: null })).toBe("");
  });

  it("ajoutées à la note sans la répéter ni la faire déborder", () => {
    expect(appendNotes("Sophrologue à Albi", "Site actuel : www.mon-cabinet.fr")).toBe("Sophrologue à Albi — Site actuel : www.mon-cabinet.fr");
    expect(appendNotes(null, "Gestion du stress")).toBe("Gestion du stress");
    expect(appendNotes("Sophrologue à Albi", "")).toBe("Sophrologue à Albi");
    // Un second envoi des mêmes précisions ne les double pas
    expect(appendNotes("Sophrologue à Albi — Gestion du stress", "Gestion du stress")).toBe("Sophrologue à Albi — Gestion du stress");
    expect(appendNotes("a".repeat(3990), "b".repeat(100))).toHaveLength(DEMO_LIMITS.notes);
  });
});

describe("adresse e-mail", () => {
  it("plausible ou rien", () => {
    expect(cleanEmail(" claire@exemple.fr ")).toBe("claire@exemple.fr");
    expect(cleanEmail("claire.dupont+pro@cabinet-albi.example")).toBe("claire.dupont+pro@cabinet-albi.example");
    for (const wrong of ["", "claire", "claire@", "claire@exemple", "cl aire@exemple.fr", "a@b.c", "<script>@exemple.fr", "claire@exemple.fr, autre@exemple.fr", null, 42]) {
      expect(cleanEmail(wrong), String(wrong)).toBeNull();
    }
    expect(cleanEmail(`${"a".repeat(DEMO_LIMITS.email)}@exemple.fr`)).toBeNull();
  });
});
