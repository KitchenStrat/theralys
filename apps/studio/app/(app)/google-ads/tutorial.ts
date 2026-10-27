/**
 * Tuto « Paramétrage » de Google Ads : contenu statique en français, une
 * étape par entrée de l'accordéon. Les étapes qui collent des données du plan
 * (`copy`) affichent les boutons Copier correspondants (mots-clés par groupe,
 * négatifs, titres et descriptions, extensions).
 */

export type TutorialCopy = "keywords" | "negatives" | "ads" | "extensions" | "tracking";

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

/** Page de création de compte et d'aide : liens fixes, jamais une URL venue des données. */
export const GOOGLE_ADS_URL = "https://ads.google.com/";
export const TAG_ASSISTANT_URL = "https://tagassistant.google.com/";

export const ADS_TUTORIAL: TutorialStep[] = [
  {
    id: "compte",
    title: "Créer le compte Google Ads en mode expert",
    summary: "Sans campagne intelligente : Google propose par défaut un assistant simplifié qui dépense sans contrôle.",
    items: [
      "Ouvrez ads.google.com avec le compte Google qui gère votre fiche d'établissement.",
      "Sur l'écran « Quel est votre objectif principal ? », cliquez sur « Passer en mode expert » (petit lien en bas de page).",
      "Choisissez « Créer un compte sans campagne » : vous paramétrerez la campagne vous-même à l'étape 3.",
      "Renseignez le pays (France), le fuseau horaire (Paris) et la devise (euro) : ces réglages ne se changent plus ensuite.",
      "Ajoutez un moyen de paiement (paiements automatiques) : rien n'est facturé tant qu'aucune campagne ne diffuse.",
    ],
    note: "Si Google vous a déjà fait créer une campagne intelligente, mettez-la en pause : elle ne permet ni de choisir les mots-clés ni d'exclure les requêtes hors sujet.",
  },
  {
    id: "fiche",
    title: "Associer votre fiche d'établissement",
    summary: "L'adresse, les horaires et les avis de votre fiche s'affichent sous vos annonces (extension de lieu).",
    items: [
      "Menu Outils et paramètres → Comptes associés → Fiche d'établissement.",
      "Sélectionnez votre fiche (elle doit être revendiquée avec le même compte Google) et validez.",
      "Dans Annonces et extensions → Extensions → Lieu, vérifiez que la fiche apparaît.",
    ],
  },
  {
    id: "campagne",
    title: "Créer la campagne Réseau de Recherche",
    summary: "Une seule campagne, sur le Réseau de Recherche uniquement, limitée à votre zone et à vos horaires.",
    items: [
      "Campagnes → + Nouvelle campagne → objectif « Prospects » (ou « Créer une campagne sans objectif ») → type « Réseau de Recherche ».",
      "Décochez « Inclure le Réseau Display de Google » et « Inclure les partenaires du Réseau de Recherche Google » : vos annonces ne doivent apparaître que sur la page de résultats Google.",
      "Zone géographique : saisissez votre ville puis « Rayon » (15 km autour du cabinet). Dans « Options de zone », choisissez « Présence : personnes situées dans vos zones ciblées », pas « Présence ou intérêt ».",
      "Langue : français. Audiences : aucune pour l'instant.",
      "Calendrier de diffusion (Paramètres de la campagne → Calendrier) : reprenez les jours et heures conseillés dans le plan d'action.",
      "Nommez la campagne comme dans le plan d'action pour vous y retrouver.",
    ],
  },
  {
    id: "mots-cles",
    title: "Créer les groupes d'annonces et coller les mots-clés",
    summary: "Un groupe par intention de recherche, avec les mots-clés du plan au format Google Ads (guillemets = expression, crochets = exact).",
    items: [
      "Dans la campagne, créez un groupe d'annonces par groupe du plan d'action, avec le même nom.",
      "Dans la zone « Mots-clés » du groupe, collez la liste copiée ci-dessous : une ligne par mot-clé, les guillemets et crochets sont conservés tels quels.",
      "Ne retirez pas les guillemets : en correspondance large (sans guillemets), Google diffuse sur des recherches très éloignées.",
    ],
    copy: "keywords",
  },
  {
    id: "negatifs",
    title: "Ajouter les mots-clés négatifs",
    summary: "Les recherches d'emploi, de formation ou d'information ne doivent jamais déclencher vos annonces.",
    items: [
      "Mots-clés → Mots-clés à exclure → + → « Ajouter des mots clés à exclure » au niveau de la campagne.",
      "Collez la liste ci-dessous (une ligne par mot), puis enregistrez.",
      "Chaque semaine, ouvrez « Termes de recherche » et ajoutez en négatif les requêtes hors sujet qui ont déclenché un clic.",
    ],
    copy: "negatives",
  },
  {
    id: "annonces",
    title: "Rédiger les annonces responsives (RSA)",
    summary: "Une annonce par groupe : jusqu'à 15 titres de 30 caractères et 4 descriptions de 90 caractères, Google compose les combinaisons.",
    items: [
      "Dans chaque groupe, Annonces → + → « Annonce responsive sur le Réseau de Recherche ».",
      "URL finale : la page d'atterrissage indiquée pour le groupe (votre accueil ou une page de spécialité).",
      "Collez les titres un par un (un titre par champ), puis les descriptions. Les chemins d'affichage sont facultatifs.",
      "Visez la mention « Efficacité de l'annonce : Bonne » ou mieux : ajoutez des titres si Google en demande.",
    ],
    copy: "ads",
  },
  {
    id: "extensions",
    title: "Activer les extensions (composants)",
    summary: "Appel, lieu, liens annexes et accroches : elles agrandissent l'annonce et font monter le taux de clic sans coût supplémentaire.",
    items: [
      "Annonces et extensions → Extensions → + Appel : votre numéro de téléphone, avec « Rapport d'appels » activé.",
      "+ Lieu : la fiche associée à l'étape 2.",
      "+ Liens annexes : un lien par page de spécialité (titre court, URL de la page).",
      "+ Accroches : 4 arguments courts (rendez-vous en ligne, cabinet en ville, séances individuelles…).",
    ],
    copy: "extensions",
  },
  {
    id: "budget",
    title: "Fixer le budget et les enchères",
    summary: "Budget quotidien du plan d'action ; Google peut dépenser jusqu'au double un jour donné, mais respecte la moyenne mensuelle.",
    items: [
      "Paramètres de la campagne → Budget : saisissez le budget quotidien conseillé.",
      "Enchères : « Maximiser les clics » avec une limite de CPC maximale (la valeur conseillée dans le plan) pendant les 4 premières semaines.",
      "Dès 15 conversions mesurées, passez à « Maximiser les conversions » : Google optimise alors sur les prises de contact.",
    ],
  },
  {
    id: "conversions",
    title: "Mesurer les conversions (RDV, appel, e-mail)",
    summary: "Trois actions de conversion « Site web » dans Google Ads ; votre site Harmony envoie les clics après consentement.",
    items: [
      "Objectifs → Conversions → Résumé → + Nouvelle action de conversion → « Site web » → saisissez l'adresse de votre site → « Ajouter une action de conversion manuellement ».",
      "Créez 3 actions : « Prise de rendez-vous » (catégorie Prise de rendez-vous), « Appel » (Contact), « E-mail » (Contact). Valeur : aucune ; comptabilisation : une par clic.",
      "Pour chaque action, ouvrez « Configuration de la balise » → « Installer la balise vous-même » : l'extrait d'événement contient send_to: 'AW-1234567890/AbCdEfGh…'. AW-1234567890 est votre identifiant, AbCdEfGh… le libellé de l'action.",
      "Collez l'identifiant AW-… et les 3 libellés dans le formulaire « Suivi des conversions » ci-dessous, puis enregistrez : le site charge la balise et envoie les conversions.",
      "Vérifiez avec Tag Assistant (tagassistant.google.com) : ouvrez votre site, acceptez le bandeau cookies, cliquez sur « Prendre rendez-vous » — l'événement « conversion » doit apparaître.",
    ],
    copy: "tracking",
    note: "Conformité RGPD : la balise Google Ads n'est chargée qu'après le consentement donné dans le bandeau cookies de votre site. Sans consentement, rien n'est envoyé à Google.",
  },
  {
    id: "appels",
    title: "Suivre les appels",
    summary: "Les appels passés depuis l'annonce (extension d'appel) sont comptés par Google ; ceux passés depuis le site le sont par votre balise.",
    items: [
      "Extension d'appel → « Rapport d'appels » activé : Google remplace votre numéro par un numéro de transfert et compte les appels de plus de 30 secondes.",
      "Objectifs → Conversions : créez une action « Appels depuis les annonces » (catégorie Appel téléphonique) si Google ne l'a pas créée automatiquement.",
      "Les clics sur votre numéro depuis le site remontent déjà grâce au libellé « Appel » de l'étape 9.",
    ],
  },
  {
    id: "checklist",
    title: "Check-list des deux premières semaines",
    summary: "La phase d'apprentissage : surveiller sans tout changer.",
    items: [
      "J+1 : les annonces sont « Approuvées » (sinon lisez la raison dans la colonne État et corrigez le texte).",
      "J+2 : une conversion de test apparaît dans Objectifs → Conversions (sinon revérifiez avec Tag Assistant).",
      "J+3 et J+7 : rapport « Termes de recherche » → ajoutez les requêtes hors sujet en négatif.",
      "J+7 : coût par clic réel comparé à l'estimation ; si le budget est épuisé dès le matin, baissez le CPC maximal plutôt que d'augmenter le budget.",
      "J+14 : premières prises de contact mesurées ; ne changez ni budget ni enchères avant J+30.",
      "Chaque semaine : revenez sur cette page, le bloc « Résultats » affiche les visites, clics RDV et appels venus des annonces.",
    ],
  },
];
