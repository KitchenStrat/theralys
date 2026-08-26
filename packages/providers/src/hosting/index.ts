/**
 * Hébergement retenu : Vercel (décision kickoff Phase 3) — domaines custom +
 * wildcard gérés nativement, SSL automatique, adapté à ~100 sites.
 * Le rattachement d'un domaine au projet `apps/sites` passe par l'API Domains.
 */

export type DomainAttachment = {
  domain: string;
  attached: boolean;
  sslReady: boolean;
};

export interface HostingProvider {
  readonly mode: "vercel" | "mock";
  /** Rattache le domaine au projet Vercel des sites publics. */
  attachDomain(domain: string): Promise<DomainAttachment>;
}

export class VercelHostingProvider implements HostingProvider {
  readonly mode = "vercel" as const;

  constructor(
    private readonly token: string,
    private readonly projectId: string,
    private readonly teamId?: string,
  ) {}

  private url(path: string): string {
    const base = `https://api.vercel.com${path}`;
    return this.teamId ? `${base}?teamId=${this.teamId}` : base;
  }

  async attachDomain(domain: string): Promise<DomainAttachment> {
    await this.addProjectDomain({ name: domain });
    // www.<domaine> : rattaché avec redirection permanente vers le domaine nu
    // (le CNAME créé chez OVH pointe déjà vers Vercel — sans ce rattachement,
    // les visiteurs tapant www tomberaient sur une erreur).
    await this.addProjectDomain({
      name: `www.${domain}`,
      redirect: domain,
      redirectStatusCode: 308,
    });
    const verify = await fetch(this.url(`/v9/projects/${this.projectId}/domains/${domain}`), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const info = verify.ok ? ((await verify.json()) as { verified?: boolean }) : {};
    return { domain, attached: true, sslReady: Boolean(info.verified) };
  }

  private async addProjectDomain(body: {
    name: string;
    redirect?: string;
    redirectStatusCode?: number;
  }): Promise<void> {
    const response = await fetch(this.url(`/v10/projects/${this.projectId}/domains`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    // 409 = domaine déjà rattaché : considéré comme un succès idempotent
    if (!response.ok && response.status !== 409) {
      throw new Error(
        `Vercel domains ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
  }
}

export class MockHostingProvider implements HostingProvider {
  readonly mode = "mock" as const;

  async attachDomain(domain: string): Promise<DomainAttachment> {
    return { domain, attached: true, sslReady: true };
  }
}

export function createHostingProvider(env: NodeJS.ProcessEnv = process.env): HostingProvider {
  return env.VERCEL_TOKEN && env.VERCEL_SITES_PROJECT_ID
    ? new VercelHostingProvider(env.VERCEL_TOKEN, env.VERCEL_SITES_PROJECT_ID, env.VERCEL_TEAM_ID)
    : new MockHostingProvider();
}
