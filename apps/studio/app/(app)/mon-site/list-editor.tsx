"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ds";
import { frenchSpacing } from "@/lib/external-site/format";

let uidCount = 0;

/** Repère d'une ligne ajoutée dans un formulaire (ceux des lignes venues du profil commencent par une autre lettre). */
export function newUid(): string {
  uidCount += 1;
  return `n${uidCount}`;
}

/**
 * Liste modifiable ligne à ligne : ajouter, modifier, retirer. Le nombre de
 * lignes est borné (`max`, une limite du contrat) : arrivé au plafond, le
 * bouton d'ajout laisse place à une phrase qui le dit. Après un ajout, le
 * focus va au premier champ de la nouvelle ligne ; après un retrait, au
 * bouton d'ajout — jamais perdu.
 */
export function ListEditor<T extends { uid: string }>({
  id,
  legend,
  hint,
  items,
  onChange,
  max,
  addLabel,
  maxLabel,
  itemLabel,
  showItemLabel = true,
  blank,
  fieldId,
  disabled,
  children,
}: {
  id: string;
  legend: string;
  hint?: string;
  items: T[];
  onChange: (items: T[]) => void;
  max: number;
  /** « Ajouter une question » */
  addLabel: string;
  /** « 7 questions au plus. » */
  maxLabel: string;
  /** Nom d'une ligne, pour son groupe et son bouton « Retirer » : « Question 2 » */
  itemLabel: (index: number) => string;
  /** Afficher ce nom en tête de ligne (inutile quand le libellé du champ le dit déjà : « Paragraphe 2 ») */
  showItemLabel?: boolean;
  blank: () => T;
  /** Identifiant du premier champ d'une ligne */
  fieldId: (item: T) => string;
  disabled?: boolean;
  children: (item: T, index: number, update: (next: T) => void) => ReactNode;
}) {
  const focusNext = useRef<string | null>(null);
  const addId = `${id}-add`;

  // Après le rendu qui suit un ajout ou un retrait : le focus rejoint l'élément prévu
  useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  function add() {
    const item = blank();
    focusNext.current = fieldId(item);
    onChange([...items, item]);
  }

  function remove(uid: string) {
    focusNext.current = addId;
    onChange(items.filter((item) => item.uid !== uid));
  }

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-ds-body font-semibold text-ds-ink-900">{legend}</legend>
      {hint ? <p className="mt-0.5 text-ds-meta text-ds-ink-600">{frenchSpacing(hint)}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-3">
          {items.map((item, index) => (
            <li key={item.uid}>
              <div role="group" aria-label={itemLabel(index)} className="rounded-ds-md bg-white p-3 ring-1 ring-ds-ink-200 sm:p-4">
                {showItemLabel ? (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p aria-hidden className="text-ds-body font-semibold text-ds-section-ink">
                      {itemLabel(index)}
                    </p>
                    <RemoveButton label={itemLabel(index)} onClick={() => remove(item.uid)} />
                  </div>
                ) : null}
                <div className="space-y-3">{children(item, index, (next) => onChange(items.map((current) => (current.uid === item.uid ? next : current))))}</div>
                {showItemLabel ? null : (
                  <div className="mt-2 flex justify-end">
                    <RemoveButton label={itemLabel(index)} onClick={() => remove(item.uid)} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        {items.length < max ? (
          <Button id={addId} type="button" variant="secondary" size="sm" icon={<Plus size={16} aria-hidden />} onClick={add}>
            {addLabel}
          </Button>
        ) : (
          <p className="text-ds-meta text-ds-ink-600">{maxLabel}</p>
        )}
      </div>
    </fieldset>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="quiet" size="sm" icon={<Trash2 size={16} aria-hidden />} onClick={onClick} aria-label={`Retirer : ${label}`}>
      Retirer
    </Button>
  );
}
