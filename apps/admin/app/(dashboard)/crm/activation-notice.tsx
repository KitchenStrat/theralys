const CODE = "rounded bg-white px-1.5 py-0.5 font-mono text-[13px]";

/**
 * Entre le déploiement et la migration 0012, le CRM et l'onglet Équipe
 * attendent : le reste de l'admin, lui, fonctionne comme avant.
 */
export function SalesActivationNotice({ title }: { title: string }) {
  return (
    <div role="status" className="rounded-2xl border border-warning-500/40 bg-warning-100 p-5 text-sm text-ink-900">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1">
        Cette page attend une mise à jour de la base : appliquez la migration <code className={CODE}>0012_crm_sales</code> (commande <code className={CODE}>pnpm db:migrate</code>, ou le fichier{" "}
        <code className={CODE}>packages/db/drizzle/0012_crm_sales.sql</code> dans la console Neon). Vos prospects et leur historique sont intacts : ils réapparaissent dès qu&apos;elle est passée. Le reste de l&apos;admin fonctionne normalement.
      </p>
    </div>
  );
}
