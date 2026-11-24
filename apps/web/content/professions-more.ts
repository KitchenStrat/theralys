import type { Profession } from "./professions";

/*
 * La suite des fiches par métier (cf. `professions.ts` pour le format et les
 * règles d'écriture). Trois professions de santé ont un ordre et un code de
 * déontologie qui encadrent la communication — kinésithérapeute, sage-femme,
 * pédicure-podologue : leur fiche porte `ordered`, et la page n'y propose ni
 * publicité payante ni recueil d'avis.
 */

/** Le cadre commun aux professions à ordre : information libre et loyale, ni témoignages ni référencement payant. */
const orderedFrame = (peers: string, patients: string) => ({
  intro: "Votre profession a un **ordre et un code de déontologie** qui encadrent la communication. Votre site doit s'y tenir à la lettre.",
  items: [
    "Vous pouvez informer librement sur vos compétences, votre parcours et vos conditions d'exercice, de manière loyale et honnête.",
    `Pas de témoignages de ${patients}, pas de comparaison avec ${peers}, rien qui incite à des actes inutiles.`,
    "Pas de référencement payant : le code interdit d'acheter une place prioritaire dans les résultats de recherche. En cas de doute, votre conseil de l'ordre tranche.",
  ],
});

const ORDERED_ADS =
  "**Pas de publicité payante** pour votre profession : votre code de déontologie écarte le référencement acheté. Vos leviers sont le **référencement naturel**, une **fiche Google complète** et une page par activité.";

const orderedFaq = (patients: string) => [
  {
    q: "Ai-je le droit d'avoir un site internet ?",
    a: "Oui. Votre code de déontologie autorise une information loyale et honnête sur vos compétences et vos conditions d'exercice. Ce qu'il écarte, ce sont la publicité commerciale, les témoignages et le référencement payant.",
  },
  {
    q: `Puis-je afficher des avis de ${patients} ?`,
    a: "Pas sur votre site : le code exclut le recours aux témoignages. Des avis peuvent être laissés spontanément sur Google sans que vous y soyez pour rien ; ne les sollicitez pas et, en cas de doute, interrogez votre ordre.",
  },
];

export const MORE_PROFESSIONS: readonly Profession[] = [
  {
    slug: "magnetiseur",
    name: "magnétiseur",
    plural: "magnétiseurs",
    of: "de magnétiseur",
    a: "un magnétiseur",
    family: "bien-etre",
    description: "Un site de magnétiseur clair et rassurant : ce que vous faites, le déroulé d'une séance, vos tarifs. Démo personnalisée gratuite.",
    hook: "On vient souvent à vous par recommandation, puis on vous cherche pour vérifier. Votre site doit **dire simplement ce que vous faites** et **rassurer sans rien promettre**.",
    search: {
      intro: "Le bouche-à-oreille donne votre nom ; Google sert à confirmer, ou à trouver quelqu'un près de chez soi.",
      points: [
        "**« Magnétiseur + ville »** et « magnétiseur près de moi » : la recherche locale, où la carte Google décide.",
        "**Par demande** : « magnétiseur stress », « magnétiseur fatigue », « coupeur de feu ». Ces recherches existent ; y répondre demande de la mesure.",
        "**À distance** : « magnétiseur à distance », « séance sur photo ». Si vous en proposez, dites clairement comment cela se passe.",
      ],
    },
    pages: {
      intro: "Votre pratique surprend ceux qui ne la connaissent pas. Chaque page doit lever une question.",
      items: [
        "Une page **« Comment se passe une séance »** : durée, déroulé, ce que l'on ressent.",
        "Une page par demande fréquente — **stress**, **fatigue**, **sommeil** — écrite comme un accompagnement, jamais comme un soin médical.",
        "Une page **« Qui suis-je »** : votre parcours, votre manière de travailler, vos limites.",
        "Une page **tarifs**, sans ambiguïté : prix de la séance, durée, séances à distance.",
        "Une page **« Ce que le magnétisme ne remplace pas »** : la plus rassurante de toutes.",
      ],
    },
    local: {
      intro: "On choisit un magnétiseur près de chez soi, et bien noté.",
      items: [
        "La catégorie la plus proche de votre pratique, et une zone desservie si vous vous déplacez.",
        "Des horaires à jour et un numéro cliquable : beaucoup appellent avant de réserver.",
        "Des avis réguliers : sur une pratique qui repose sur la confiance, ils comptent double.",
      ],
    },
    frame: {
      intro: "La pratique n'est pas réglementée, et la loi réserve aux médecins le diagnostic et le traitement : votre site doit être **irréprochable sur ce point**.",
      items: [
        "Vous ne posez pas de diagnostic et ne traitez pas une maladie : écrivez « accompagner », jamais « soigner » ni « guérir ».",
        "Ne conseillez jamais d'interrompre ou de modifier un traitement, et dites-le en toutes lettres sur le site.",
        "Aucun résultat promis, aucun « avant / après » : une promesse invérifiable se retourne contre vous.",
      ],
    },
    topics: [
      "Comment se déroule une séance de magnétisme ?",
      "Magnétisme et médecine : ce que l'un ne remplace pas",
      "Séance à distance : comment cela se passe",
      "Combien de séances prévoir, et à quel rythme",
      "Que ressent-on pendant une séance ?",
    ],
    ads: "Les régies publicitaires encadrent de près tout ce qui touche à la santé, et refusent les promesses de guérison. **Votre fiche Google et vos avis** feront plus pour vous qu'une annonce : commencez par eux.",
    faq: [
      { q: "Puis-je citer les demandes pour lesquelles on me consulte ?", a: "Oui, à condition de parler d'accompagnement et de rappeler que vous n'intervenez pas à la place d'un médecin. Une page mesurée inspire plus confiance qu'une liste de promesses." },
      { q: "Faut-il afficher ses tarifs ?", a: "Oui. Un prix clair, avec la durée de la séance, écarte les malentendus et rassure avant le premier appel." },
      { q: "Je travaille surtout par recommandation : un site est-il utile ?", a: "Oui : la personne à qui l'on vous a recommandé tape votre nom avant d'appeler. Elle doit tomber sur vous, lire comment vous travaillez et trouver votre numéro." },
    ],
  },
  {
    slug: "praticien-feng-shui",
    name: "praticien feng shui",
    plural: "praticiens feng shui",
    of: "de praticien feng shui",
    a: "un praticien feng shui",
    family: "bien-etre",
    description: "Un site de praticien feng shui qui montre vos réalisations et explique vos prestations : visite, étude, suivi. Démo gratuite.",
    hook: "Vos clients achètent un regard sur leur lieu de vie. Votre site doit **montrer votre travail**, expliquer vos prestations et **rendre le devis facile à demander**.",
    search: {
      intro: "On vous cherche à un moment précis : un emménagement, des travaux, un local à ouvrir.",
      points: [
        "**« Feng shui + ville »**, « consultant feng shui », « expert feng shui maison ».",
        "**Par projet** : « feng shui chambre », « feng shui bureau », « feng shui avant achat », « harmoniser sa maison ».",
        "**Par les professionnels** : commerces, cabinets et bureaux cherchent une étude avant un aménagement.",
      ],
    },
    pages: {
      intro: "Une prestation se vend quand on comprend ce que l'on reçoit.",
      items: [
        "Une page par prestation : **étude d'un logement**, **étude avant achat ou travaux**, **locaux professionnels**.",
        "Une page **« Comment se passe une étude »** : visite ou plans, durée, ce que vous remettez.",
        "Une page **réalisations**, avec des photos et l'accord des clients.",
        "Une page **tarifs** ou demande de devis, selon la surface.",
        "Une page sur votre formation et votre école de feng shui.",
      ],
    },
    local: {
      intro: "Vous vous déplacez : dites jusqu'où.",
      items: [
        "Une zone desservie précise, et les études à distance sur plans si vous en faites.",
        "Des photos de réalisations, avec l'accord des clients.",
        "Des avis demandés une fois les changements en place.",
      ],
    },
    frame: {
      intro: "Le feng shui relève du conseil en aménagement : **restez sur ce terrain**.",
      items: [
        "Aucune promesse de santé, de réussite ou de fortune : décrivez ce que vous faites, pas ce qui arrivera.",
        "Un devis clair avant chaque étude, avec ce qui est remis à la fin.",
        "Si des travaux sont en jeu, précisez ce qui relève d'un architecte ou d'un artisan.",
      ],
    },
    topics: [
      "Feng shui : par quelle pièce commencer ?",
      "Aménager une chambre selon le feng shui",
      "Faire étudier un logement avant de l'acheter",
      "Feng shui au bureau : les principes simples",
      "Comment se déroule une étude feng shui ?",
    ],
    ads: "Vos réalisations se montrent : **Instagram et Facebook** s'y prêtent, et une annonce locale peut faire connaître une offre d'étude. Jugez-la au nombre de demandes de devis.",
    faq: [
      { q: "Dois-je afficher mes prix ?", a: "Au moins une fourchette ou un prix de départ selon la surface. Sans repère, beaucoup n'osent pas demander de devis." },
      { q: "Puis-je travailler à distance ?", a: "Oui, si vous étudiez sur plans et photos. Donnez à cette prestation sa propre page : elle touche des clients bien au-delà de votre ville." },
      { q: "Comment montrer mon travail sans photos de clients ?", a: "Avec des schémas, des plans commentés ou des exemples anonymisés. L'important est que l'on comprenne ce que vous remettez à la fin." },
    ],
  },
  {
    slug: "psychologue",
    name: "psychologue",
    plural: "psychologues",
    of: "de psychologue",
    a: "un psychologue",
    family: "accompagnement",
    description: "Un site de psychologue sobre et clair : vos approches, vos publics, vos modalités et la prise de rendez-vous. Démo gratuite.",
    hook: "Prendre rendez-vous chez un psychologue demande déjà un effort. Votre site doit **rendre ce premier pas simple** : qui vous recevez, comment, et à quel tarif.",
    search: {
      intro: "Le lieu compte, mais la personne cherche surtout quelqu'un qui connaît sa difficulté.",
      points: [
        "**« Psychologue + ville ou quartier »**, « psychologue près de moi », « psychologue en visio ».",
        "**Par public ou par motif** : « psychologue enfant », « psychologue adolescent », « psychologue couple », « psychologue anxiété », « psychologue burn-out ».",
        "**Par approche ou par prise en charge** : « psychologue TCC », « psychologue EMDR », « psychologue remboursé ».",
      ],
    },
    pages: {
      intro: "On veut savoir si vous êtes la bonne personne avant d'écrire. Chaque page y répond.",
      items: [
        "Une page par public : **enfants**, **adolescents**, **adultes**, **couples**.",
        "Une page par approche que vous pratiquez, expliquée simplement.",
        "Une page **« Première séance »** : durée, déroulé, ce qu'il faut savoir avant de venir.",
        "Une page **tarifs et prise en charge** : honoraires, mutuelles, dispositifs de remboursement auxquels vous participez.",
        "Une page **téléconsultation**, si vous en proposez.",
      ],
    },
    local: {
      intro: "La carte Google est souvent le premier écran que l'on voit.",
      items: [
        "Catégorie **« Psychologue »**, horaires, lien de prise de rendez-vous.",
        "Des photos du cabinet et de la salle d'attente : le lieu rassure.",
        "Une description sobre, avec vos publics et vos approches.",
      ],
    },
    frame: {
      intro: "Le titre de psychologue est **protégé** : votre site peut s'y appuyer, dans la sobriété que demande la profession.",
      items: [
        "Affichez votre diplôme et votre numéro d'enregistrement.",
        "Le code de déontologie des psychologues invite à la réserve : informez, ne promettez pas, ne comparez pas.",
        "La confidentialité est absolue : aucun récit de suivi sur le site, et beaucoup de retenue avec les avis en ligne.",
      ],
    },
    topics: [
      "Psychologue, psychiatre, psychothérapeute : quelles différences ?",
      "Comment se passe une première séance ?",
      "Quand consulter pour un enfant ou un adolescent",
      "Thérapie en visio : pour qui, et comment",
      "Combien de temps dure un suivi ?",
    ],
    ads: "La plupart des cabinets n'en ont pas besoin : **le référencement local et la fiche Google** suffisent le plus souvent. Si vous y recourez, restez strictement informatif : les régies encadrent de près les annonces liées à la santé mentale.",
    faq: [
      { q: "Puis-je demander des avis à mes patients ?", a: "La confidentialité et la déontologie invitent à beaucoup de retenue : mieux vaut ne pas solliciter. Votre fiche Google reste utile sans cela, par ses informations, ses photos et son lien de rendez-vous." },
      { q: "Faut-il détailler mes approches ?", a: "Oui, simplement. « TCC », « EMDR » ou « thérapie de couple » sont des recherches à part entière, et la personne veut comprendre ce qui l'attend." },
      { q: "Dois-je afficher mes tarifs ?", a: "Oui. C'est l'une des premières questions, et l'afficher évite un appel que beaucoup n'osent pas passer." },
    ],
  },
  {
    slug: "art-therapeute",
    name: "art-thérapeute",
    plural: "art-thérapeutes",
    of: "d'art-thérapeute",
    a: "un art-thérapeute",
    family: "accompagnement",
    description: "Un site d'art-thérapeute qui explique votre approche et vos publics : séances, ateliers, interventions en structure. Démo gratuite.",
    hook: "L'art-thérapie se comprend mieux quand on la voit. Votre site doit **montrer votre atelier**, dire à qui vous vous adressez et **mener à un premier échange**.",
    search: {
      intro: "Deux publics vous cherchent : des particuliers, et des structures qui montent un projet.",
      points: [
        "**« Art-thérapeute + ville »**, « art-thérapie enfant », « art-thérapie adolescent », « atelier d'art-thérapie ».",
        "**Par besoin** : « exprimer ses émotions autrement », « art-thérapie deuil », « art-thérapie burn-out ».",
        "**Par les structures** : EHPAD, écoles, associations cherchent un intervenant. Elles veulent un cadre, des références, un contact direct.",
      ],
    },
    pages: {
      intro: "Votre médiation — peinture, terre, collage, écriture — est votre signature. Donnez-lui de la place.",
      items: [
        "Une page par public : **enfants et adolescents**, **adultes**, **personnes âgées**.",
        "Une page **« Une séance, concrètement »** : aucun talent artistique n'est demandé, dites-le d'emblée.",
        "Une page **ateliers de groupe**, avec les dates et les tarifs.",
        "Une page **interventions en structure** : le cadre, la durée d'un cycle, comment demander un devis.",
        "Une page sur votre formation et votre médiation, avec des photos de l'atelier.",
      ],
    },
    local: {
      intro: "L'atelier est un lieu : on veut le voir avant de venir.",
      items: [
        "Des photos de l'atelier et du matériel, lumineuses et récentes.",
        "Vos ateliers et vos cycles annoncés en publication, à chaque rentrée.",
        "Une description qui nomme vos publics et votre médiation.",
      ],
    },
    frame: {
      intro: "Le titre d'art-thérapeute n'est pas protégé : **votre formation fait la différence**, affichez-la.",
      items: [
        "Indiquez votre certification ou votre diplôme, et votre supervision si vous en avez une.",
        "L'art-thérapie accompagne : elle ne remplace pas un suivi médical ou psychologique. Dites-le simplement.",
        "Les créations des personnes accompagnées sont confidentielles : rien n'est publié sans accord écrit, et jamais de façon reconnaissable.",
      ],
    },
    topics: [
      "Faut-il savoir dessiner pour faire de l'art-thérapie ?",
      "Art-thérapie pour les enfants : dans quels cas y penser",
      "Comment se déroule une séance d'art-thérapie ?",
      "Art-thérapie et grand âge : ce que les ateliers apportent",
      "Séance individuelle ou atelier de groupe : comment choisir",
    ],
    ads: "**Instagram** vous va bien : l'atelier, la matière, les couleurs se montrent. Une annonce locale pour un cycle d'ateliers se mesure simplement, en inscriptions. Pas de promesse thérapeutique dans le texte.",
    faq: [
      { q: "Puis-je montrer des créations réalisées en séance ?", a: "Seulement avec l'accord écrit de la personne, et sans rien qui permette de la reconnaître. Dans le doute, montrez l'atelier et le matériel : ils racontent déjà votre travail." },
      { q: "Comment toucher les EHPAD et les écoles ?", a: "Avec une page dédiée aux structures : votre cadre d'intervention, la durée d'un cycle, vos références et un moyen simple de demander un devis. C'est elle que l'on transmet en interne." },
      { q: "Faut-il un blog ?", a: "Il aide beaucoup : l'art-thérapie est mal connue, et les questions tapées dans Google sont nombreuses. Chaque article qui y répond vous amène des lecteurs de votre région." },
    ],
  },
  {
    slug: "musicotherapeute",
    name: "musicothérapeute",
    plural: "musicothérapeutes",
    of: "de musicothérapeute",
    a: "un musicothérapeute",
    family: "accompagnement",
    description: "Un site de musicothérapeute pour expliquer vos séances et toucher particuliers et structures. Démo personnalisée gratuite.",
    hook: "La musicothérapie reste mal connue. Votre site doit **dire en quelques lignes ce qu'elle est**, à qui elle s'adresse, et **comment vous joindre**.",
    search: {
      intro: "On vous cherche pour un proche autant que pour soi, et souvent au nom d'une structure.",
      points: [
        "**« Musicothérapeute + ville »**, « musicothérapie enfant », « musicothérapie autisme », « musicothérapie Alzheimer ».",
        "**Par curiosité** : « qu'est-ce que la musicothérapie », « musicothérapie active ou réceptive ». Répondre simplement, c'est déjà se distinguer.",
        "**Par les structures** : crèches, établissements médico-sociaux et EHPAD cherchent un intervenant formé.",
      ],
    },
    pages: {
      intro: "Écoute ou pratique, individuel ou groupe : expliquez vos formats sans jargon.",
      items: [
        "Une page **« Musicothérapie active, musicothérapie réceptive »** : la différence, en mots simples.",
        "Une page par public : **jeunes enfants**, **personnes en situation de handicap**, **personnes âgées**, **adultes**.",
        "Une page **« Une séance, concrètement »** : aucune pratique musicale n'est nécessaire.",
        "Une page **interventions en structure**, avec le cadre et la demande de devis.",
        "Une page sur votre formation, vos instruments et votre lieu.",
      ],
    },
    local: {
      intro: "Votre salle et vos instruments parlent pour vous.",
      items: [
        "Des photos du lieu et des instruments.",
        "Vos zones d'intervention, si vous vous déplacez en structure ou à domicile.",
        "Une description qui cite vos publics, dans leurs mots.",
      ],
    },
    frame: {
      intro: "Le titre n'est pas protégé : **votre diplôme et votre cadre** rassurent familles et structures.",
      items: [
        "Affichez votre formation, et votre supervision le cas échéant.",
        "La musicothérapie accompagne un parcours de soins ; elle ne s'y substitue pas.",
        "Pas d'enregistrement ni de photo de séance publiés sans accord écrit.",
      ],
    },
    topics: [
      "Musicothérapie active ou réceptive : quelle différence ?",
      "La musicothérapie auprès des personnes âgées",
      "Faut-il être musicien pour suivre des séances ?",
      "Musicothérapie et petite enfance : ce qui se joue",
      "Comment se déroule une première séance ?",
    ],
    ads: "La demande passe surtout par la **recommandation** et par les **structures**. Avant toute publicité, soignez votre page d'interventions et votre fiche Google : ce sont elles que l'on consulte après un premier contact.",
    faq: [
      { q: "Mon public, ce sont surtout des établissements : le site sert-il ?", a: "Oui : avant de vous confier un cycle, un établissement cherche votre nom. Une page claire sur votre cadre d'intervention fait gagner du temps à tout le monde." },
      { q: "Puis-je mettre des extraits sonores ?", a: "Oui s'il s'agit de vos propres démonstrations. Jamais d'enregistrement de séance sans l'accord écrit des personnes concernées." },
      { q: "Faut-il parler des troubles que j'accompagne ?", a: "Oui, en parlant d'accompagnement et en rappelant la place du suivi médical. Ce sont les mots que tapent les familles." },
    ],
  },
  {
    slug: "coach-de-vie",
    name: "coach de vie",
    plural: "coachs de vie",
    of: "de coach de vie",
    a: "un coach de vie",
    family: "accompagnement",
    description: "Un site de coach de vie qui dit pour qui vous travaillez et comment : offres, séance découverte, rendez-vous. Démo gratuite.",
    hook: "Le mot « coach » dit tout et rien. Votre site doit **préciser pour qui vous travaillez**, sur quoi, et **donner envie d'un premier échange**.",
    search: {
      intro: "On ne cherche pas « un coach » : on cherche une issue à une situation.",
      points: [
        "**Par situation** : « reconversion professionnelle », « retrouver confiance en soi », « coach burn-out », « changer de vie ».",
        "**Par lieu ou par format** : « coach de vie + ville », « coaching en ligne », « coaching en visio ».",
        "**Par nom**, après un contenu vu sur les réseaux ou une recommandation.",
      ],
    },
    pages: {
      intro: "Une offre lisible vaut mieux qu'une longue présentation de la méthode.",
      items: [
        "Une page par accompagnement : **reconversion**, **confiance en soi**, **équilibre de vie**, **prise de décision**.",
        "Une page **« Comment se passe un accompagnement »** : durée, rythme, nombre de séances, en cabinet ou en visio.",
        "Une page **séance découverte**, avec la prise de rendez-vous.",
        "Une page **tarifs** : séance, forfaits, ce qui est compris.",
        "Une page sur votre parcours, votre certification et votre cadre.",
      ],
    },
    local: {
      intro: "Même en visio, la proximité rassure : beaucoup choisissent un coach de leur région.",
      items: [
        "Une fiche Google avec votre adresse ou votre zone, et la mention des séances à distance.",
        "Des avis réguliers, demandés en fin d'accompagnement.",
        "Une description qui reprend les situations que vous accompagnez.",
      ],
    },
    frame: {
      intro: "Le métier n'est pas réglementé : **la clarté de votre cadre** fait votre sérieux.",
      items: [
        "Le coaching n'est pas une thérapie : dites ce que vous ne prenez pas en charge, et vers qui vous orientez.",
        "Pas de promesse de résultat, pas de réussite ni de revenu garantis.",
        "Affichez votre formation, le code de déontologie de votre fédération si vous y adhérez, et vos conditions.",
      ],
    },
    topics: [
      "Coach, psychologue, thérapeute : à qui s'adresser ?",
      "Reconversion : par où commencer quand on ne sait pas quoi faire",
      "Combien de séances dure un coaching ?",
      "Reprendre confiance après un échec professionnel",
      "Coaching en visio : comment cela se passe",
    ],
    ads: "On découvre souvent un coach par ses contenus : **les réseaux sociaux** sont votre terrain. La publicité sert bien une séance découverte ou un atelier ; elle se juge au nombre de premiers échanges, pas aux mentions « j'aime ».",
    faq: [
      { q: "Dois-je me spécialiser ?", a: "Sur votre site, oui : une page par situation accompagnée se place bien mieux qu'une présentation générale, et parle directement à la personne concernée." },
      { q: "Faut-il proposer une séance découverte ?", a: "C'est à vous d'en décider. Si vous en proposez une, donnez-lui sa page et un bouton de réservation : c'est souvent le premier pas le plus facile à franchir." },
      { q: "Je travaille surtout en visio : la fiche Google est-elle utile ?", a: "Oui. Elle vous fait apparaître sur votre nom et dans votre région, et porte vos avis. Indiquez une zone desservie plutôt qu'une adresse si vous ne recevez pas." },
    ],
  },
  {
    slug: "chiropracteur",
    name: "chiropracteur",
    plural: "chiropracteurs",
    of: "de chiropracteur",
    a: "un chiropracteur",
    family: "sante",
    description: "Un site de chiropracteur créé et référencé pour vous : pages par motif, première consultation, fiche Google. Démo gratuite.",
    hook: "Beaucoup confondent encore chiropraxie et ostéopathie. Votre site doit **expliquer votre métier**, apparaître près de chez vous et **mener au rendez-vous**.",
    search: {
      intro: "On vous cherche pour une douleur précise, et souvent en comparant.",
      points: [
        "**« Chiropracteur + ville »**, « chiropraticien près de moi » : les deux mots sont tapés, employez-les tous les deux.",
        "**Par motif** : « chiropracteur sciatique », « chiropracteur cervicales », « mal de dos chiropracteur ».",
        "**Par comparaison** : « chiropracteur ou ostéopathe », « différence chiropraxie ostéopathie ». Une page qui y répond vous amène des lecteurs décidés.",
      ],
    },
    pages: {
      intro: "Votre domaine est clair : la colonne et les articulations. Vos pages doivent l'être autant.",
      items: [
        "Une page par motif fréquent : **lombalgie**, **sciatique**, **cervicalgie**, **maux de tête**.",
        "Une page **« Première consultation »** : bilan, déroulé, durée.",
        "Une page **« Chiropraxie ou ostéopathie »** : la question que tout le monde se pose.",
        "Une page par public : **sportifs**, **femmes enceintes**, **seniors**.",
        "Une page **tarifs et prise en charge** par les mutuelles.",
      ],
    },
    local: {
      intro: "La recherche est locale et souvent pressée : la carte Google fait le tri.",
      items: [
        "Catégorie **« Chiropracteur »**, horaires exacts, prise de rendez-vous en ligne.",
        "Des photos du cabinet et de la salle de soins.",
        "Vos motifs de consultation détaillés dans les services, avec les mots de vos pages.",
      ],
    },
    frame: {
      intro: "Le titre de chiropracteur est **réglementé** : votre formation est un argument, à présenter factuellement.",
      items: [
        "Affichez votre diplôme, votre numéro d'enregistrement et votre assurance.",
        "Décrivez votre prise en charge, pas un résultat : ni guérison promise, ni comparaison avec d'autres praticiens.",
        "Indiquez les situations qui relèvent d'abord du médecin : c'est une marque de sérieux.",
      ],
    },
    topics: [
      "Chiropracteur ou ostéopathe : quelle différence ?",
      "Sciatique : quand consulter un chiropracteur",
      "Comment se passe une première consultation ?",
      "Le « craquement » articulaire : d'où vient-il ?",
      "Mal de dos au travail : les bons réflexes",
    ],
    ads: "Sur une recherche locale et fréquente, **Google Ads** peut amener des rendez-vous rapidement, le temps que le référencement naturel s'installe. Restez descriptif dans les annonces, et jugez-les au coût d'un nouveau patient.",
    faq: [
      { q: "Faut-il écrire « chiropracteur » ou « chiropraticien » ?", a: "Les deux : vos patients tapent l'un et l'autre. Employez le titre officiel dans vos titres, et l'autre forme dans le texte." },
      { q: "Une page « chiropraxie ou ostéopathie » ne risque-t-elle pas de me desservir ?", a: "Au contraire : c'est l'une des recherches les plus fréquentes autour de votre métier. Y répondre posément, sans dénigrer, vous amène des personnes qui hésitent encore." },
      { q: "Puis-je garder mon agenda en ligne ?", a: "Oui. Le bouton de rendez-vous de votre site y mène directement : le site vous fait trouver, l'agenda vous fait réserver." },
    ],
  },
  {
    slug: "kinesitherapeute",
    name: "kinésithérapeute",
    plural: "kinésithérapeutes",
    of: "de kinésithérapeute",
    a: "un kinésithérapeute",
    family: "sante",
    ordered: true,
    description: "Un site de kinésithérapeute conforme à votre déontologie : spécialités, équipe, accès, prise de rendez-vous. Démo gratuite.",
    hook: "Vos patients viennent sur prescription, mais **choisissent leur cabinet sur Google**. Votre site doit dire vos spécialités et vos disponibilités, **dans le cadre de votre déontologie**.",
    search: {
      intro: "L'ordonnance en main, on cherche le cabinet le plus proche qui fait ce dont on a besoin.",
      points: [
        "**« Kiné + ville ou quartier »**, « kinésithérapeute près de moi », « kiné à domicile ».",
        "**Par spécialité** : « kiné du sport », « rééducation périnéale », « kiné vestibulaire », « kiné respiratoire », « kiné épaule ».",
        "**Par disponibilité** : « kiné qui prend de nouveaux patients ». Le dire sur votre site vous épargne bien des appels.",
      ],
    },
    pages: {
      intro: "Vos spécialités sont votre meilleur référencement : une page chacune.",
      items: [
        "Une page par spécialité : **sport**, **respiratoire**, **périnéale**, **vestibulaire**, **pédiatrique**.",
        "Une page **équipe** : chaque praticien, sa formation, ses domaines.",
        "Une page **plateau technique** : salle de rééducation, balnéothérapie, équipements.",
        "Une page **infos pratiques** : ordonnance, carte Vitale, prise en charge, soins à domicile.",
        "Une page **accès et stationnement**, essentielle pour des patients à mobilité réduite.",
      ],
    },
    local: {
      intro: "Votre fiche Google sert d'abord à être trouvé et joint.",
      items: [
        "Catégorie **« Kinésithérapeute »**, horaires exacts, téléphone et lien de rendez-vous.",
        "Des photos du cabinet, du plateau technique et de l'accès.",
        "Vos spécialités listées dans les services.",
      ],
    },
    frame: orderedFrame("des confrères", "patients"),
    topics: [
      "Kiné du sport : reprendre après une blessure",
      "Rééducation après une entorse : les étapes",
      "Rééducation périnéale : à qui s'adresse-t-elle ?",
      "Combien de séances sont prescrites, et pourquoi",
      "Préparer sa première séance de kinésithérapie",
    ],
    ads: ORDERED_ADS,
    faq: [
      ...orderedFaq("patients"),
      { q: "Mon agenda est plein : à quoi sert un site ?", a: "À dire si vous prenez de nouveaux patients, à orienter vers la bonne spécialité et à répondre aux questions pratiques. Ce sont autant d'appels en moins pour le cabinet." },
    ],
  },
  {
    slug: "sage-femme",
    name: "sage-femme",
    plural: "sages-femmes",
    of: "de sage-femme",
    a: "une sage-femme",
    family: "sante",
    ordered: true,
    description: "Un site de sage-femme conforme à votre déontologie : suivi, préparation, rééducation, infos pratiques, rendez-vous. Démo gratuite.",
    hook: "On vous cherche à un moment où l'on a mille questions. Votre site doit **dire tout ce que vous proposez** et répondre aux questions pratiques, **dans le cadre de votre déontologie**.",
    search: {
      intro: "Beaucoup ignorent l'étendue de votre métier : la recherche part souvent d'un besoin précis.",
      points: [
        "**« Sage-femme + ville »**, « sage-femme libérale près de moi », « sage-femme à domicile ».",
        "**Par besoin** : « préparation à l'accouchement », « rééducation du périnée », « suivi gynécologique sage-femme », « consultation allaitement ».",
        "**Par moment** : « suivi de grossesse sage-femme », « retour de maternité », « visite à domicile après accouchement ».",
      ],
    },
    pages: {
      intro: "Une page par accompagnement : c'est ainsi que l'on découvre tout ce qu'une sage-femme peut faire.",
      items: [
        "Une page **suivi de grossesse** et une page **préparation à la naissance**, avec vos méthodes.",
        "Une page **après la naissance** : visites à domicile, allaitement, rééducation périnéale.",
        "Une page **suivi gynécologique de prévention** et contraception.",
        "Une page **infos pratiques** : carte Vitale, prise en charge, documents à apporter.",
        "Une page **cabinet et équipe**, avec l'accès en poussette.",
      ],
    },
    local: {
      intro: "Votre fiche Google doit rendre le premier contact facile.",
      items: [
        "Catégorie **« Sage-femme »**, horaires, téléphone et lien de rendez-vous.",
        "Vos consultations listées dans les services, avec les mots que l'on tape.",
        "Votre zone de visites à domicile.",
      ],
    },
    frame: orderedFrame("des consœurs ou des confrères", "patientes"),
    topics: [
      "Quand prendre son premier rendez-vous de suivi de grossesse",
      "Préparation à la naissance : les différentes méthodes",
      "Rééducation du périnée : quand commencer",
      "Le suivi gynécologique par une sage-femme : pour qui ?",
      "Retour à la maison : comment se passent les visites",
    ],
    ads: ORDERED_ADS,
    faq: [
      ...orderedFaq("patientes"),
      { q: "Faut-il une page par type de consultation ?", a: "Oui. Beaucoup de femmes ignorent qu'une sage-femme assure aussi le suivi gynécologique de prévention : une page dédiée le leur apprend, et se place sur cette recherche." },
    ],
  },
  {
    slug: "orthophoniste",
    name: "orthophoniste",
    plural: "orthophonistes",
    of: "d'orthophoniste",
    a: "un orthophoniste",
    family: "sante",
    description: "Un site d'orthophoniste qui informe les familles et allège votre téléphone : domaines, bilan, délais, prise de contact. Démo gratuite.",
    hook: "Votre agenda est sans doute plein. Votre site ne sert pas à chercher des patients : il sert à **informer les familles**, expliquer les démarches et **alléger votre téléphone**.",
    search: {
      intro: "Les parents cherchent une solution proche, et ce qu'il faut faire en attendant.",
      points: [
        "**« Orthophoniste + ville »**, « orthophoniste près de moi », « orthophoniste qui prend de nouveaux patients ».",
        "**Par difficulté** : « retard de langage », « dyslexie », « bégaiement », « rééducation de la voix ».",
        "**Par démarche** : « faut-il une ordonnance pour l'orthophoniste », « bilan orthophonique comment ça se passe ».",
      ],
    },
    pages: {
      intro: "Chaque question à laquelle le site répond est un appel de moins.",
      items: [
        "Une page **domaines d'intervention** : langage oral, langage écrit, voix, déglutition, troubles neurologiques.",
        "Une page **« Le bilan orthophonique »** : prescription, déroulé, durée, compte rendu.",
        "Une page **prise de contact et liste d'attente** : comment s'inscrire, et que faire en attendant.",
        "Une page **infos pratiques** : prise en charge, documents à apporter, absences.",
        "Une page **équipe**, avec les domaines de chacun.",
      ],
    },
    local: {
      intro: "Une fiche Google à jour évite bien des déplacements inutiles.",
      items: [
        "Catégorie **« Orthophoniste »**, horaires d'accueil téléphonique, adresse exacte.",
        "Une mention claire si vous ne prenez plus de nouveaux patients pour le moment.",
        "Des photos de l'entrée et de la salle d'attente.",
      ],
    },
    frame: {
      intro: "L'orthophonie est une **profession de santé réglementée** : votre communication reste informative.",
      items: [
        "Présentez vos domaines et votre formation, sans promesse de résultat ni durée de prise en charge garantie.",
        "Rappelez que le bilan se fait sur prescription médicale.",
        "Aucune information sur un patient, jamais : ni récit, ni photo, ni travail d'enfant.",
      ],
    },
    topics: [
      "À quel âge s'inquiéter d'un retard de langage ?",
      "Comment se passe un bilan orthophonique ?",
      "Dyslexie : les signes qui doivent alerter",
      "En attendant une place : ce que les parents peuvent faire",
      "Bégaiement de l'enfant : faut-il consulter tôt ?",
    ],
    ads: "La demande dépasse le plus souvent l'offre : **la publicité n'a pas de sens** pour un cabinet d'orthophonie. Un site clair et une fiche Google à jour suffisent.",
    faq: [
      { q: "Mon cabinet est complet : pourquoi un site ?", a: "Pour que les familles trouvent seules les réponses : démarches, liste d'attente, que faire en attendant. Votre téléphone sonne moins, et l'information est la même pour tous." },
      { q: "Comment présenter ma liste d'attente ?", a: "En écrivant la règle : comment s'inscrire, par quel moyen, et ce que vous pouvez dire des délais. Une règle écrite évite les appels de relance." },
      { q: "Faut-il un blog ?", a: "Il rend service : les parents tapent leurs inquiétudes dans Google. Des articles simples sur le langage, la lecture ou la voix leur répondent, et font de votre cabinet une référence locale." },
    ],
  },
  {
    slug: "psychomotricien",
    name: "psychomotricien",
    plural: "psychomotriciens",
    of: "de psychomotricien",
    a: "un psychomotricien",
    family: "sante",
    description: "Un site de psychomotricien qui explique votre métier aux familles : bilan, séances, publics, infos pratiques. Démo gratuite.",
    hook: "Beaucoup de parents découvrent votre métier le jour où on le leur conseille. Votre site doit **l'expliquer simplement** et dire **comment se passe un bilan**.",
    search: {
      intro: "La recherche vient souvent après un conseil : l'école, le pédiatre, un autre professionnel.",
      points: [
        "**« Psychomotricien + ville »**, « psychomotricienne près de moi », « bilan psychomoteur ».",
        "**Par difficulté** : « enfant maladroit », « difficultés d'écriture », « dyspraxie », « retard moteur ».",
        "**Par public** : « psychomotricité bébé », « psychomotricité adulte », « psychomotricité personne âgée ».",
      ],
    },
    pages: {
      intro: "Expliquez d'abord le métier : c'est la question que tout le monde se pose.",
      items: [
        "Une page **« Qu'est-ce que la psychomotricité »**, sans jargon.",
        "Une page **« Le bilan psychomoteur »** : déroulé, durée, compte rendu, tarif.",
        "Une page par public : **tout-petits**, **enfants et adolescents**, **adultes**, **personnes âgées**.",
        "Une page **tarifs et aides** : ce qui peut être pris en charge, et par qui.",
        "Une page **cabinet**, avec des photos de la salle et du matériel.",
      ],
    },
    local: {
      intro: "La salle de psychomotricité se montre : elle rassure parents et enfants.",
      items: [
        "La catégorie de votre métier, des horaires et des moyens de contact à jour.",
        "Des photos de la salle et du matériel.",
        "Une description qui reprend les difficultés telles que les parents les décrivent.",
      ],
    },
    frame: {
      intro: "Le métier de psychomotricien est **réglementé** et s'exerce sur prescription médicale : restez informatif.",
      items: [
        "Affichez votre diplôme d'État et votre numéro d'enregistrement.",
        "Pas de promesse de résultat ni de durée de suivi garantie.",
        "Soyez précis sur le coût : en libéral, les séances ne sont en général pas remboursées par l'Assurance maladie, hors dispositifs particuliers. Dites-le clairement.",
      ],
    },
    topics: [
      "Mon enfant est maladroit : faut-il consulter ?",
      "Comment se passe un bilan psychomoteur ?",
      "Psychomotricien, ergothérapeute, kinésithérapeute : qui fait quoi ?",
      "Difficultés d'écriture : ce que la psychomotricité peut travailler",
      "La psychomotricité auprès des personnes âgées",
    ],
    ads: "Vous êtes le plus souvent recommandé par un médecin, une école ou un autre professionnel : **la publicité est rarement utile**. Un site qui explique le métier et une fiche Google complète font l'essentiel.",
    faq: [
      { q: "Les parents ne connaissent pas mon métier : comment l'expliquer ?", a: "Avec une page courte, des exemples concrets et les mots qu'ils emploient : « maladroit », « n'arrive pas à écrire », « ne tient pas en place ». C'est la page la plus lue de votre site." },
      { q: "Dois-je afficher mes tarifs ?", a: "Oui, avec ce qui peut être pris en charge. Le coût est une vraie question pour les familles : mieux vaut y répondre avant le premier appel." },
      { q: "Puis-je montrer des photos de séances ?", a: "Montrez la salle et le matériel, pas les enfants. Aucune image d'un patient sans l'accord écrit de ses parents, et la prudence même avec cet accord." },
    ],
  },
  {
    slug: "dieteticien-nutritionniste",
    name: "diététicien-nutritionniste",
    plural: "diététiciens-nutritionnistes",
    of: "de diététicien-nutritionniste",
    a: "un diététicien-nutritionniste",
    family: "sante",
    description: "Un site de diététicien-nutritionniste qui présente vos consultations et vos suivis, en cabinet ou en visio. Démo gratuite.",
    hook: "Régimes miracles et conseils contradictoires : votre site doit **faire entendre une voix sérieuse**, dire comment se passe un suivi et **mener au premier rendez-vous**.",
    search: {
      intro: "On cherche rarement « un diététicien » : on cherche de l'aide pour un objectif.",
      points: [
        "**« Diététicien + ville »**, « nutritionniste près de moi », « diététicienne en visio » : les deux mots sont tapés indifféremment.",
        "**Par objectif** : « rééquilibrage alimentaire », « perdre du poids sans régime », « nutrition sportive », « alimentation grossesse ».",
        "**Par situation de santé** : « diététicien diabète », « alimentation cholestérol », « troubles digestifs alimentation ».",
      ],
    },
    pages: {
      intro: "Une page par accompagnement, avec ce qui se passe concrètement.",
      items: [
        "Une page par accompagnement : **rééquilibrage alimentaire**, **nutrition du sportif**, **grossesse et enfant**, **pathologies**.",
        "Une page **« Première consultation et suivi »** : durée, bilan, rythme des rendez-vous.",
        "Une page **téléconsultation**, si vous en proposez.",
        "Une page **tarifs et prise en charge** par les mutuelles.",
        "Une page **ateliers et interventions**, en entreprise ou en structure.",
      ],
    },
    local: {
      intro: "La carte Google compte, même si vous suivez aussi à distance.",
      items: [
        "Catégorie **« Diététicien »** ou « Nutritionniste », horaires, lien de rendez-vous.",
        "La mention des consultations en visio.",
        "Des avis demandés en fin de suivi, sans insister.",
      ],
    },
    frame: {
      intro: "Le titre de diététicien est **protégé** : c'est votre meilleur argument face aux conseils non qualifiés.",
      items: [
        "Affichez votre diplôme et votre numéro d'enregistrement.",
        "Pas de perte de poids promise, pas de photos « avant / après », pas de délai garanti.",
        "Pour une pathologie, rappelez que le suivi se fait en lien avec le médecin.",
      ],
    },
    topics: [
      "Diététicien ou nutritionniste : quelle différence ?",
      "Comment se passe une première consultation ?",
      "Rééquilibrage alimentaire : par où commencer",
      "Bien manger quand on fait du sport",
      "Les consultations sont-elles remboursées ?",
    ],
    ads: "**Instagram** fonctionne bien pour des conseils courts et des idées de repas, et une annonce locale peut faire connaître vos consultations. Les régies refusent les promesses de perte de poids : restez descriptif.",
    faq: [
      { q: "Dois-je me présenter comme diététicien ou comme nutritionniste ?", a: "Employez votre titre exact, et utilisez aussi l'autre mot dans vos textes : beaucoup de personnes tapent « nutritionniste » en cherchant un diététicien." },
      { q: "Puis-je publier des résultats de patients ?", a: "Mieux vaut l'éviter : un chiffre ou une photo « avant / après » promet un résultat et expose une personne. Décrivez plutôt votre méthode et le déroulé d'un suivi." },
      { q: "Je consulte surtout en visio : faut-il un site local ?", a: "Oui. Beaucoup préfèrent un professionnel de leur région, même à distance, et la fiche Google reste la première porte d'entrée." },
    ],
  },
  {
    slug: "podologue",
    name: "podologue",
    plural: "podologues",
    of: "de podologue",
    a: "un podologue",
    family: "sante",
    ordered: true,
    description: "Un site de podologue conforme à votre déontologie : soins, semelles, bilans, infos pratiques et rendez-vous. Démo gratuite.",
    hook: "Soins, semelles, bilans : on ne sait pas toujours tout ce que vous faites. Votre site doit **le dire clairement** et apparaître près de chez vous, **dans le cadre de votre déontologie**.",
    search: {
      intro: "La recherche est locale, et part d'une gêne précise.",
      points: [
        "**« Podologue + ville »**, « pédicure-podologue près de moi », « podologue à domicile ».",
        "**Par besoin** : « semelles orthopédiques », « ongle incarné », « podologue du sport », « douleur au talon ».",
        "**Par public** : « podologue enfant », « podologue coureur », « soin des pieds diabétique ».",
      ],
    },
    pages: {
      intro: "Chaque activité de votre cabinet mérite sa page : c'est ainsi que l'on vous trouve.",
      items: [
        "Une page **soins de pédicurie** et une page **semelles orthopédiques**, avec le déroulé.",
        "Une page **bilan podologique** : examen, analyse de la marche, durée.",
        "Une page par public : **sportifs**, **enfants**, **personnes diabétiques**, **seniors**.",
        "Une page **infos pratiques** : prescription, prise en charge, délai de fabrication des semelles.",
        "Une page **cabinet et soins à domicile**, avec la zone desservie.",
      ],
    },
    local: {
      intro: "Votre fiche Google fait l'essentiel du travail local.",
      items: [
        "Catégorie **« Podologue »**, horaires exacts, téléphone et lien de rendez-vous.",
        "Vos soins et vos bilans listés dans les services.",
        "Des photos du cabinet et de l'accès, utiles aux personnes à mobilité réduite.",
      ],
    },
    frame: orderedFrame("des confrères", "patients"),
    topics: [
      "Quand consulter un podologue pour un enfant",
      "Semelles orthopédiques : comment sont-elles conçues ?",
      "Coureurs : à quoi sert un bilan podologique",
      "Pied et diabète : pourquoi un suivi régulier",
      "Ongle incarné : que faire, et quand consulter",
    ],
    ads: ORDERED_ADS,
    faq: [
      ...orderedFaq("patients"),
      { q: "Faut-il une page sur les semelles ?", a: "Oui : « semelles orthopédiques » suivi d'une ville est l'une des recherches les plus fréquentes autour de votre métier. Une page qui explique le bilan, la fabrication et la prise en charge y répond." },
    ],
  },
];
