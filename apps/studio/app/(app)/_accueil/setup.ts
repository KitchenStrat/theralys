import { NBSP, type ChecklistStep, type SectionKey } from "@/components/ds";
import type { SetupKey, SetupTask } from "@/lib/accueil";

/**
 * Les étapes de mise en route, dites au praticien : à l'impératif tant
 * qu'elles restent à faire, au présent une fois faites. Chacune mène à
 * l'écran où elle se termine d'elle-même (voir `SETUP_KEYS`, lib/accueil.ts).
 */
export const SETUP_COPY: Record<
  SetupKey,
  {
    /** Section dont l'étape porte la couleur dans la « prochaine étape » */
    section: SectionKey;
    todo: string;
    done: string;
    /** Ce que l'étape apporte, en une phrase */
    description: string;
    href: string;
    action: string;
  }
> = {
  connect_google: {
    section: "fiche-google",
    todo: "Connectez votre compte Google",
    done: "Votre compte Google est connecté",
    description: "Pour suivre les recherches qui mènent à votre cabinet. Cela se fait dans l'onglet Visibilité de votre fiche Google.",
    href: "/fiche-google?onglet=visibilite",
    action: "Connecter mon compte",
  },
  verify_pages: {
    section: "mon-site",
    todo: "Vérifiez les pages de votre site",
    done: "Les pages de votre site sont vérifiées",
    description: `Textes, photos, horaires, tarifs${NBSP}: assurez-vous que tout vous ressemble, puis enregistrez.`,
    href: "/editor",
    action: "Ouvrir l'éditeur",
  },
  publish_site: {
    section: "mon-site",
    todo: "Publiez votre site",
    done: "Votre site est publié",
    description: `Dans l'éditeur, enregistrez vos modifications${NBSP}: elles sont en ligne immédiatement.`,
    href: "/editor",
    action: "Ouvrir l'éditeur",
  },
  activate_blog: {
    section: "publications",
    todo: "Activez votre blog",
    done: "Votre blog est activé",
    description: "Choisissez comment vos articles sont publiés et sur quel ton ils sont écrits, dans les paramètres de Publications.",
    href: "/publications",
    action: "Régler mon blog",
  },
};

/** Les étapes telles que les attend la `SetupChecklist` du design system. */
export function checklistSteps(tasks: readonly SetupTask[]): ChecklistStep[] {
  return tasks.map((task) => {
    const copy = SETUP_COPY[task.key];
    return {
      id: task.key,
      label: task.done ? copy.done : copy.todo,
      description: copy.description,
      done: task.done,
      href: copy.href,
      actionLabel: copy.action,
    };
  });
}
