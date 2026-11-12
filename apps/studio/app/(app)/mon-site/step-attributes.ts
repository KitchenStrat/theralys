import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * `StepProgress` (design system) dessine l'attente d'une tâche longue, mais il
 * ne sait porter ni attribut sur ses étapes, ni identifiant sur son titre. Or
 * les parcours automatisés de l'écran « Mon site » s'appuient, pendant la
 * lecture du site, sur `data-testid="reading-step-N"` et `data-state` posés
 * sur le même `<li>` que `aria-current="step"`, et la section est nommée par
 * `aria-labelledby="reading-title"`.
 *
 * Plutôt que de recopier le composant, on prend l'arbre d'éléments qu'il rend
 * (c'est une fonction pure, sans état) et on y ajoute ces attributs : ils
 * sont dans le HTML rendu par le serveur comme dans le navigateur, et le
 * dessin reste celui du design system. `step-attributes.test.ts` vérifie que
 * les attributs arrivent bien là où il faut : si la structure du composant
 * change, le test le dit.
 */

type AnyProps = Record<string, unknown> & { children?: ReactNode };

/** Remplace le premier élément natif du type demandé (`"ol"`, `"h2"`…) dans un arbre d'éléments déjà construit. */
function replaceFirst(tree: ReactNode, type: string, replace: (element: ReactElement<AnyProps>) => ReactNode): ReactNode {
  let done = false;
  const visit = (node: ReactNode): ReactNode => {
    if (done || node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      const next = node.map(visit);
      return next.some((child, index) => child !== node[index]) ? next : node;
    }
    if (!isValidElement<AnyProps>(node)) return node;
    if (node.type === type) {
      done = true;
      return replace(node);
    }
    const children = node.props.children;
    if (children === undefined || children === null) return node;
    // Enfants passés un à un (et non en tableau) : React les tient pour une suite fixe, sans exiger de clés
    if (Array.isArray(children)) {
      const next = children.map(visit);
      return next.some((child, index) => child !== children[index]) ? cloneElement(node, undefined, ...next) : node;
    }
    const next = visit(children);
    return next === children ? node : cloneElement(node, undefined, next);
  };
  return visit(tree);
}

export type StepAttributes = Record<`data-${string}`, string>;

/**
 * Ajoute à l'arbre rendu par `StepProgress` : l'identifiant de son titre, le
 * nom accessible de sa liste d'étapes, et les attributs de chaque étape
 * (`attributes(index)`, dans l'ordre des étapes).
 */
export function withStepAttributes(
  tree: ReactNode,
  options: { heading: "h2" | "h3"; titleId: string; listLabel: string; attributes: (index: number) => StepAttributes },
): ReactNode {
  const titled = replaceFirst(tree, options.heading, (heading) => cloneElement(heading, { id: options.titleId }));
  return replaceFirst(titled, "ol", (list) => {
    const items = Array.isArray(list.props.children) ? list.props.children : [list.props.children];
    return cloneElement(
      list,
      { "aria-label": options.listLabel },
      ...items.map((item: ReactNode, index: number) => (isValidElement<AnyProps>(item) ? cloneElement(item, options.attributes(index)) : item)),
    );
  });
}
