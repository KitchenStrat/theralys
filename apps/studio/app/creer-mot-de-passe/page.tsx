import { eq } from "drizzle-orm";
import { ArrowRight, CircleCheck, LinkIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getDb, users } from "@theralys/db";
import { Card, LinkButton, Stagger } from "@/components/ds";
import { passwordFingerprint } from "@/lib/auth";
import { PASSWORD_RESET_PURPOSE, passwordLinkState, readPasswordLink } from "@/lib/password-links";
import { AuthFrame } from "../login/auth-frame";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Créer mon mot de passe" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string }> };

/** Arrivée depuis l'e-mail d'invitation ou de réinitialisation : le client choisit son mot de passe. */
export default async function SetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const state = await inspectToken(token);

  return (
    <AuthFrame>
      <Stagger>
        <Card padding="lg">
          {state.kind === "ok" ? (
            <>
              <h1 className="font-ds-voice text-ds-title font-bold text-ds-ink-900 text-balance">
                {state.reset ? "Nouveau mot de passe" : `Bienvenue ${state.firstName}`}
              </h1>
              <p className="mt-1.5 text-base text-ds-ink-600">
                {state.reset ? "Choisissez le nouveau mot de passe" : "Choisissez le mot de passe"} de votre espace (
                <span className="[overflow-wrap:anywhere]">{state.email}</span>).
              </p>
              <SetPasswordForm token={token!} reset={state.reset} />
            </>
          ) : state.kind === "stale-reset" ? (
            <Notice icon={LinkIcon} tone="warning" title="Lien expiré ou déjà utilisé">
              <p className="mt-2 text-base text-ds-ink-600">
                Un lien de réinitialisation ne sert qu&apos;une fois, pendant une heure. Demandez-en un nouveau : il arrive par e-mail.
              </p>
              <LinkButton href="/mot-de-passe-oublie" size="lg" iconRight={<ArrowRight size={20} aria-hidden />} className="mt-6 w-full">
                Recevoir un nouveau lien
              </LinkButton>
            </Notice>
          ) : state.kind === "already" ? (
            <Notice icon={CircleCheck} tone="success" title="Compte déjà activé">
              <p className="mt-2 text-base text-ds-ink-600">Votre mot de passe a déjà été créé — connectez-vous simplement.</p>
              <LinkButton href="/login" size="lg" iconRight={<ArrowRight size={20} aria-hidden />} className="mt-6 w-full">
                Se connecter
              </LinkButton>
            </Notice>
          ) : (
            <Notice icon={LinkIcon} tone="warning" title="Lien expiré ou invalide">
              <p className="mt-2 text-base text-ds-ink-600">
                Ce lien d&apos;invitation n&apos;est plus valable. Contactez Harmony pour en recevoir un nouveau.
              </p>
              <p className="mt-6 border-t border-ds-ink-200 pt-5 text-ds-body text-ds-ink-600">
                Vous avez déjà créé votre mot de passe ?
              </p>
              <LinkButton href="/login" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />} className="mt-3 w-full">
                Se connecter
              </LinkButton>
            </Notice>
          )}
        </Card>
      </Stagger>
    </AuthFrame>
  );
}

/** État sans formulaire : un pictogramme, le titre de la page (son seul `h1`), ce qu'il reste à faire. */
function Notice({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: LucideIcon;
  tone: "success" | "warning";
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden
        className={`grid size-14 place-items-center rounded-ds-md ${
          tone === "success" ? "bg-ds-success-100 text-ds-success-700" : "bg-ds-warning-100 text-ds-warning-700"
        }`}
      >
        <Icon size={28} />
      </span>
      <h1 className="mt-5 font-ds-voice text-ds-title font-bold text-ds-ink-900 text-balance">{title}</h1>
      {children}
    </>
  );
}

async function inspectToken(
  token: string | undefined,
): Promise<
  | { kind: "ok"; firstName: string; email: string; reset: boolean }
  | { kind: "already" }
  | { kind: "stale-reset" }
  | { kind: "invalid" }
> {
  const link = await readPasswordLink(token, process.env.AUTH_SECRET);
  if (!link) return { kind: "invalid" };
  const reset = link.purpose === PASSWORD_RESET_PURPOSE;
  const user = await getDb().query.users.findFirst({ where: eq(users.id, link.userId) });
  if (!user || user.role !== "client") return reset ? { kind: "stale-reset" } : { kind: "invalid" };
  const state = passwordLinkState(link, user, passwordFingerprint);
  if (state === "already") return { kind: "already" };
  if (state === "stale") return reset ? { kind: "stale-reset" } : { kind: "invalid" };
  return { kind: "ok", firstName: user.name.split(" ")[0] ?? user.name, email: user.email, reset };
}
