/**
 * Les pages « Création de site internet pour … » : une par métier. Chaque
 * fiche porte ce qui est propre au métier (comment on le cherche, les pages à
 * prévoir, le cadre à respecter, les questions qu'on nous pose) ; le reste de
 * la page — ce que Harmony met en place, le budget, le plan sur 90 jours —
 * vient de la définition du produit et ne se répète pas ici.
 *
 * Règles d'écriture : rien d'inventé (ni chiffre de clientèle ni résultat
 * promis), et la prudence sur le cadre de chaque métier — en cas de doute, la
 * fiche renvoie le praticien vers son ordre, sa fédération ou son école.
 */

export type Profession = {
  /** Fin de l'adresse : `/creation-site-internet-<slug>` */
  slug: string;
  /** Le métier, au singulier et en minuscules */
  name: string;
  plural: string;
  /** Avec « de » : « de sophrologue », « d'ostéopathe » */
  of: string;
  /** Avec l'article indéfini : « un sophrologue » */
  a: string;
  /** Dans la colonne « Par métier » du pied de page */
  featured?: boolean;
  /** Description pour les moteurs de recherche (150 caractères au plus) */
  description: string;
  /** Phrase d'introduction, sous le titre */
  hook: string;
  search: { intro: string; points: string[] };
  pages: { intro: string; items: string[] };
  local: { intro: string; items: string[] };
  frame: { intro: string; items: string[] };
  /** Sujets d'articles qui répondent à de vraies recherches */
  topics: string[];
  ads: string;
  faq: { q: string; a: string }[];
};

export const PROFESSIONS: readonly Profession[] = [
  {
    slug: "osteopathe",
    name: "ostéopathe",
    plural: "ostéopathes",
    of: "d'ostéopathe",
    a: "un ostéopathe",
    featured: true,
    description: "Un site d'ostéopathe créé et référencé pour vous : pages par motif, fiche Google, prise de rendez-vous. Démo personnalisée gratuite.",
    hook: "On vous cherche d'abord par proximité, souvent dans l'urgence. Votre site doit **apparaître près de chez vous**, rassurer en dix secondes et **mener au rendez-vous**.",
    search: {
      intro: "La plupart des recherches tiennent en deux mots : le métier et un lieu. Mais une bonne part vient aussi d'un problème précis, tapé tel quel.",
      points: [
        "**« Ostéopathe + ville ou quartier »** : la recherche la plus fréquente. Google y répond d'abord par la carte, avec trois cabinets.",
        "**Par motif** : « ostéopathe nourrisson », « ostéopathe sportif », « ostéo femme enceinte », « mal de dos ostéopathe ».",
        "**Dans l'urgence** : « ostéopathe ouvert samedi », « ostéopathe rendez-vous aujourd'hui ». Vos horaires et votre lien de réservation comptent autant que vos textes.",
      ],
    },
    pages: {
      intro: "Une page d'accueil qui dit tout ne se place sur rien. Chaque public mérite sa page, écrite avec ses mots.",
      items: [
        "Une page par public : **nourrissons**, **femmes enceintes**, **sportifs**, **seniors**.",
        "Une page par motif fréquent : dos et lombaires, cervicales, maux de tête, troubles digestifs.",
        "Une page **« Déroulement d'une séance »** : durée, tenue, ce qui se passe, quand revenir.",
        "Une page **tarifs et remboursement** : prise en charge par les mutuelles, facture, moyens de paiement.",
        "Une page par cabinet si vous exercez à deux adresses, avec accès et stationnement.",
      ],
    },
    local: {
      intro: "Votre fiche Google fait le gros du travail local. Elle se remplit comme un dossier : entièrement.",
      items: [
        "Catégorie principale **« Ostéopathe »**, horaires exacts, lien de prise de rendez-vous.",
        "Des photos réelles du cabinet et de l'entrée : on doit vous reconnaître en arrivant.",
        "Vos services détaillés, un par public et par motif, avec les mêmes mots que vos pages.",
      ],
    },
    frame: {
      intro: "Le titre d'ostéopathe est **protégé** : votre site peut s'y appuyer, à condition de rester factuel.",
      items: [
        "Affichez votre formation, votre numéro d'enregistrement et votre assurance : ce sont des preuves de sérieux.",
        "Décrivez ce que vous faites, pas un résultat : pas de promesse de guérison, pas de comparaison avec des confrères.",
        "Précisez ce qui relève du médecin : un site qui oriente inspire plus confiance qu'un site qui promet.",
      ],
    },
    topics: [
      "Quand consulter un ostéopathe pour un nourrisson ?",
      "Mal de dos au bureau : ce que l'ostéopathie peut apporter",
      "Combien de séances d'ostéopathie faut-il prévoir ?",
      "Ostéopathie et grossesse : à quel moment consulter",
      "Ostéopathe ou kinésithérapeute : qui voir, et quand",
    ],
    ads: "Sur une recherche aussi locale et aussi fréquente, **Google Ads** peut amener des rendez-vous dès les premières semaines, le temps que le référencement naturel s'installe. Il se juge au coût d'un nouveau patient, pas au nombre de clics.",
    faq: [
      { q: "Faut-il une page par motif de consultation ?", a: "Oui, pour les motifs que vous recevez souvent. Une page « ostéopathe nourrisson » répond exactement à la personne qui tape ces mots ; une page d'accueil généraliste, non." },
      { q: "Mon agenda en ligne suffit-il à me rendre visible ?", a: "Il vous rend réservable, pas visible : la plateforme met aussi en avant vos confrères. Votre site et votre fiche Google, eux, ne parlent que de vous. Les deux se complètent." },
      { q: "Puis-je garder mon site actuel ?", a: "Oui. Avec la formule Scale seule, vous indiquez son adresse : la fiche Google, les réseaux sociaux et la publicité s'appuient dessus, sans qu'il soit modifié." },
    ],
  },
  {
    slug: "hypnotherapeute",
    name: "hypnothérapeute",
    plural: "hypnothérapeutes",
    of: "d'hypnothérapeute",
    a: "un hypnothérapeute",
    featured: true,
    description: "Un site d'hypnothérapeute qui rassure et qui se trouve : pages par motif, déroulé d'une séance, fiche Google. Démo personnalisée gratuite.",
    hook: "L'hypnose intrigue autant qu'elle inquiète. Votre site doit **lever les doutes avant le premier appel** et se placer sur les motifs que l'on tape vraiment.",
    search: {
      intro: "On cherche rarement « hypnothérapeute » tout court. On cherche une solution à quelque chose de précis.",
      points: [
        "**Par motif** : « hypnose arrêt du tabac », « hypnose perte de poids », « hypnose stress », « hypnose phobie avion », suivis d'une ville.",
        "**Par doute** : « l'hypnose, est-ce que ça marche », « hypnose dangers », « combien de séances d'hypnose ». Répondre à ces questions, c'est déjà être choisi.",
        "**Par nom**, après une recommandation : votre nom tapé dans Google doit mener à vous, pas à un annuaire.",
      ],
    },
    pages: {
      intro: "Chaque motif est un marché à part, avec ses mots et ses craintes. Donnez-lui sa page.",
      items: [
        "Une page par accompagnement : **arrêt du tabac**, **gestion du stress**, **sommeil**, **confiance en soi**, **phobies**.",
        "Une page **« Comment se passe une séance »** : on reste conscient, on ne perd pas le contrôle, on peut arrêter à tout moment.",
        "Une page **« Qui suis-je »** : formation, école, pratique. La confiance se joue là.",
        "Une page tarifs, avec le nombre de séances habituellement prévu par accompagnement.",
        "Une page séances à distance, si vous en proposez.",
      ],
    },
    local: {
      intro: "La carte Google pèse lourd, parce qu'on veut un praticien près de chez soi et bien noté.",
      items: [
        "Catégorie **« Hypnothérapeute »** ou « Service d'hypnothérapie », zone desservie si vous n'affichez pas d'adresse.",
        "Une description qui reprend vos motifs principaux, dans les mots de vos clients.",
        "Des avis demandés régulièrement : sur un métier de confiance, ils décident souvent du choix.",
      ],
    },
    frame: {
      intro: "La pratique n'est pas réglementée : c'est une raison de plus pour être précis sur ce que vous faites.",
      items: [
        "Vous accompagnez, vous ne soignez pas : ni diagnostic, ni promesse de résultat, ni « guérison ».",
        "Dites clairement que l'hypnose ne remplace pas un suivi médical ou psychologique.",
        "Évitez les taux de réussite : un chiffre invérifiable fragilise tout le reste de la page.",
      ],
    },
    topics: [
      "Comment se déroule une séance d'hypnose ?",
      "Arrêter de fumer avec l'hypnose : à quoi s'attendre",
      "Hypnose et sommeil : dans quels cas consulter",
      "Combien de séances d'hypnose faut-il prévoir ?",
      "Peut-on rester bloqué sous hypnose ? Les idées reçues",
    ],
    ads: "La publicité fonctionne **par motif** : une annonce « arrêt du tabac » qui mène à la page « arrêt du tabac ». Les régies encadrent de près les annonces liées à la santé : restez descriptif, sans promesse.",
    faq: [
      { q: "Puis-je écrire que l'hypnose traite l'anxiété ?", a: "Mieux vaut écrire que vous accompagnez les personnes qui vivent de l'anxiété, en complément d'un suivi médical ou psychologique si besoin. La nuance protège vos clients, et votre site." },
      { q: "Faut-il afficher ses tarifs ?", a: "Oui. Le prix et le nombre de séances sont les deux questions que tout le monde se pose avant d'appeler. Y répondre sur le site évite des appels qui n'aboutissent pas." },
      { q: "Les séances en visio se référencent-elles ?", a: "Oui, sur des recherches sans ville (« hypnose en ligne »), où la concurrence est nationale. Une page dédiée, avec ses propres mots, est nécessaire." },
    ],
  },
  {
    slug: "sophrologue",
    name: "sophrologue",
    plural: "sophrologues",
    of: "de sophrologue",
    a: "un sophrologue",
    featured: true,
    description: "Un site de sophrologue créé et référencé pour vous : pages par accompagnement, séances en groupe ou en entreprise, fiche Google. Démo gratuite.",
    hook: "On vous cherche tantôt par votre métier, tantôt par un besoin qui ne le nomme pas. Votre site doit **être là dans les deux cas**.",
    search: {
      intro: "Votre métier couvre trois publics, qui ne tapent pas les mêmes mots.",
      points: [
        "**En cabinet** : « sophrologue + ville », « sophrologie stress », « sophrologie sommeil », « préparation aux examens ».",
        "**À distance** : « séance de sophrologie en ligne ». Pas de limite géographique, mais une concurrence nationale.",
        "**En entreprise** : « sophrologie en entreprise », « atelier gestion du stress ». Peu de recherches, des missions qui durent.",
      ],
    },
    pages: {
      intro: "Personne ne tape « sophrologue » en premier : on tape son problème. Vos pages doivent le nommer.",
      items: [
        "Une page par accompagnement : **stress**, **sommeil**, **examens et concours**, **grossesse**, **préparation mentale**.",
        "Une page **« Une séance, concrètement »** : durée, déroulé, ce que l'on fait entre deux séances.",
        "Une page **séances de groupe et ateliers**, avec les dates si vous en organisez.",
        "Une page **entreprises**, écrite pour un responsable des ressources humaines : formats, durée, devis.",
        "Une page sur votre parcours : école, certification, spécialités.",
      ],
    },
    local: {
      intro: "Votre fiche Google ancre le cabinet dans sa ville, même si une partie de votre activité se fait à distance.",
      items: [
        "Catégorie **« Sophrologue »**, description qui reprend vos accompagnements.",
        "Une zone desservie plutôt qu'une adresse si vous recevez chez vous ou en salle partagée.",
        "Un service par accompagnement : stress, sommeil, examens, grossesse.",
      ],
    },
    frame: {
      intro: "La sophrologie n'est pas une profession de santé réglementée. Trois règles tiennent toutes vos pages.",
      items: [
        "Vous accompagnez, vous ne soignez pas : ni diagnostic, ni traitement, ni promesse.",
        "Vous n'intervenez pas à la place d'un médecin ou d'un psychologue : dites-le, c'est un signe de sérieux.",
        "Vous ne suggérez jamais de modifier ou d'arrêter un traitement.",
      ],
    },
    topics: [
      "Que se passe-t-il pendant une séance de sophrologie ?",
      "Sophrologie et sommeil : un exercice à faire le soir",
      "Préparer un examen avec la sophrologie",
      "Sophrologie ou méditation : quelles différences",
      "Combien de séances de sophrologie prévoir ?",
    ],
    ads: "Deux approches se défendent : par motif sur **Google Ads** (« sophrologie sommeil + ville ») ou par public sur **Facebook et Instagram** (futures mamans, étudiants avant les examens). Commencez par celle qui correspond à votre spécialité.",
    faq: [
      { q: "Dois-je me spécialiser sur un seul motif ?", a: "Pas forcément, mais chaque accompagnement gagne à avoir sa page. Un site « pour tout le monde » se place rarement ; trois pages précises se placent chacune sur leur sujet." },
      { q: "Faut-il un local pour être visible localement ?", a: "Non. Une fiche Google avec une zone desservie fonctionne, avec une visibilité un peu moindre qu'une adresse affichée." },
      { q: "Comment toucher les entreprises ?", a: "Par une page qui leur est destinée, avec leur vocabulaire : qualité de vie au travail, prévention, cohésion d'équipe. Le reste passe par le réseau local et LinkedIn, que le site vient appuyer." },
    ],
  },
  {
    slug: "naturopathe",
    name: "naturopathe",
    plural: "naturopathes",
    of: "de naturopathe",
    a: "un naturopathe",
    featured: true,
    description: "Un site de naturopathe créé et référencé pour vous : pages par motif, bilan de vitalité, ateliers, fiche Google. Démo personnalisée gratuite.",
    hook: "Vos futurs clients lisent beaucoup avant de consulter. Votre site doit **répondre à leurs questions** et montrer une pratique sérieuse, dans un cadre clair.",
    search: {
      intro: "La recherche se fait en deux temps : on s'informe d'abord, on cherche un praticien ensuite.",
      points: [
        "**Par besoin** : « naturopathe digestion », « naturopathe fatigue », « naturopathe ménopause », « naturopathe fertilité », avec une ville.",
        "**Par question** : « à quoi sert un naturopathe », « que se passe-t-il lors d'un bilan ». Vos articles y répondent, et font venir.",
        "**À distance** : « naturopathe en visio ». Une part réelle de l'activité, à traiter sur une page dédiée.",
      ],
    },
    pages: {
      intro: "Un site de naturopathe se lit longtemps. Donnez de la matière, rangée par sujet.",
      items: [
        "Une page par accompagnement : **digestion**, **fatigue**, **stress et sommeil**, **cycle féminin et ménopause**, **alimentation**.",
        "Une page **« Le premier rendez-vous »** : durée du bilan, questionnaire, suivi.",
        "Une page **ateliers et conférences**, si vous en animez.",
        "Une page tarifs : bilan, suivi, forfaits, consultation à distance.",
        "Une page sur votre formation et votre approche.",
      ],
    },
    local: {
      intro: "On choisit un naturopathe proche et bien noté, puis on vérifie son site.",
      items: [
        "Catégorie **« Naturopathe »**, horaires, lien de réservation.",
        "Une description qui cite vos accompagnements plutôt que des généralités.",
        "Des publications régulières sur la fiche : un atelier, un article, une actualité du cabinet.",
      ],
    },
    frame: {
      intro: "La naturopathie n'est pas réglementée : c'est la précision de vos mots qui vous protège.",
      items: [
        "Ni diagnostic, ni prescription, ni promesse : vous conseillez en hygiène de vie.",
        "Écrivez que vos conseils ne remplacent pas un avis médical, et que vous ne demandez jamais d'arrêter un traitement.",
        "Prudence sur les compléments et les plantes : pas d'allégation de santé non autorisée.",
      ],
    },
    topics: [
      "Comment se passe un premier rendez-vous de naturopathie ?",
      "Fatigue persistante : par où commencer",
      "Digestion difficile : les habitudes à revoir en premier",
      "Naturopathie et ménopause : ce qu'elle peut accompagner",
      "Naturopathe ou diététicien : qui consulter",
    ],
    ads: "La publicité est possible, mais les régies sont strictes sur les sujets de santé : une annonce descriptive passe, une promesse est refusée. Les **contenus réguliers** (articles, réseaux sociaux) sont ici le levier le plus sûr.",
    faq: [
      { q: "Un blog est-il vraiment utile pour un naturopathe ?", a: "Oui, plus que pour beaucoup d'autres métiers : vos clients se renseignent longuement avant de consulter. Un article qui répond à leur question est souvent leur premier contact avec vous." },
      { q: "Puis-je parler de pathologies sur mon site ?", a: "Vous pouvez parler de ce que vous accompagnez, en rappelant que le diagnostic et le traitement relèvent du médecin. En cas de doute sur une formulation, votre fédération est la bonne interlocutrice." },
      { q: "Comment présenter mes consultations en visio ?", a: "Sur une page à part, avec son déroulé et son tarif. Elle se place sur des recherches sans ville, là où la page du cabinet ne peut pas apparaître." },
    ],
  },
  {
    slug: "psychotherapeute",
    name: "psychothérapeute",
    plural: "psychothérapeutes et psychopraticiens",
    of: "de psychothérapeute",
    a: "un psychothérapeute",
    featured: true,
    description: "Un site de psychothérapeute ou de psychopraticien, sobre et rassurant : approches, premières séances, cadre, fiche Google. Démo gratuite.",
    hook: "Écrire à un thérapeute est un pas difficile. Votre site doit **faire baisser cette marche** : dire qui vous êtes, comment vous travaillez, et comment prendre contact simplement.",
    search: {
      intro: "On cherche un professionnel de confiance, près de chez soi, pour quelque chose que l'on a du mal à nommer.",
      points: [
        "**Par lieu** : « psychothérapeute + ville », « psy + quartier », « thérapeute proche de moi ».",
        "**Par difficulté** : « thérapie anxiété », « thérapie de couple », « burn-out accompagnement », « deuil ».",
        "**Par approche** : « thérapie brève », « gestalt-thérapie », « thérapie EMDR », par des personnes déjà renseignées.",
      ],
    },
    pages: {
      intro: "Un site sobre, peu de pages, mais chacune utile à quelqu'un qui hésite.",
      items: [
        "Une page par public ou par difficulté : **adultes**, **couples**, **adolescents**, **anxiété**, **épuisement**.",
        "Une page **« La première séance »** : comment elle se passe, ce qui n'engage à rien.",
        "Une page sur votre **approche et votre formation**, dite simplement.",
        "Une page **cadre et tarifs** : durée, fréquence, annulation, confidentialité.",
        "Une page consultations à distance, si vous en proposez.",
      ],
    },
    local: {
      intro: "La proximité compte : on veut pouvoir venir chaque semaine sans que ce soit une expédition.",
      items: [
        "Une fiche Google complète, avec l'accès au cabinet et les transports.",
        "Des photos du lieu : la salle d'attente, le bureau. On vient plus facilement dans un endroit que l'on a déjà vu.",
        "Des avis sollicités avec tact — beaucoup de patients préfèrent ne pas en laisser, et c'est normal.",
      ],
    },
    frame: {
      intro: "Le titre compte ici plus qu'ailleurs, et il se vérifie.",
      items: [
        "**« Psychothérapeute »** est un titre protégé, soumis à une inscription officielle : ne l'employez que si vous y avez droit. À défaut, « psychopraticien » ou « thérapeute » sont les termes à utiliser.",
        "Aucune promesse de résultat, aucun témoignage qui permettrait d'identifier une personne.",
        "Indiquez les numéros d'urgence et rappelez que votre accompagnement ne remplace pas un suivi médical.",
      ],
    },
    topics: [
      "Comment se passe une première séance chez un thérapeute ?",
      "Psychologue, psychothérapeute, psychopraticien : les différences",
      "À quel moment consulter pour de l'anxiété ?",
      "Thérapie de couple : quand et pourquoi",
      "Combien de temps dure une thérapie ?",
    ],
    ads: "La publicité demande de la retenue : annonces sobres, descriptives, sans promesse ni ciblage intrusif. Sur ce métier, **le référencement local et les contenus** apportent des demandes plus sereines.",
    faq: [
      { q: "Puis-je me présenter comme psychothérapeute ?", a: "Seulement si vous êtes inscrit au registre correspondant : le titre est protégé. Sinon, présentez-vous comme psychopraticien ou thérapeute, en précisant votre formation et votre approche." },
      { q: "Faut-il afficher des avis sur un site de thérapeute ?", a: "Ce n'est pas indispensable. Un texte clair sur votre cadre de travail, votre formation et le déroulement d'une première séance rassure souvent davantage." },
      { q: "Quel ton adopter sur mon site ?", a: "Le vôtre, en plus simple : des phrases courtes, pas de jargon, et une seule action proposée — prendre contact. Harmony règle le ton de vos textes avec vous." },
    ],
  },
  {
    slug: "reflexologue",
    name: "réflexologue",
    plural: "réflexologues",
    of: "de réflexologue",
    a: "un réflexologue",
    featured: true,
    description: "Un site de réflexologue créé et référencé pour vous : séances, publics, bons cadeaux, fiche Google. Démo personnalisée gratuite.",
    hook: "Beaucoup de gens ne savent pas ce qu'est la réflexologie. Votre site doit **l'expliquer simplement** et donner envie d'essayer.",
    search: {
      intro: "On vous cherche pour se détendre, pour un besoin précis, ou pour offrir.",
      points: [
        "**Par lieu** : « réflexologue + ville », « réflexologie plantaire + ville ».",
        "**Par besoin** : « réflexologie stress », « réflexologie sommeil », « réflexologie femme enceinte », « réflexologie bébé ».",
        "**Pour offrir** : « bon cadeau réflexologie », surtout avant les fêtes et la fête des mères.",
      ],
    },
    pages: {
      intro: "Expliquer, montrer, puis proposer : trois temps, quelques pages.",
      items: [
        "Une page par technique : **plantaire**, **palmaire**, **faciale**.",
        "Une page par public : **femmes enceintes**, **seniors**, **enfants**, **personnes stressées**.",
        "Une page **« Déroulement d'une séance »** : durée, installation, sensations.",
        "Une page **bons cadeaux**, avec la marche à suivre pour en offrir un.",
        "Une page tarifs, forfaits et séances à domicile ou en entreprise.",
      ],
    },
    local: {
      intro: "Votre clientèle est de proximité : la carte Google est votre vitrine.",
      items: [
        "Catégorie **« Réflexologue »**, horaires, zone desservie si vous vous déplacez.",
        "Des photos du lieu et de la table : elles donnent l'ambiance mieux qu'un texte.",
        "Une publication avant chaque période de cadeaux pour rappeler vos bons.",
      ],
    },
    frame: {
      intro: "La réflexologie est une pratique de bien-être, non réglementée.",
      items: [
        "Parlez de détente et de bien-être, pas de soin ni de traitement.",
        "Précisez qu'elle ne se substitue pas à un avis médical.",
        "Signalez les situations où vous demandez l'accord du médecin avant de recevoir.",
      ],
    },
    topics: [
      "Comment se passe une séance de réflexologie plantaire ?",
      "Réflexologie et sommeil : ce que l'on peut en attendre",
      "Réflexologie pendant la grossesse : les précautions",
      "Réflexologie ou massage : quelles différences",
      "À quelle fréquence faire des séances ?",
    ],
    ads: "Les **réseaux sociaux** vous vont bien : la pratique se montre, et les bons cadeaux se prêtent aux annonces locales avant les fêtes. Une campagne courte et ciblée suffit, à juger sur les réservations.",
    faq: [
      { q: "Comment vendre des bons cadeaux depuis mon site ?", a: "Par une page dédiée qui explique comment en offrir un et vous contacter. Elle se place sur les recherches de cadeaux de bien-être, très saisonnières." },
      { q: "Je me déplace à domicile : comment être visible ?", a: "Avec une fiche Google réglée sur une zone desservie, et une page qui liste les communes où vous intervenez." },
      { q: "Dois-je expliquer la réflexologie sur mon site ?", a: "Oui : une part importante de vos visiteurs la découvre. Une page claire sur le déroulement d'une séance transforme la curiosité en rendez-vous." },
    ],
  },
  {
    slug: "kinesiologue",
    name: "kinésiologue",
    plural: "kinésiologues",
    of: "de kinésiologue",
    a: "un kinésiologue",
    description: "Un site de kinésiologue qui explique votre pratique et se place sur vos accompagnements : enfants, stress, apprentissages. Démo gratuite.",
    hook: "Votre métier se confond souvent avec un autre. Votre site doit **dire clairement ce que vous faites**, pour qui, et comment.",
    search: {
      intro: "Peu de gens tapent le nom de votre métier sans l'avoir entendu d'un proche. Les autres cherchent une réponse à un besoin.",
      points: [
        "**Par nom de métier** : « kinésiologue + ville », après une recommandation.",
        "**Par besoin** : « difficultés d'apprentissage enfant », « gestion des émotions », « confiance en soi », « stress examens ».",
        "**Par question** : « kinésiologie, c'est quoi », « kinésiologue ou kinésithérapeute ».",
      ],
    },
    pages: {
      intro: "Expliquez d'abord, puis parlez à chaque public.",
      items: [
        "Une page **« La kinésiologie, en clair »** : le test musculaire, le déroulé, ce que ce n'est pas.",
        "Une page par public : **enfants et adolescents**, **adultes**, **sportifs**.",
        "Une page par accompagnement : apprentissages, émotions, stress, confiance.",
        "Une page tarifs et durée des séances.",
        "Une page sur votre formation et votre école.",
      ],
    },
    local: {
      intro: "Les parents cherchent près de l'école et du domicile : soyez sur la carte.",
      items: [
        "Catégorie **« Kinésiologue »**, description qui distingue votre métier de la kinésithérapie.",
        "Vos accompagnements listés en services.",
        "Des avis de parents, quand ils souhaitent en laisser.",
      ],
    },
    frame: {
      intro: "La kinésiologie n'est pas réglementée et n'est pas une profession de santé.",
      items: [
        "Pas de diagnostic, pas de traitement, pas de promesse de résultat.",
        "Dites que vous ne remplacez ni le médecin ni l'orthophoniste ou le psychologue.",
        "Écrivez « kinésiologue », jamais « kiné » : la confusion vous dessert.",
      ],
    },
    topics: [
      "Kinésiologie : comment se passe une séance ?",
      "Kinésiologue ou kinésithérapeute : ne pas confondre",
      "Accompagner un enfant qui peine à l'école",
      "Stress avant un examen : ce que propose la kinésiologie",
      "Combien de séances prévoir ?",
    ],
    ads: "Avant la publicité, il faut des pages qui expliquent : une annonce qui mène à un métier mal compris convertit peu. Une fois le site clair, une campagne locale par public (parents, étudiants) peut se tester.",
    faq: [
      { q: "Comment éviter la confusion avec les kinésithérapeutes ?", a: "En l'écrivant noir sur blanc, dès la page d'accueil et dans la description de votre fiche Google. Une page « kinésiologue ou kinésithérapeute » répond aussi à une recherche fréquente." },
      { q: "Mon métier est peu connu : le référencement vaut-il le coup ?", a: "Oui, mais par les besoins plutôt que par le nom du métier : vos pages se placent sur les difficultés que vous accompagnez, là où les recherches existent." },
      { q: "Faut-il des témoignages ?", a: "Ils aident, à condition d'être réels et de ne promettre aucun résultat. Demandez-les simplement, sans insister." },
    ],
  },
  {
    slug: "praticien-reiki",
    name: "praticien reiki",
    plural: "praticiens reiki",
    of: "de praticien reiki",
    a: "un praticien reiki",
    description: "Un site de praticien reiki clair et rassurant : séances, initiations, cadre de la pratique, fiche Google. Démo personnalisée gratuite.",
    hook: "Le reiki attire et interroge. Votre site doit **rassurer sans survendre** : dire simplement ce qu'est une séance, et ce qu'elle n'est pas.",
    search: {
      intro: "Deux publics vous cherchent : ceux qui veulent recevoir une séance, et ceux qui veulent se former.",
      points: [
        "**Pour une séance** : « reiki + ville », « séance de reiki », « reiki stress », « reiki à distance ».",
        "**Pour se former** : « initiation reiki + ville », « formation reiki niveau 1 ».",
        "**Par curiosité** : « reiki, c'est quoi », « comment se passe une séance de reiki ».",
      ],
    },
    pages: {
      intro: "Séparez bien les séances et les formations : ce ne sont pas les mêmes visiteurs.",
      items: [
        "Une page **« Une séance de reiki »** : durée, déroulé, ce que l'on ressent.",
        "Une page **initiations et formations**, avec les niveaux, les dates et les tarifs.",
        "Une page séances à distance, si vous en proposez.",
        "Une page sur votre parcours et votre lignée d'enseignement.",
        "Une page tarifs et bons cadeaux.",
      ],
    },
    local: {
      intro: "On cherche un praticien proche, dans un lieu calme : montrez le vôtre.",
      items: [
        "Une fiche Google avec vos horaires et des photos du lieu.",
        "Les dates de vos initiations publiées sur la fiche.",
        "Des avis qui décrivent l'accueil et le déroulé, sans promesse.",
      ],
    },
    frame: {
      intro: "Le reiki est une pratique de bien-être, non réglementée, et parfois regardée avec méfiance : la sobriété est votre meilleure alliée.",
      items: [
        "Parlez de détente et d'accompagnement, jamais de soin, de guérison ou d'énergie « qui soigne ».",
        "Écrivez que le reiki ne remplace aucun traitement ni avis médical.",
        "N'encouragez jamais à interrompre un suivi.",
      ],
    },
    topics: [
      "Comment se passe une séance de reiki ?",
      "Reiki à distance : comment cela se déroule",
      "Se former au reiki : les niveaux, dans l'ordre",
      "Que ressent-on pendant une séance ?",
      "Reiki et relaxation : à qui cela s'adresse",
    ],
    ads: "Les régies publicitaires sont prudentes avec les pratiques énergétiques : restez sur des annonces descriptives (« séance de relaxation reiki »). Vos **initiations**, datées et locales, se prêtent bien à une courte campagne.",
    faq: [
      { q: "Comment parler du reiki sans promettre ?", a: "En décrivant ce qui se passe : un temps de détente, allongé et habillé, dans le calme. Ce que chacun en retire lui appartient ; votre site n'a pas à l'annoncer à sa place." },
      { q: "Dois-je séparer séances et formations ?", a: "Oui, sur deux pages distinctes : les recherches, les questions et les tarifs ne sont pas les mêmes." },
      { q: "Les séances à distance ont-elles leur place sur le site ?", a: "Oui, sur une page dédiée qui explique le déroulé. Elle s'adresse à des personnes qui ne cherchent pas par ville." },
    ],
  },
  {
    slug: "praticien-shiatsu",
    name: "praticien shiatsu",
    plural: "praticiens shiatsu",
    of: "de praticien shiatsu",
    a: "un praticien shiatsu",
    description: "Un site de praticien shiatsu créé et référencé pour vous : séances, publics, shiatsu en entreprise, fiche Google. Démo gratuite.",
    hook: "Le shiatsu se découvre souvent par hasard. Votre site doit **l'expliquer en quelques lignes** et montrer à qui il s'adresse.",
    search: {
      intro: "Le mot est connu, la pratique moins. Les recherches mêlent donc noms et besoins.",
      points: [
        "**Par lieu** : « shiatsu + ville », « praticien shiatsu près de moi ».",
        "**Par besoin** : « shiatsu stress », « shiatsu dos », « shiatsu sommeil », « shiatsu femme enceinte ».",
        "**En entreprise** : « shiatsu assis en entreprise », « amma assis », pour les événements et la qualité de vie au travail.",
      ],
    },
    pages: {
      intro: "Une page par usage, et une explication simple pour commencer.",
      items: [
        "Une page **« Le shiatsu, en bref »** : pressions, tenue souple, futon ou table.",
        "Une page par besoin : **stress et fatigue**, **tensions du dos**, **sommeil**.",
        "Une page **shiatsu assis et entreprises**, avec formats et devis.",
        "Une page tarifs, forfaits et bons cadeaux.",
        "Une page sur votre formation et votre fédération.",
      ],
    },
    local: {
      intro: "Votre clientèle vient du quartier et des alentours : la fiche Google est décisive.",
      items: [
        "Catégorie **« Praticien de shiatsu »** quand elle existe dans votre secteur, sinon la plus proche.",
        "Photos du lieu de pratique, horaires, lien de réservation.",
        "Une zone desservie si vous intervenez en entreprise.",
      ],
    },
    frame: {
      intro: "Le shiatsu est une pratique de bien-être : le vocabulaire fait la différence.",
      items: [
        "Parlez de détente et d'accompagnement, pas de soin médical ni de massage thérapeutique.",
        "Indiquez qu'il ne remplace pas un avis médical.",
        "Mentionnez votre formation et votre fédération : elles situent votre pratique.",
      ],
    },
    topics: [
      "Comment se déroule une séance de shiatsu ?",
      "Shiatsu et stress : pour qui, à quelle fréquence",
      "Shiatsu assis en entreprise : le déroulé",
      "Shiatsu ou massage : les différences",
      "Shiatsu pendant la grossesse : les précautions",
    ],
    ads: "Une campagne locale courte, sur **Instagram ou Facebook**, convient pour faire découvrir la pratique. Pour les entreprises, une page claire et un devis rapide comptent plus qu'une annonce.",
    faq: [
      { q: "Puis-je écrire « massage shiatsu » ?", a: "Le terme est très recherché. Vous pouvez l'utiliser avec prudence, en précisant qu'il s'agit d'une pratique de bien-être et non d'un massage thérapeutique, réservé aux professionnels de santé." },
      { q: "Comment présenter le shiatsu en entreprise ?", a: "Sur une page pensée pour un responsable des ressources humaines : durée par personne, matériel, nombre de participants, tarif à la demi-journée." },
      { q: "Faut-il un blog ?", a: "Il aide, parce que la pratique est mal connue : chaque article qui répond à une question simple amène des personnes qui ne vous auraient pas cherché." },
    ],
  },
  {
    slug: "professeur-de-yoga",
    name: "professeur de yoga",
    plural: "professeurs de yoga",
    of: "de professeur de yoga",
    a: "un professeur de yoga",
    description: "Un site de professeur de yoga créé et référencé pour vous : planning des cours, tarifs, stages, cours en ligne, fiche Google. Démo gratuite.",
    hook: "On choisit un cours pour un horaire, un lieu et une personne. Votre site doit **montrer les trois d'un coup d'œil**.",
    search: {
      intro: "La recherche est très locale et très pratique : où, quand, quel style.",
      points: [
        "**Par lieu** : « cours de yoga + ville », « yoga + quartier », « studio de yoga près de moi ».",
        "**Par style ou public** : « yoga prénatal », « yin yoga », « yoga débutant », « yoga seniors ».",
        "**Par format** : « stage de yoga », « retraite yoga », « cours de yoga en ligne ».",
      ],
    },
    pages: {
      intro: "Votre planning est la page la plus consultée : mettez-la en avant.",
      items: [
        "Une page **planning et tarifs**, à jour : cours à l'unité, cartes, abonnements, cours d'essai.",
        "Une page par style ou par public : **débutants**, **prénatal**, **yin**, **seniors**.",
        "Une page **stages et retraites**, avec les dates.",
        "Une page cours particuliers et cours en entreprise.",
        "Une page sur votre parcours et votre formation.",
      ],
    },
    local: {
      intro: "La carte Google décide de beaucoup : on y compare les lieux et les horaires.",
      items: [
        "Catégorie **« Studio de yoga »** ou « Professeur de yoga », horaires des cours à jour.",
        "Des photos de la salle et des cours.",
        "Une publication à chaque rentrée, chaque stage, chaque nouveau créneau.",
      ],
    },
    frame: {
      intro: "L'enseignement du yoga est libre : votre sérieux se lit dans vos informations.",
      items: [
        "Indiquez votre formation et le nombre d'heures : elles situent votre enseignement.",
        "Pas d'allégation de santé : le yoga accompagne, il ne traite pas.",
        "Signalez les cours adaptés et les contre-indications à signaler avant de venir.",
      ],
    },
    topics: [
      "Quel style de yoga choisir quand on débute ?",
      "Yoga prénatal : à partir de quand, et jusqu'à quand",
      "Que faut-il apporter à un premier cours ?",
      "Yin yoga : à qui s'adresse-t-il",
      "Cinq postures pour délier le dos après une journée assise",
    ],
    ads: "**Instagram et Facebook** sont vos terrains naturels : une annonce locale à la rentrée ou avant un stage, avec une offre d'essai, se mesure facilement en inscriptions.",
    faq: [
      { q: "Mon planning change souvent : comment tenir le site à jour ?", a: "Depuis votre espace, en quelques clics, avec l'aperçu en direct : horaires, tarifs et textes se modifient sans passer par personne." },
      { q: "Faut-il une page par style de yoga ?", a: "Oui pour ceux que vous enseignez régulièrement : « yoga prénatal + ville » et « yin yoga + ville » sont des recherches à part entière." },
      { q: "Puis-je proposer mes cours en ligne ?", a: "Oui, sur une page dédiée qui explique le fonctionnement et le tarif. Elle touche des personnes au-delà de votre ville." },
    ],
  },
];

export const FEATURED_PROFESSIONS = PROFESSIONS.filter((profession) => profession.featured);

/** Adresse de la page d'un métier. */
export function professionPath(profession: Pick<Profession, "slug">): string {
  return `/creation-site-internet-${profession.slug}`;
}

export const PROFESSION_PREFIX = "creation-site-internet-";

/** Le métier d'une adresse `creation-site-internet-<slug>`, s'il existe. */
export function professionFromSegment(segment: string): Profession | undefined {
  if (!segment.startsWith(PROFESSION_PREFIX)) return undefined;
  const slug = segment.slice(PROFESSION_PREFIX.length);
  return PROFESSIONS.find((profession) => profession.slug === slug);
}

/** Majuscule initiale : « ostéopathe » → « Ostéopathe ». */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}
