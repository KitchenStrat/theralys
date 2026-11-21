import { NBSP, type ChecklistStep, type SectionKey } from "@/components/ds";
import type { SetupKey, SetupTask } from "@/lib/accueil";
import { BLOG_SETTINGS_HASH, SOCIAL_SETTINGS_HASH } from "@/lib/settings-hash";

/**
 * Les étapes de mise en route, dites au praticien : à l'impératif tant
 * qu'elles restent à faire, au présent une fois faites. Chacune mène à
 * l'écran où elle se termine d'elle-même : c'est l'état du compte qui la dit
 * faite (voir `SETUP_KEYS`, lib/accueil.ts), jamais une case à cocher.
 */
export const SETUP_COPY: Record<
  SetupKey,
  {
    /** Section dont l'étape porte la couleur dans la « prochaine étape » */
    section: SectionKey;
    todo: string;
    done: string;
    /** Ce que l'étape apporte, et où elle se fait, en une phrase ou deux */
    description: string;
    href: string;
    action: string;
  }
> = {
  verify_pages: {
    section: "mon-site",
    todo: "Vérifiez les pages de votre site",
    done: "Votre site a été relu dans l'éditeur",
    description: `Textes, photos, horaires, tarifs${NBSP}: assurez-vous que tout vous ressemble, puis enregistrez.`,
    href: "/editor",
    action: "Ouvrir l'éditeur",
  },
  booking_link: {
    section: "mon-site",
    todo: "Ajoutez votre lien de prise de rendez-vous",
    done: "Votre lien de prise de rendez-vous est en place",
    description: `Vos visiteurs réservent en un clic, et l'accueil compte ces clics. Il se règle dans l'éditeur${NBSP}: Paramètres, puis «${NBSP}Rendez-vous & téléphone${NBSP}».`,
    href: "/editor",
    action: "Ouvrir l'éditeur",
  },
  connect_site: {
    section: "mon-site",
    todo: "Connectez votre site",
    done: "Votre site est connecté",
    description: `Indiquez son adresse${NBSP}: vos contenus reprennent ce que vous proposez vraiment, vos liens y mènent et vos statistiques comptent ses visites.`,
    href: "/mon-site",
    action: "Connecter mon site",
  },
  install_measure: {
    section: "mon-site",
    todo: "Installez le code de mesure sur votre site",
    done: "Les visites de votre site sont mesurées",
    description: "Un petit code à coller une seule fois : vos visites, leur provenance et les clics de rendez-vous s'affichent ensuite ici.",
    href: "/mon-site#statistiques",
    action: "Installer le code",
  },
  link_google: {
    section: "fiche-google",
    todo: "Reliez votre fiche Google",
    done: "Votre fiche Google est reliée",
    description: "Retrouvez votre établissement pour suivre son audit, ses avis et sa visibilité autour de votre cabinet.",
    href: "/fiche-google",
    action: "Relier ma fiche",
  },
  blog_settings: {
    section: "publications",
    todo: "Réglez votre blog",
    done: "Votre blog est réglé",
    description: "Le ton de vos articles, leurs thèmes, et si vous les relisez avant leur parution : trois réglages, modifiables ensuite.",
    href: `/publications#${BLOG_SETTINGS_HASH}`,
    action: "Régler mon blog",
  },
  social_settings: {
    section: "reseaux-sociaux",
    todo: "Réglez vos réseaux sociaux",
    done: "Vos réseaux sociaux sont réglés",
    description: "Le ton de vos contenus et vos jours de publication, pour que le mois préparé vous ressemble.",
    href: `/reseaux-sociaux#${SOCIAL_SETTINGS_HASH}`,
    action: "Régler mes réseaux",
  },
};

/**
 * Les étapes telles que les attend la `SetupChecklist` du design system.
 * `withoutAction` : étape dont l'action est déjà offerte juste au-dessus de la
 * liste (le bloc « les visites ne sont pas encore mesurées » porte le bouton
 * du code de mesure) — elle garde son texte, sans répéter le bouton.
 */
export function checklistSteps(tasks: readonly SetupTask[], withoutAction: SetupKey | null = null): ChecklistStep[] {
  return tasks.map((task) => {
    const copy = SETUP_COPY[task.key];
    const action = task.key === withoutAction ? {} : { href: copy.href, actionLabel: copy.action };
    return {
      id: task.key,
      label: task.done ? copy.done : copy.todo,
      description: copy.description,
      done: task.done,
      ...action,
    };
  });
}
