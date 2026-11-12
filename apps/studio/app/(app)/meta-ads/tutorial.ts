/**
 * Tuto « Paramétrage » de Meta Ads : contenu statique en français, une
 * étape par entrée de l'accordéon. Les étapes qui collent des données de
 * l'analyse (`copy`) affichent les boutons Copier correspondants (textes des
 * créas, textes des vidéos, nom de campagne) ; `pixel` renvoie au formulaire
 * sous le tuto.
 *
 * Intitulés de l'interface Meta 2025-2026 : Meta Business Suite, Gestionnaire
 * de publicités, « Jeu de données » (ex-Pixel) dans le Gestionnaire
 * d'événements, campagne « Ventes » ou « Prospects », « emplacement de
 * conversion : site web », audience Advantage+, placements Advantage+.
 *
 * `META_TUTORIAL` est écrit pour le site Harmony, qui charge le Pixel, envoie
 * les événements et lit le suffixe `?src=meta` lui-même. Quand les annonces
 * mènent au site du client, les étapes qui le supposent ont une variante
 * (`metaTutorial`) : rien ne peut y être installé depuis le studio, le Pixel
 * et le bandeau cookies se règlent sur ce site, les adresses se collent
 * telles quelles et seul le compte Meta montre ce qui est reçu.
 */

export type TutorialCopy = "pixel" | "campaign" | "creatives" | "videos";

export type TutorialStep = {
  id: string;
  title: string;
  /** Une phrase d'accroche sous le titre */
  summary: string;
  /** Sous-étapes, dans l'ordre */
  items: string[];
  /** Bloc de données à coller, affiché sous les sous-étapes */
  copy?: TutorialCopy;
  /** Remarque finale (encadré) */
  note?: string;
};

/** Pages de Meta : liens fixes, jamais une URL venue des données. */
export const META_BUSINESS_URL = "https://business.facebook.com/";
export const META_ADS_MANAGER_URL = "https://adsmanager.facebook.com/";
export const META_EVENTS_MANAGER_URL = "https://business.facebook.com/events_manager2/";
export const META_PIXEL_HELPER_URL = "https://chromewebstore.google.com/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc";

export const META_TUTORIAL: TutorialStep[] = [
  {
    id: "compte",
    title: "Meta Business Suite et compte publicitaire",
    summary: "Une page Facebook professionnelle, un portefeuille d'entreprise et un compte publicitaire : la base, une fois pour toutes.",
    items: [
      "Ouvrez business.facebook.com avec le profil Facebook qui administre la page de votre cabinet (créez la page d'abord si elle n'existe pas : Pages → Créer, catégorie « Santé et bien-être »).",
      "Créez un portefeuille d'entreprise (ex-Business Manager) au nom du cabinet, puis ajoutez-y votre page (Paramètres → Pages → Ajouter).",
      "Paramètres → Comptes publicitaires → Ajouter → Créer un compte publicitaire : nom du cabinet, fuseau horaire Paris, devise euro — ces réglages ne se changent plus ensuite.",
      "Ajoutez un moyen de paiement (Paramètres → Paiements) : rien n'est facturé tant qu'aucune campagne ne diffuse.",
      "Si vous avez un compte Instagram professionnel, reliez-le à la page (Paramètres → Comptes Instagram) : vos annonces y seront diffusées aussi.",
    ],
    note: "Activez la double authentification sur votre profil Facebook : Meta l'exige pour les comptes publicitaires et un compte piraté peut dépenser votre budget.",
  },
  {
    id: "pixel",
    title: "Créer le Pixel (Jeu de données) et le coller dans le studio",
    summary: "Le Pixel est la source de vérité : sans lui, Meta ne sait pas ce qu'une annonce rapporte et ne peut pas optimiser.",
    items: [
      "Gestionnaire d'événements (Toutes les ressources → Gestionnaire d'événements) → Connecter des données → Web → nommez le jeu de données « Site [nom du cabinet] » → Créer.",
      "Choisissez « Pixel Meta uniquement » (pas d'API Conversions pour l'instant), puis « Installer le code manuellement » : l'identifiant du Pixel est le nombre de 15 à 16 chiffres en général (10 à 20 acceptés) affiché en haut (aussi visible dans fbq('init', '…')).",
      "Copiez cet identifiant et collez-le dans le formulaire « Pixel Meta » sous ce tuto, puis enregistrez : votre site Harmony charge le Pixel et envoie les événements, vous n'avez aucun code à poser.",
      "Ne cochez pas « Correspondance avancée automatique » et n'ajoutez pas d'événement via l'outil de configuration : les événements sont déjà envoyés par le site.",
    ],
    copy: "pixel",
    note: "Conformité RGPD : si le bandeau cookies de votre site est actif, le Pixel n'est chargé qu'après le consentement du visiteur et rien n'est envoyé à Meta sans lui. Si vous avez désactivé le bandeau dans l'éditeur (Paramètres → Tracking), le Pixel part dès l'arrivée du visiteur : réactivez-le pour rester conforme.",
  },
  {
    id: "evenements",
    title: "Vérifier les événements Schedule et Contact",
    summary: "Votre site envoie « Schedule » au clic « Prendre rendez-vous » et « Contact » au clic sur votre téléphone ou votre e-mail.",
    items: [
      "Installez l'extension Meta Pixel Helper dans Chrome (lien ci-dessous), ouvrez votre site, acceptez le bandeau cookies : l'icône de l'extension doit afficher « PageView ».",
      "Cliquez sur « Prendre rendez-vous » : l'événement « Schedule » apparaît ; cliquez sur votre numéro de téléphone (ou votre e-mail) : « Contact » apparaît.",
      "Dans le Gestionnaire d'événements → votre jeu de données → Tester les événements, saisissez l'adresse de votre site et refaites les clics : les événements remontent en direct.",
      "Après 24 h, l'onglet Vue d'ensemble du jeu de données liste PageView, Schedule et Contact : la campagne pourra optimiser dessus.",
    ],
    note: "Rien n'apparaît ? Vérifiez que l'identifiant est bien enregistré (formulaire ci-dessous), que vous avez accepté le bandeau cookies et que vous n'êtes pas dans l'aperçu de l'éditeur, où le Pixel n'est jamais chargé.",
  },
  {
    id: "campagne",
    title: "Créer la campagne « Ventes » ou « Prospects »",
    summary: "Un seul objectif qui compte : les conversions sur votre site, mesurées par le Pixel.",
    items: [
      "Gestionnaire de publicités → + Créer → objectif « Ventes » (ou « Prospects », les deux permettent d'optimiser sur un événement du site) → « Configuration manuelle de la campagne de ventes » si Meta vous propose une configuration simplifiée.",
      "Nommez la campagne comme dans le plan (bouton Copier ci-dessous). Catégorie de publicité spéciale : aucune. Budget Advantage+ au niveau de la campagne : le budget quotidien du plan.",
      "Au niveau de l'ensemble : emplacement de conversion « Site web », jeu de données = votre Pixel, événement de conversion « Schedule » (ou « Contact » si vous n'avez pas de prise de rendez-vous en ligne), comme indiqué dans le plan.",
      "Tant que le Pixel n'est pas installé, Meta ne propose que « Trafic » : installez-le d'abord (étape 2) plutôt que de lancer une campagne qui ne mesurera rien.",
    ],
    copy: "campaign",
  },
  {
    id: "audience",
    title: "Audience Advantage+, ville et rayon",
    summary: "Laissez Meta trouver les bons profils dans votre zone : une audience large, sans centres d'intérêt, convertit mieux qu'un ciblage étroit.",
    items: [
      "Zone : supprimez « France », tapez le nom de votre ville, puis réglez le rayon à 15 km (curseur ou « Modifier » à côté du repère). Option « Personnes vivant ou se trouvant récemment dans cette zone ».",
      "Âge : 25 à 65 ans (ou la tranche du plan). Genre : tous. Langue : français.",
      "Audience Advantage+ : laissez activée et ne saisissez aucun centre d'intérêt ; Meta élargit tout seul à partir de ceux qui réagissent.",
      "Pour le second ensemble (reciblage) : Audiences → Créer une audience personnalisée → Site web → votre Pixel → « Tous les visiteurs du site web », 30 derniers jours ; excluez les personnes ayant déclenché « Schedule ».",
    ],
  },
  {
    id: "placements",
    title: "Placements Advantage+",
    summary: "Fil Facebook, fil Instagram, stories et Reels : Meta répartit le budget là où les résultats arrivent.",
    items: [
      "Placements : laissez « Placements Advantage+ » (recommandé). Vos trois formats (carré, portrait, story) couvrent tous les emplacements.",
      "Si vous tenez à limiter : décochez seulement Audience Network et Messenger (hors sujet pour un cabinet) ; gardez Facebook et Instagram au complet.",
      "Appareils : tous ; les annonces sont vues à plus de 90 % sur mobile, d'où l'importance du format vertical.",
    ],
  },
  {
    id: "annonces",
    title: "Importer les visuels et coller les textes",
    summary: "Une annonce par créa : les trois formats importés ensemble, puis le texte principal, le titre, la description, le bouton et l'URL.",
    items: [
      "Au niveau de la publicité : Identité = votre page Facebook (et votre compte Instagram). Format « Image ou vidéo unique ».",
      "Ajouter un contenu multimédia → Importer : sélectionnez les trois fichiers du kit (carré, portrait, story). Meta demande ensuite « Recadrer par placement » : associez le carré au fil Facebook, le portrait au fil Instagram, la story aux stories et Reels.",
      "Collez le texte principal, le titre et la description (boutons Copier ci-dessous, ou le fichier textes.txt du kit). Bouton d'appel à l'action : celui indiqué pour la créa (Réserver, En savoir plus…).",
      "URL du site web : la page d'atterrissage de la créa (accueil ou page de spécialité) avec le suffixe ?src=meta — le bouton Copier l'URL l'ajoute déjà. C'est ce suffixe qui permet à votre site de reconnaître les visites venues de vos annonces et de les mesurer dans le bloc Résultats. Suivi : laissez le Pixel sélectionné.",
      "Créez une publicité par créa dans le même ensemble (Dupliquer, puis remplacer visuels et textes) : 3 à 5 publicités en test.",
    ],
    copy: "creatives",
  },
  {
    id: "videos",
    title: "Ajouter les vidéos",
    summary: "Dès qu'une vidéo du plan est tournée et montée, ajoutez-la comme une publicité de plus : c'est souvent elle qui gagne.",
    items: [
      "Dans l'ensemble « Large », Dupliquer une publicité existante → remplacer le visuel par la vidéo (format vertical 1080 × 1920, moins de 60 Mo, sous-titres incrustés).",
      "Miniature : choisissez une image nette de vous (pas un plan flou) ; Meta la propose automatiquement.",
      "Collez le texte à coller de la vidéo (bouton Copier ci-dessous), gardez le même bouton et la même page d'atterrissage que les créas (avec le suffixe ?src=meta).",
      "Laissez les trois vidéos en concurrence 14 jours avant de couper la moins performante.",
    ],
    copy: "videos",
  },
  {
    id: "conformite",
    title: "Règles de conformité et motifs de refus",
    summary: "Meta relit chaque annonce avec ses règles sur la santé : trois pièges évitent 90 % des refus.",
    items: [
      "Attributs personnels : jamais de formulation qui suppose l'état du lecteur (« vous souffrez de… », « votre stress », « vous êtes anxieux »). Parlez de la pratique et du cabinet, pas de la personne.",
      "Avant / après : aucune comparaison d'état ni d'image avant / après, aucune promesse de résultat, de guérison ou de perte de poids.",
      "Vocabulaire : pas de termes médicaux (diagnostic, traitement, soigner), pas de superlatif (le meilleur, unique), pas de tarif barré.",
      "En cas de refus : la raison est indiquée dans la colonne Diffusion → « Rejetée » ; corrigez le texte (vos annonces Harmony respectent ces règles) et demandez un nouvel examen plutôt que de recréer la publicité.",
      "Avis : vous pouvez citer le nombre d'avis et la note moyenne de votre fiche Google ; ne reproduisez pas un avis nominatif sans l'accord écrit de son auteur.",
    ],
    note: "Les textes générés dans l'onglet Annonces sont déjà filtrés sur ces règles ; si vous les modifiez, relisez-les avec ces trois points.",
  },
  {
    id: "resultats",
    title: "Test de 14 jours et lecture des résultats",
    summary: "La phase d'apprentissage : surveiller sans tout changer, puis décider sur le coût par prise de contact.",
    items: [
      "J+1 : les publicités sont « Actives » (sinon lisez le motif de refus). Le Pixel reçoit des PageView depuis les annonces.",
      "J+3 : fréquence et coût pour 1 000 impressions (CPM) dans le Gestionnaire de publicités ; un CPM entre 6 et 12 € est normal pour un cabinet local.",
      "J+7 : ne modifiez ni budget ni audience (chaque changement relance l'apprentissage). Répondez aux commentaires sous les annonces.",
      "J+14 : colonnes « Résultats » et « Coût par résultat » (vos événements Schedule / Contact) : gardez les deux créas au coût le plus bas, coupez les autres, ajoutez une vidéo.",
      "Chaque semaine : revenez sur cette page, le bloc « Résultats » affiche les visites, clics RDV et appels venus des annonces Meta, mesurés par votre site grâce au suffixe ?src=meta des annonces.",
    ],
  },
];

/**
 * Étapes réécrites pour le site du client (mêmes identifiants, même place
 * dans le tuto : « l'étape 2 » reste le Pixel, « l'étape 3 » sa vérification).
 * Elles disent ce que le praticien installe sur son propre site et ce qu'il
 * contrôle dans son compte Meta, sans rien promettre que le studio ne peut
 * vérifier : pas de formulaire, pas de suffixe d'adresse, pas de bloc
 * « Résultats », pas d'éditeur.
 */
const EXTERNAL_SITE_STEPS: Partial<Record<string, TutorialStep>> = {
  pixel: {
    id: "pixel",
    title: "Créer le Pixel (Jeu de données) et l'installer sur votre site",
    summary: "Le Pixel dit à Meta ce qu'une annonce rapporte. Sur votre propre site, c'est vous (ou la personne qui s'en occupe) qui l'installez : Harmony n'héberge pas ce site et ne peut pas le faire à votre place.",
    items: [
      "Gestionnaire d'événements (Toutes les ressources → Gestionnaire d'événements) → Connecter des données → Web → nommez le jeu de données « Site [nom du cabinet] » → Créer.",
      "Choisissez « Pixel Meta uniquement » (pas d'API Conversions pour l'instant). Notez l'identifiant du Pixel, le nombre de 15 à 16 chiffres en général affiché en haut : c'est lui que demandent les outils de création de site qui ont un réglage prévu pour le Pixel. « Installer le code manuellement » affiche aussi le code complet, pour les autres.",
      "Installez le Pixel sur toutes les pages de votre site, une seule fois : avec le réglage Meta ou Facebook de l'outil qui a servi à créer votre site, ou en transmettant le code à la personne qui s'en occupe. Le bloc « Pixel Meta sur votre site », sous ce tuto, dit où regarder pour votre outil.",
      "Bandeau cookies : le Pixel ne doit se charger qu'après l'accord du visiteur. Vérifiez que votre site affiche un bandeau cookies et que le Pixel attend ce choix.",
      "Relancez enfin la lecture de votre site depuis « Mon site » : le relevé affiché sous ce tuto se met à jour, et la prochaine génération de vos annonces en tiendra compte.",
    ],
    copy: "pixel",
    note: "Harmony ne peut ni installer le Pixel sur votre site, ni voir ce qu'il envoie à Meta. Les conditions de Meta vous demandent d'obtenir l'accord du visiteur avant d'utiliser le Pixel, et de ne lui transmettre aucune information de santé.",
  },
  evenements: {
    id: "evenements",
    title: "Vérifier ce que le Pixel reçoit de votre site",
    summary: "Sur votre propre site, le Pixel compte les pages vues ; un clic sur votre lien de rendez-vous ou votre numéro n'est compté que si un événement a été ajouté pour lui.",
    items: [
      "Installez l'extension Meta Pixel Helper dans Chrome (lien ci-dessous), ouvrez votre site, acceptez le bandeau cookies : l'icône de l'extension doit afficher « PageView ».",
      "Cliquez sur votre lien de rendez-vous, puis sur votre numéro de téléphone : si un événement apparaît (« Schedule », « Contact » ou un autre nom), notez-le, vous le choisirez à l'étape 4.",
      "Aucun événement au clic ? Il faut en ajouter un sur votre site : demandez-le à la personne qui s'en occupe, ou utilisez l'outil de configuration des événements de Meta s'il vous est proposé dans les paramètres de votre jeu de données. Donnez-lui un nom neutre (« Schedule », « Contact »), jamais un motif de consultation.",
      "Dans le Gestionnaire d'événements → votre jeu de données → Tester les événements, saisissez l'adresse de votre site et refaites les clics : vous voyez en direct ce que Meta reçoit.",
    ],
    note: "Harmony ne voit pas ce que votre site envoie à Meta : seul le Gestionnaire d'événements le montre. Rien n'apparaît ? Vérifiez que le Pixel est bien installé sur votre site et que vous avez accepté le bandeau cookies.",
  },
  campagne: {
    id: "campagne",
    title: "Créer la campagne « Ventes » ou « Prospects »",
    summary: "L'objectif dépend de ce que votre site envoie à Meta : les conversions si le Pixel compte vos prises de rendez-vous, le trafic sinon.",
    items: [
      "Gestionnaire de publicités → + Créer → objectif « Ventes » (ou « Prospects », les deux permettent d'optimiser sur un événement du site) → « Configuration manuelle de la campagne de ventes » si Meta vous propose une configuration simplifiée.",
      "Nommez la campagne comme dans le plan (bouton Copier ci-dessous). Catégorie de publicité spéciale : aucune. Budget Advantage+ au niveau de la campagne : le budget quotidien du plan.",
      "Au niveau de l'ensemble : emplacement de conversion « Site web », jeu de données = votre Pixel, événement de conversion = celui que votre site envoie au clic sur votre lien de rendez-vous (vérifié à l'étape 3).",
      "Sans Pixel, ou si aucun événement n'est envoyé au clic, choisissez l'objectif « Trafic », optimisé sur les clics sur un lien (ou sur les vues de page de destination si le Pixel est installé) : vos annonces sont diffusées, mais Meta ne sait pas lesquelles amènent des prises de rendez-vous.",
    ],
    copy: "campaign",
  },
  audience: {
    id: "audience",
    title: "Audience Advantage+, ville et rayon",
    summary: "Laissez Meta trouver les bons profils dans votre zone : une audience large, sans centres d'intérêt, convertit mieux qu'un ciblage étroit.",
    items: [
      "Zone : supprimez « France », tapez le nom de votre ville, puis réglez le rayon à 15 km (curseur ou « Modifier » à côté du repère). Option « Personnes vivant ou se trouvant récemment dans cette zone ».",
      "Âge : 25 à 65 ans (ou la tranche du plan). Genre : tous. Langue : français.",
      "Audience Advantage+ : laissez activée et ne saisissez aucun centre d'intérêt ; Meta élargit tout seul à partir de ceux qui réagissent.",
      "Pour le second ensemble (reciblage), une fois le Pixel installé sur votre site : Audiences → Créer une audience personnalisée → Site web → votre Pixel → « Tous les visiteurs du site web », 30 derniers jours ; si votre site envoie un événement de prise de rendez-vous, excluez les personnes qui l'ont déclenché.",
    ],
  },
  annonces: {
    id: "annonces",
    title: "Importer les visuels et coller les textes",
    summary: "Une annonce par créa : les trois formats importés ensemble, puis le texte principal, le titre, la description, le bouton et l'URL.",
    items: [
      "Au niveau de la publicité : Identité = votre page Facebook (et votre compte Instagram). Format « Image ou vidéo unique ».",
      "Ajouter un contenu multimédia → Importer : sélectionnez les trois fichiers du kit (carré, portrait, story). Meta demande ensuite « Recadrer par placement » : associez le carré au fil Facebook, le portrait au fil Instagram, la story aux stories et Reels.",
      "Collez le texte principal, le titre et la description (boutons Copier ci-dessous, ou le fichier textes.txt du kit). Bouton d'appel à l'action : celui indiqué pour la créa (Réserver, En savoir plus…).",
      "URL du site web : l'adresse de la page d'atterrissage de la créa sur votre site (bouton URL ci-dessous), telle quelle, sans rien y ajouter. Suivi : laissez le Pixel sélectionné s'il est installé sur votre site.",
      "Créez une publicité par créa dans le même ensemble (Dupliquer, puis remplacer visuels et textes) : 3 à 5 publicités en test.",
    ],
    copy: "creatives",
  },
  videos: {
    id: "videos",
    title: "Ajouter les vidéos",
    summary: "Dès qu'une vidéo du plan est tournée et montée, ajoutez-la comme une publicité de plus : c'est souvent elle qui gagne.",
    items: [
      "Dans l'ensemble « Large », Dupliquer une publicité existante → remplacer le visuel par la vidéo (format vertical 1080 × 1920, moins de 60 Mo, sous-titres incrustés).",
      "Miniature : choisissez une image nette de vous (pas un plan flou) ; Meta la propose automatiquement.",
      "Collez le texte à coller de la vidéo (bouton Copier ci-dessous), gardez le même bouton et la même page d'atterrissage que les créas.",
      "Laissez les trois vidéos en concurrence 14 jours avant de couper la moins performante.",
    ],
    copy: "videos",
  },
  resultats: {
    id: "resultats",
    title: "Test de 14 jours et lecture des résultats",
    summary: "La phase d'apprentissage : surveiller sans tout changer, puis décider sur le coût par résultat.",
    items: [
      "J+1 : les publicités sont « Actives » (sinon lisez le motif de refus). Si le Pixel est installé sur votre site, il reçoit des PageView depuis les annonces.",
      "J+3 : fréquence et coût pour 1 000 impressions (CPM) dans le Gestionnaire de publicités ; un CPM entre 6 et 12 € est normal pour un cabinet local.",
      "J+7 : ne modifiez ni budget ni audience (chaque changement relance l'apprentissage). Répondez aux commentaires sous les annonces.",
      "J+14 : colonnes « Résultats » et « Coût par résultat » : gardez les deux créas au coût le plus bas, coupez les autres, ajoutez une vidéo.",
      "Chaque semaine : suivez vos annonces dans le Gestionnaire de publicités de Meta — c'est lui qui montre ce qu'elles rapportent. Les visites de l'ensemble de votre site se lisent sur l'accueil du studio, une fois le code de mesure installé depuis « Mon site ».",
    ],
  },
};

/**
 * Tuto à afficher selon le site où mènent les annonces. Site Harmony : les
 * étapes d'origine, inchangées. Site du client (`externalSite`) : les mêmes
 * étapes dans le même ordre, celles qui supposent le site Harmony remplacées
 * par leur variante.
 */
export function metaTutorial(externalSite: boolean): TutorialStep[] {
  if (!externalSite) return META_TUTORIAL;
  return META_TUTORIAL.map((step) => EXTERNAL_SITE_STEPS[step.id] ?? step);
}
