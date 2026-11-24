import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { PUBLIC_PATHS, homeFor, isStaffRole, routeFor, salesMayOpen } from "./staff";

const CONTACT = "/crm/b6bed027-6656-4734-926f-501605751fdc";

describe("qui entre dans le back-office, et où", () => {
  it("deux rôles seulement : un compte client n'en fait pas partie", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("sales")).toBe(true);
    for (const other of ["client", "agency", "", null, undefined, 1, {}]) expect(isStaffRole(other)).toBe(false);
    expect(homeFor("admin")).toBe("/");
    expect(homeFor("sales")).toBe("/crm");
  });

  it("un commercial n'ouvre que le CRM, ses fiches et la base de questions", () => {
    expect(salesMayOpen("/crm")).toBe(true);
    expect(salesMayOpen(CONTACT)).toBe(true);
    expect(salesMayOpen(CONTACT.toUpperCase().replace("/CRM/", "/crm/"))).toBe(true);
    expect(salesMayOpen("/crm/questions")).toBe(true);
  });

  it("tout le reste lui est fermé, corbeille et export du CRM compris", () => {
    for (const path of ["/", "/clients", "/demos", "/demos/b6bed027-6656-4734-926f-501605751fdc/edit", "/leads", "/couts", "/equipe", "/equipe/b6bed027-6656-4734-926f-501605751fdc", "/crm/corbeille", "/crm/export", "/crm/", `${CONTACT}/`, `${CONTACT}/export`, "/crm/import", "/crmx", "/crm/../clients", "/crm/questions/", "/crm/questions/export", "/crm/questionsx", "/une-page-ajoutee-plus-tard"]) {
      expect(salesMayOpen(path), path).toBe(false);
    }
  });

  it("décision selon le rôle du jeton : passer, retour au CRM, ou connexion", () => {
    expect(routeFor("admin", "/clients")).toBe("pass");
    expect(routeFor("admin", "/equipe")).toBe("pass");
    expect(routeFor("sales", "/crm")).toBe("pass");
    expect(routeFor("sales", CONTACT)).toBe("pass");
    expect(routeFor("sales", "/crm/questions")).toBe("pass");
    expect(routeFor("sales", "/clients")).toBe("crm");
    expect(routeFor("sales", "/crm/corbeille")).toBe("crm");
    expect(routeFor("sales", "/")).toBe("crm");
    for (const role of ["client", "agency", undefined, null, "", "ADMIN"]) expect(routeFor(role, "/crm"), String(role)).toBe("login");
  });
});

describe("garde d'entrée (middleware) : le jeton du cookie décide du chemin", () => {
  const secret = randomBytes(32).toString("hex");
  beforeAll(() => {
    process.env.AUTH_SECRET = secret;
  });

  const token = (claims: Record<string, unknown>, options: { subject?: string | null; key?: string; expired?: boolean } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt(now - 120).setExpirationTime(options.expired ? now - 60 : now + 3600);
    if (options.subject !== null) jwt.setSubject(options.subject ?? "7b6e92c0-a7d3-4f96-9230-c5ad737bd0dc");
    return jwt.sign(new TextEncoder().encode(options.key ?? secret));
  };

  /** Où mène une requête : « pass », ou le chemin de la redirection. */
  async function visit(path: string, cookie?: string): Promise<string> {
    const request = new NextRequest(`https://admin.exemple.test${path}`, cookie ? { headers: { cookie: `tl_admin_session=${cookie}` } } : undefined);
    const response = await middleware(request);
    const location = response.headers.get("location");
    return location ? new URL(location).pathname + new URL(location).search : "pass";
  }

  it("sans session : tout mène à la connexion, sauf les pages publiques et les routes API", async () => {
    expect(await visit("/")).toBe("/login");
    expect(await visit("/crm")).toBe("/login");
    expect(await visit("/equipe")).toBe("/login");
    for (const path of [...PUBLIC_PATHS, "/api/jobs/tick", "/api/stripe/webhook"]) expect(await visit(path), path).toBe("pass");
  });

  it("jeton d'admin : tout passe", async () => {
    const admin = await token({ role: "admin", name: "Admin" });
    for (const path of ["/", "/clients", "/demos", "/couts", "/equipe", "/crm", CONTACT, "/crm/corbeille", "/crm/export?vue=liste"]) expect(await visit(path, admin), path).toBe("pass");
  });

  it("jeton de commercial : le CRM et ses fiches passent, tout le reste revient au CRM (sans garder les paramètres)", async () => {
    const sales = await token({ role: "sales", name: "Julie" });
    expect(await visit("/crm", sales)).toBe("pass");
    expect(await visit("/crm?vue=liste&q=dupont", sales)).toBe("pass");
    expect(await visit(CONTACT, sales)).toBe("pass");
    for (const path of ["/", "/clients", "/demos", "/leads", "/couts", "/equipe", "/equipe/b6bed027-6656-4734-926f-501605751fdc", "/crm/corbeille", "/crm/export?vue=liste&etape=won"]) {
      expect(await visit(path, sales), path).toBe("/crm");
    }
  });

  it("jeton d'un autre usage, expiré, sans sujet ou mal signé : connexion", async () => {
    const refused = [
      await token({ role: "client", siteId: "x" }),
      await token({ role: "agency", siteId: "x" }),
      await token({ purpose: "admin-rep-invitation", pv: "abc" }),
      await token({ purpose: "studio-password-setup" }),
      await token({ role: "sales" }, { expired: true }),
      await token({ role: "admin" }, { expired: true }),
      await token({ role: "sales" }, { subject: null }),
      await token({ role: "admin" }, { key: randomBytes(32).toString("hex") }),
      "pas-un-jeton",
    ];
    for (const cookie of refused) {
      expect(await visit("/crm", cookie)).toBe("/login");
      expect(await visit("/", cookie)).toBe("/login");
    }
  });
});
