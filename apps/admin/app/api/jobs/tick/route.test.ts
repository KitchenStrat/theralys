import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as DbModule from "@theralys/db";
import type * as JobsModule from "@theralys/jobs";
import { TICK_GROUPS, runTicks, type TickReport } from "@theralys/jobs";
import { alignLegacyAccounts } from "@/lib/formulas";
import { GET } from "./route";

// Ni base ni tâche réelle : la route est testée seule (secret, liste blanche des groupes, statut de la réponse)
vi.mock("@theralys/db", async (importOriginal) => ({ ...(await importOriginal<typeof DbModule>()), getDb: () => ({}) }));
vi.mock("@/lib/formulas", () => ({ alignLegacyAccounts: vi.fn(async () => 0) }));
vi.mock("@theralys/jobs", async (importOriginal) => ({ ...(await importOriginal<typeof JobsModule>()), runTicks: vi.fn() }));

const SECRET = "secret-du-cron-de-test";
const ok = (task: string, processed = 0): TickReport => ({ task, processed, status: "ok" });

function call(query = "", authorization: string | null = `Bearer ${SECRET}`): Promise<Response> {
  const headers = authorization === null ? undefined : { authorization };
  return GET(new NextRequest(`https://admin.exemple.fr/api/jobs/tick${query}`, { headers }));
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.mocked(runTicks).mockReset();
  vi.mocked(alignLegacyAccounts).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/jobs/tick", () => {
  it("sans secret, avec un mauvais secret, ou sans CRON_SECRET configuré : 401, aucune tâche lancée", async () => {
    for (const authorization of [null, "Bearer autre-secret", SECRET, ""]) {
      const response = await call("?task=redaction", authorization);
      expect(response.status).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("", "Bearer ")).status).toBe(401);
    expect(runTicks).not.toHaveBeenCalled();
    expect(alignLegacyAccounts).not.toHaveBeenCalled();
  });

  it("?task=<groupe> : n'exécute que ce groupe ; chaque groupe du cron est accepté", async () => {
    for (const group of TICK_GROUPS) {
      vi.mocked(runTicks).mockResolvedValueOnce([ok(`tâche du groupe ${group}`, 2)]);
      const response = await call(`?task=${group}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, reports: [{ task: `tâche du groupe ${group}`, processed: 2, status: "ok" }] });
      expect(runTicks).toHaveBeenLastCalledWith(group);
    }
    expect(runTicks).toHaveBeenCalledTimes(TICK_GROUPS.length);
  });

  it("groupe inconnu : 400 avec la liste des groupes, aucune tâche lancée", async () => {
    for (const query of ["?task=tout", "?task=", "?task=generate-articles", "?task=Redaction", "?task=redaction%20"]) {
      const response = await call(query);
      expect(response.status, query).toBe(400);
      expect(await response.json()).toEqual({ error: "Tâche inconnue", tasks: [...TICK_GROUPS] });
    }
    expect(runTicks).not.toHaveBeenCalled();
  });

  it("sans paramètre : tout est exécuté en un passage (lancement à la main)", async () => {
    vi.mocked(runTicks).mockResolvedValueOnce([ok("publish-articles", 3), ok("generate-articles", 12)]);
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(runTicks).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(alignLegacyAccounts).toHaveBeenCalledTimes(1);
  });

  it("une tâche en erreur : 500, les rapports de toutes les tâches dans le corps, sans rien d'autre que le type de l'erreur", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runTicks).mockResolvedValueOnce([ok("publish-articles", 3), { task: "generate-articles", processed: 0, status: "error", failed: 8, error: "Error 429" }, ok("sync-google")]);
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      reports: [
        { task: "publish-articles", processed: 3, status: "ok" },
        { task: "generate-articles", processed: 0, status: "error", failed: 8, error: "Error 429" },
        { task: "sync-google", processed: 0, status: "ok" },
      ],
    });
    expect(error.mock.calls.flat().join("\n")).toBe("[ticks] 1 tâche(s) en erreur : generate-articles (Error 429)");
  });

  it("des éléments en échec dans une tâche par ailleurs aboutie : 200 (le rapport porte `failed`)", async () => {
    vi.mocked(runTicks).mockResolvedValueOnce([{ task: "generate-articles", processed: 30, status: "ok", failed: 2 }]);
    const response = await call("?task=redaction");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reports: [{ task: "generate-articles", processed: 30, status: "ok", failed: 2 }] });
  });

  it("alignement des comptes en panne : journalisé, les tâches tournent quand même", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(alignLegacyAccounts).mockRejectedValueOnce(new TypeError("connexion refusée"));
    vi.mocked(runTicks).mockResolvedValueOnce([ok("publish-articles")]);
    expect((await call("?task=publication")).status).toBe(200);
    expect(error).toHaveBeenCalledWith("[formules] alignement des comptes impossible", "TypeError");
  });
});
