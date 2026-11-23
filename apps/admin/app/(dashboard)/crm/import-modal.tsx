"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Button, FieldHint, Input, Label, Modal, Select } from "@theralys/ui";
import { filtersHref, EMPTY_FILTERS } from "@/lib/crm/filters";
import { TARGET_OPTIONS, applyMapping, guessMapping, type TargetField } from "@/lib/crm/mapping";
import { CRM_STAGES, STAGE_META, displayName, type CrmStage } from "@/lib/crm/model";
import { formatPhone } from "@/lib/crm/normalize";
import { ACCEPTED_EXTENSIONS, FORMAT_LABELS, MAX_IMPORT_ROWS, parseImportFile, parsePasted, tableOf, type ParsedImport } from "@/lib/crm/parse";
import type { RepOption } from "@/lib/crm/team";
import { finishImport, importRows, startImport, type ImportCounts } from "./actions";

const BATCH = 200;
const IDENTIFYING: TargetField[] = ["firstName", "lastName", "fullName", "company", "email", "phone"];

type Duplicates = "skip" | "merge" | "create";
type Step = "source" | "mapping" | "running" | "done";

/**
 * Import d'une liste de prospects en trois temps : le fichier (ou un
 * copier-coller), la correspondance de ses colonnes avec les champs d'un
 * prospect, puis l'enregistrement par lots avec dédoublonnage. Le fichier est
 * lu dans le navigateur ; seules les lignes mises au propre partent au serveur.
 * `reps` : commerciaux à qui la liste peut être attribuée d'emblée.
 */
export function ImportModal({ open, onClose, reps }: { open: boolean; onClose: () => void; reps: RepOption[] }) {
  const assignable = reps.filter((rep) => !rep.disabled);
  const router = useRouter();
  const [step, setStep] = useState<Step>("source");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pasted, setPasted] = useState("");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [source, setSource] = useState("");
  const [stage, setStage] = useState<CrmStage>("new");
  const [tags, setTags] = useState("");
  const [duplicates, setDuplicates] = useState<Duplicates>("skip");
  const [ownerId, setOwnerId] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [counts, setCounts] = useState<ImportCounts & { rejected: number }>({ created: 0, updated: 0, skipped: 0, rejected: 0 });
  const [importId, setImportId] = useState<string | null>(null);
  const cancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelled.current = false;
    setStep("source");
    setError(null);
    setPasted("");
    setParsed(null);
    setFilename("");
    setTags("");
    setStage("new");
    setDuplicates("skip");
    setOwnerId("");
    setImportId(null);
  }, [open]);

  const sheet = parsed?.sheets[sheetIndex] ?? null;
  const table = useMemo(() => (sheet ? tableOf(sheet, hasHeader) : null), [sheet, hasHeader]);
  // La correspondance est proposée à nouveau quand la feuille ou la ligne de titres change
  useEffect(() => {
    if (table) setMapping(guessMapping(table.headers, table.rows.slice(0, 40)));
  }, [table]);
  const mapped = useMemo(() => (table && mapping.length === table.headers.length ? applyMapping(table.headers, table.rows, mapping) : null), [table, mapping]);
  const identified = mapping.some((field) => IDENTIFYING.includes(field));

  function accept(result: ParsedImport, name: string) {
    setParsed(result);
    setSheetIndex(0);
    setHasHeader(result.sheets[0]?.hasHeader ?? true);
    setFilename(name);
    setSource(name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60));
    setError(null);
    setStep("mapping");
  }

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    try {
      accept(await parseImportFile(file.name, new Uint8Array(await file.arrayBuffer())), file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ce fichier n'a pas pu être lu.");
    } finally {
      setReading(false);
    }
  }

  function readPasted() {
    try {
      accept(parsePasted(pasted), "Liste collée");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ce texte n'a pas pu être lu.");
    }
  }

  async function run() {
    if (!mapped || !parsed || mapped.drafts.length === 0) return;
    setStep("running");
    setError(null);
    const total = mapped.drafts.length;
    setProgress({ done: 0, total });
    const running = { created: 0, updated: 0, skipped: 0, rejected: mapped.rejected };
    setCounts(running);
    const started = await startImport({ filename, format: parsed.format, source: source.trim(), totalRows: total });
    if (!started.ok) {
      setError(started.error);
      setStep("mapping");
      return;
    }
    setImportId(started.importId);
    const listTags = tags
      .split(/[,;]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    for (let start = 0; start < total; start += BATCH) {
      if (cancelled.current) break;
      const result = await importRows({ importId: started.importId, rows: mapped.drafts.slice(start, start + BATCH), duplicates, stage, tags: listTags, ownerId: ownerId || null });
      if (!result.ok) {
        setError(`${result.error} L'import s'est arrêté à la ligne ${start + 1} : ce qui précède est enregistré.`);
        break;
      }
      running.created += result.created;
      running.updated += result.updated;
      running.skipped += result.skipped;
      setCounts({ ...running });
      setProgress({ done: Math.min(total, start + BATCH), total });
    }
    await finishImport(started.importId);
    setStep("done");
    router.refresh();
  }

  function close() {
    cancelled.current = true;
    onClose();
  }

  const title = step === "source" ? "Importer une liste de prospects" : step === "mapping" ? "Vérifier les colonnes" : step === "running" ? "Import en cours" : "Import terminé";

  return (
    <Modal open={open} onClose={close} title={title} size="xl">
      {step === "source" ? (
        <div className="space-y-5">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className={clsx("rounded-2xl border-2 border-dashed p-8 text-center transition-colors", dragOver ? "border-primary-500 bg-primary-50" : "border-cream-300 bg-cream-50")}
          >
            <p className="text-base font-semibold text-ink-900">Déposez votre fichier ici</p>
            <p className="mt-1 text-sm text-ink-700">CSV, Excel (.xlsx), JSON ou carnet d&apos;adresses vCard (.vcf), jusqu&apos;à 15 Mo et {MAX_IMPORT_ROWS.toLocaleString("fr-FR")} lignes.</p>
            <input
              ref={fileInput}
              id="crm-import-file"
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
            <Button type="button" className="mt-4" disabled={reading} onClick={() => fileInput.current?.click()}>
              {reading ? "Lecture du fichier…" : "Choisir un fichier"}
            </Button>
          </div>

          <div>
            <Label htmlFor="crm-import-paste">Ou collez une liste copiée depuis un tableur</Label>
            <textarea
              id="crm-import-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={5}
              className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 font-mono text-xs text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
              placeholder={"Nom\tE-mail\tTéléphone\tVille\nClaire Dupont\tclaire@exemple.fr\t06 12 34 56 78\tAlbi"}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <FieldHint>Sélectionnez vos cellules dans Excel ou Google Sheets, copiez, collez.</FieldHint>
              <Button type="button" variant="secondary" disabled={pasted.trim() === ""} onClick={readPasted}>
                Lire la liste collée
              </Button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-danger-100 px-3 py-2 text-sm text-danger-500">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "mapping" && parsed && table ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-700">
            <p>
              <strong className="font-semibold text-ink-900">{filename}</strong> · {FORMAT_LABELS[parsed.format]} · {table.rows.length.toLocaleString("fr-FR")} ligne{table.rows.length > 1 ? "s" : ""}
            </p>
            {parsed.sheets.length > 1 ? (
              <label className="flex items-center gap-2">
                Feuille
                <Select className="!w-auto" value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); setHasHeader(parsed.sheets[index]?.hasHeader ?? true); }}>
                  {parsed.sheets.map((entry, index) => (
                    <option key={entry.name} value={index}>
                      {entry.name} ({entry.rows.length})
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} className="h-4 w-4 accent-primary-600" />
              La première ligne contient les titres des colonnes
            </label>
          </div>
          {sheet?.truncated ? <p className="rounded-xl bg-warning-100 px-3 py-2 text-sm text-ink-900">Ce fichier dépasse {MAX_IMPORT_ROWS.toLocaleString("fr-FR")} lignes : seules les premières seront importées. Importez la suite dans un second fichier.</p> : null}

          <div className="max-h-[22rem] overflow-auto rounded-xl border border-cream-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-cream-100 text-left text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Colonne du fichier</th>
                  <th className="px-3 py-2 font-medium">Exemples</th>
                  <th className="px-3 py-2 font-medium">Champ du prospect</th>
                </tr>
              </thead>
              <tbody>
                {table.headers.map((header, column) => {
                  const samples = table.rows
                    .map((row) => (row[column] ?? "").trim())
                    .filter(Boolean)
                    .slice(0, 3);
                  return (
                    <tr key={column} className="border-t border-cream-200 align-middle">
                      <td className="px-3 py-2 font-medium text-ink-900">{header}</td>
                      <td className="max-w-[18rem] px-3 py-2 text-xs text-ink-500">
                        <span className="block truncate" title={samples.join(" · ")}>
                          {samples.length > 0 ? samples.join(" · ") : "(vide)"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <label className="sr-only" htmlFor={`crm-map-${column}`}>
                          Champ du prospect pour la colonne {header}
                        </label>
                        <Select
                          id={`crm-map-${column}`}
                          value={mapping[column] ?? "ignore"}
                          onChange={(event) => setMapping((current) => current.map((field, index) => (index === column ? (event.target.value as TargetField) : field)))}
                          className={clsx((mapping[column] ?? "ignore") === "ignore" && "text-ink-500")}
                        >
                          {TARGET_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={clsx("grid gap-4", assignable.length > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
            <div>
              <Label htmlFor="crm-import-source">Provenance de la liste</Label>
              <Input id="crm-import-source" value={source} onChange={(event) => setSource(event.target.value)} maxLength={60} placeholder="Annuaire, salon, achat de fichier…" />
              <FieldHint>Reprise sur chaque prospect : elle se filtre ensuite.</FieldHint>
            </div>
            <div>
              <Label htmlFor="crm-import-stage">Étape de départ</Label>
              <Select id="crm-import-stage" value={stage} onChange={(event) => setStage(event.target.value as CrmStage)}>
                {CRM_STAGES.map((entry) => (
                  <option key={entry} value={entry}>
                    {STAGE_META[entry].label}
                  </option>
                ))}
              </Select>
              <FieldHint>Sauf si une colonne donne l&apos;étape.</FieldHint>
            </div>
            <div>
              <Label htmlFor="crm-import-tags">Étiquettes à poser</Label>
              <Input id="crm-import-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="salon 2026, sophrologues" />
              <FieldHint>Séparées par des virgules.</FieldHint>
            </div>
            {assignable.length > 0 ? (
              <div>
                <Label htmlFor="crm-import-owner">Attribuer à</Label>
                <Select id="crm-import-owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                  <option value="">Personne (non attribué)</option>
                  {assignable.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
                </Select>
                <FieldHint>Pour les prospects créés ; les fiches existantes gardent leur commercial.</FieldHint>
              </div>
            ) : null}
          </div>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-ink-700">Si un prospect existe déjà (même e-mail, même téléphone, ou même nom dans la même ville)</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["skip", "Ne pas y toucher", "La fiche existante reste telle quelle."],
                  ["merge", "Compléter sa fiche", "Les champs vides sont remplis, les étiquettes ajoutées."],
                  ["create", "Créer quand même", "Aucun dédoublonnage."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className={clsx("flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm", duplicates === value ? "border-primary-500 bg-primary-50" : "border-cream-300 bg-white")}>
                  <input type="radio" name="crm-import-duplicates" value={value} checked={duplicates === value} onChange={() => setDuplicates(value)} className="mt-0.5 h-4 w-4 accent-primary-600" />
                  <span>
                    <span className="font-medium text-ink-900">{label}</span>
                    <span className="block text-xs text-ink-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mapped && mapped.drafts.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium text-ink-700">Aperçu des premiers prospects</p>
              <div className="overflow-x-auto rounded-xl border border-cream-200">
                <table className="w-full text-xs">
                  <tbody>
                    {mapped.drafts.slice(0, 4).map((draft, index) => (
                      <tr key={index} className="border-t border-cream-200 first:border-0">
                        <td className="px-3 py-1.5 font-medium text-ink-900">{displayName(draft)}</td>
                        <td className="px-3 py-1.5 text-ink-700">{[draft.profession, draft.city].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-1.5 text-ink-700">{draft.email || "—"}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-ink-700">{formatPhone(draft.phone) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger-100 px-3 py-2 text-sm text-danger-500">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4">
            <p className="text-sm text-ink-700" aria-live="polite">
              {!identified
                ? "Indiquez au moins la colonne du nom, du cabinet, de l'e-mail ou du téléphone."
                : mapped
                  ? `${mapped.drafts.length.toLocaleString("fr-FR")} prospect${mapped.drafts.length > 1 ? "s" : ""} à importer${mapped.rejected > 0 ? ` · ${mapped.rejected.toLocaleString("fr-FR")} ligne${mapped.rejected > 1 ? "s" : ""} sans nom ni contact écartée${mapped.rejected > 1 ? "s" : ""}` : ""}`
                  : ""}
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep("source")}>
                Changer de fichier
              </Button>
              <Button type="button" disabled={!identified || !mapped || mapped.drafts.length === 0} onClick={() => void run()}>
                Importer {mapped && mapped.drafts.length > 0 ? `${mapped.drafts.length.toLocaleString("fr-FR")} prospect${mapped.drafts.length > 1 ? "s" : ""}` : ""}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "running" ? (
        <div className="py-6 text-center">
          <p className="text-base font-semibold text-ink-900" aria-live="polite">
            {progress.done.toLocaleString("fr-FR")} sur {progress.total.toLocaleString("fr-FR")} lignes traitées
          </p>
          <div className="mx-auto mt-4 h-2.5 max-w-md overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Avancement de l'import">
            <div className="h-full rounded-full bg-primary-500 transition-[width] duration-300" style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="mt-3 text-sm text-ink-500">Gardez cette fenêtre ouverte jusqu&apos;à la fin.</p>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Count label="Prospects créés" value={counts.created} strong />
            <Count label="Fiches complétées" value={counts.updated} />
            <Count label="Lignes ignorées" value={counts.skipped + counts.rejected} hint={counts.skipped + counts.rejected > 0 ? "doublons, ou lignes sans nom ni contact" : undefined} />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-danger-100 px-3 py-2 text-sm text-danger-500">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={close}>
              Fermer
            </Button>
            {importId && counts.created > 0 ? (
              <Button
                type="button"
                onClick={() => {
                  close();
                  router.push(filtersHref({ ...EMPTY_FILTERS, view: "liste", importId }));
                }}
              >
                Voir cette liste
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Count({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-4", strong ? "border-success-500/30 bg-success-100" : "border-cream-200 bg-cream-50")}>
      <p className="text-2xl font-bold text-ink-900 tabular-nums">{value.toLocaleString("fr-FR")}</p>
      <p className="text-sm text-ink-700">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
