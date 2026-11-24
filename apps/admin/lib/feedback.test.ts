import { describe, expect, it } from "vitest";
import { FEEDBACK_VIEWS, FEEDBACK_VIEW_LABELS, averageRating, feedbackViewFrom, ratingText } from "./feedback";
import { routeFor, salesMayOpen } from "./staff";

describe("avis clients : vues et note moyenne", () => {
  it("la vue vient de l'adresse ; inconnue ou absente, ce sont les nouveaux", () => {
    expect(feedbackViewFrom("all")).toBe("all");
    expect(feedbackViewFrom("done")).toBe("done");
    expect(feedbackViewFrom(undefined)).toBe("new");
    expect(feedbackViewFrom("archives")).toBe("new");
    expect(feedbackViewFrom(["all"])).toBe("new");
    for (const view of FEEDBACK_VIEWS) expect(FEEDBACK_VIEW_LABELS[view]).toBeTruthy();
  });

  it("la moyenne ne compte que les avis notés, à une décimale", () => {
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(13, 3)).toBe(4.3);
    expect(averageRating(15, 3)).toBe(5);
  });

  it("la note s'écrit à la française, sans zéro inutile", () => {
    expect(ratingText(4.5)).toBe("4,5 / 5");
    expect(ratingText(5)).toBe("5 / 5");
  });
});

describe("avis clients : réservés à l'admin", () => {
  it("un commercial n'ouvre pas la page, l'admin oui", () => {
    expect(salesMayOpen("/avis")).toBe(false);
    expect(routeFor("sales", "/avis")).toBe("crm");
    expect(routeFor("admin", "/avis")).toBe("pass");
    expect(routeFor(undefined, "/avis")).toBe("login");
  });
});
