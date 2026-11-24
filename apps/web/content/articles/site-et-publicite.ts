import type { Article } from "../blog";

export const pagesSite: Article = {
  slug: "pages-site-therapeute",
  category: "site-internet",
  title: "Les pages qu'un site de thérapeute doit avoir (et celles qu'on peut oublier)",
  description: "Accueil, pages par motif, déroulé d'une séance, tarifs, contact : les pages utiles d'un site de cabinet, et ce qu'on y écrit.",
  excerpt: "Un site de cabinet n'a pas besoin de vingt pages. Il lui en faut six ou sept, chacune écrite pour répondre à une question que se pose quelqu'un qui hésite à prendre rendez-vous.",
  published: "2026-11-24",
  intro: [
    "Quelqu'un arrive sur votre site avec quatre questions : **est-ce pour moi, comment ça se passe, combien ça coûte, comment je prends rendez-vous**. Chaque page utile répond à l'une d'elles.",
    "Voici les pages à prévoir, dans l'ordre où elles servent.",
  ],
  sections: [
    {
      title: "L'accueil : dire l'essentiel en dix secondes",
      blocks: [
        "En haut de page, trois informations : ce que vous faites, pour qui, et où. Juste dessous, un bouton pour prendre rendez-vous.",
        "L'accueil n'a pas à tout raconter. Il oriente : vers vos accompagnements, vers le déroulé d'une séance, vers vos tarifs.",
      ],
    },
    {
      title: "Une page par motif ou par public",
      blocks: [
        "C'est la partie la plus rentable du site, et la plus souvent absente. Une page « stress », une page « sommeil », une page « femmes enceintes » : chacune se place sur sa propre recherche.",
        {
          list: [
            "Le besoin, décrit avec les mots de la personne.",
            "Ce que vous proposez, concrètement.",
            "Le déroulé et le nombre de séances habituel.",
            "Ce qui relève d'un autre professionnel.",
          ],
        },
        "Trois ou quatre pages suffisent pour commencer : vos accompagnements les plus fréquents.",
      ],
    },
    {
      title: "« Comment se passe une séance »",
      blocks: [
        "La page que tout le monde lit avant d'appeler. Durée, lieu, tenue, ce que l'on fait, ce que l'on ressent, ce qui se passe ensuite.",
        "Plus elle est concrète, moins vous aurez à l'expliquer au téléphone — et plus les personnes inquiètes oseront venir.",
      ],
    },
    {
      title: "Qui vous êtes",
      blocks: [
        "On choisit une personne. Un portrait, votre parcours en quelques lignes, votre formation, ce qui vous a mené à ce métier.",
        "Restez simple : trois paragraphes et une vraie photo valent mieux qu'une liste de certificats.",
      ],
    },
    {
      title: "Tarifs et informations pratiques",
      blocks: [
        "Le prix est la question que l'on n'ose pas poser. Affichez-le, avec la durée de la séance, les moyens de paiement et, s'il y a lieu, ce que prennent en charge certaines mutuelles.",
        "Ajoutez l'accès : adresse, stationnement, transports, étage, accessibilité.",
      ],
    },
    {
      title: "Contact et prise de rendez-vous",
      blocks: [
        "Un seul chemin, visible partout : le bouton de rendez-vous, en haut de chaque page. Téléphone cliquable, lien vers votre agenda en ligne si vous en avez un, formulaire court sinon.",
        { note: "Si votre site collecte des coordonnées, il doit afficher des mentions légales et une politique de confidentialité. Ce sont des pages obligatoires, pas des options." },
      ],
    },
    {
      title: "Ce que l'on peut oublier",
      blocks: [
        {
          list: [
            "La page **« Actualités »** que personne ne met à jour : un blog tenu, ou rien.",
            "La page **« Liens utiles »** : elle envoie vos visiteurs ailleurs.",
            "Le **livre d'or** maison : vos avis Google, affichés sur le site, sont plus crédibles.",
            "Les longues pages sur l'histoire de la discipline : une phrase suffit, le reste est dans les encyclopédies.",
          ],
        },
      ],
    },
  ],
  faq: [
    { q: "Combien de pages faut-il au minimum ?", a: "Cinq suffisent pour démarrer : accueil, une page d'accompagnement, déroulé d'une séance, tarifs, contact. Les pages par motif s'ajoutent ensuite, une à une." },
    { q: "Faut-il un blog dès le départ ?", a: "Non. Mieux vaut un site court et complet qu'un blog vide. Le blog vient quand les pages principales sont en place." },
    { q: "Qui écrit les textes ?", a: "Vous connaissez votre pratique mieux que personne, mais l'écriture prend du temps. Avec Harmony, les textes de votre site sont préparés à partir de votre activité et de votre ville, puis vous les ajustez en quelques clics." },
  ],
  related: ["combien-coute-site-internet-therapeute", "referencement-local-therapeute", "quoi-ecrire-blog-cabinet"],
};

export const coutSite: Article = {
  slug: "combien-coute-site-internet-therapeute",
  category: "site-internet",
  title: "Combien coûte un site internet de thérapeute : ce que l'on paie vraiment",
  description: "Le faire soi-même, passer par un indépendant, une agence ou une solution par abonnement : ce que comprend chaque prix, et ce qu'il oublie.",
  excerpt: "Entre le site « gratuit » et le devis à plusieurs milliers d'euros, l'écart déroute. Il s'explique : ces prix n'achètent pas la même chose. Voici comment les comparer.",
  published: "2026-11-24",
  intro: [
    "Un site de cabinet peut coûter presque rien ou plusieurs milliers d'euros. Les deux prix sont honnêtes : ils ne couvrent simplement pas le même travail.",
    "Pour comparer, regardez **ce qui est compris** plutôt que le montant. Six postes font le coût réel d'un site.",
  ],
  sections: [
    {
      title: "Les six postes d'un site",
      blocks: [
        {
          list: [
            "**La création** : mise en page, structure, adaptation au téléphone.",
            "**Les textes et les photos** : souvent le poste oublié, et le plus long.",
            "**Le nom de domaine et l'hébergement** : une dépense annuelle, modeste mais sans fin.",
            "**La maintenance** : mises à jour, sécurité, sauvegardes.",
            "**Le référencement** : pages par motif, fiche Google, contenus réguliers.",
            "**Votre temps** : chaque heure passée sur le site est une heure hors du cabinet.",
          ],
          ordered: true,
        },
        "Un devis qui ne parle que du premier poste n'est pas moins cher : il vous laisse les cinq autres.",
      ],
    },
    {
      title: "Le faire soi-même",
      blocks: [
        "Les outils de création en ligne coûtent quelques dizaines d'euros par mois, et permettent un résultat propre. Tout le reste vous revient : structure, textes, référencement, mises à jour.",
        "C'est un bon choix si vous aimez cela et si vous avez du temps. C'est un mauvais calcul si le site reste inachevé pendant six mois.",
      ],
    },
    {
      title: "Passer par un indépendant",
      blocks: [
        "Un créateur indépendant facture un site vitrine de quelques centaines à quelques milliers d'euros, selon le nombre de pages et ce qu'il prend en charge. Le résultat est personnalisé.",
        "Demandez ce qui se passe ensuite : qui met à jour le site, à quel prix, et si les textes sont compris. Vérifiez aussi que le site et le nom de domaine sont bien à votre nom.",
      ],
    },
    {
      title: "Passer par une agence",
      blocks: [
        "Une agence apporte une équipe : graphiste, rédacteur, référenceur. Le budget monte en conséquence, souvent à plusieurs milliers d'euros, avec parfois un forfait mensuel de suivi.",
        "Pertinent pour un cabinet à plusieurs praticiens ou un centre. Souvent surdimensionné pour un praticien seul.",
      ],
    },
    {
      title: "Une solution spécialisée, par abonnement",
      blocks: [
        "Ici, on ne paie pas la création mais le service : le site, son hébergement, sa maintenance et ce qui le fait vivre sont compris dans une mensualité. Le coût de départ est faible, l'engagement dure.",
        "C'est le modèle de Harmony : site créé pour votre pratique et votre ville, nom de domaine et hébergement inclus, articles de blog rédigés pour vous. Les prix sont publics : [voir les tarifs](/#tarifs).",
        { note: "Avant de signer un abonnement, quel qu'il soit, posez trois questions : la durée d'engagement, ce que devient le site si vous arrêtez, et à qui appartient le nom de domaine." },
      ],
    },
    {
      title: "Comment savoir si c'est rentable",
      blocks: [
        "Rapportez le coût mensuel au prix d'une séance. Si le site vous amène deux ou trois nouveaux patients par mois, et que chacun revient quelques fois, le calcul est vite fait.",
        "Notre [simulateur de rentabilité](/#simulateur) le fait avec vos propres chiffres : tarif, nouveaux patients, séances par patient. Il ne promet rien ; il vous montre le seuil à partir duquel le site se paie.",
      ],
    },
  ],
  faq: [
    { q: "Un site gratuit, est-ce une bonne idée ?", a: "Pour tester, oui. Pour un cabinet, les limites arrivent vite : adresse au nom de la plateforme, publicités, peu de maîtrise du référencement. Un nom de domaine à vous est la première dépense utile." },
    { q: "Que coûte un site une fois en ligne ?", a: "Au minimum le nom de domaine et l'hébergement, chaque année. S'y ajoutent les mises à jour et les contenus, que vous faites vous-même, que vous payez à la demande, ou qui sont compris dans un abonnement." },
    { q: "Le référencement est-il compris dans le prix d'un site ?", a: "Rarement. Un site « optimisé » a une structure correcte ; cela ne remplace ni la fiche Google, ni les pages par motif, ni les articles. Demandez toujours ce que le mot recouvre." },
  ],
  related: ["pages-site-therapeute", "referencement-local-therapeute", "google-ads-therapeute"],
};

export const reseauxSociaux: Article = {
  slug: "instagram-facebook-therapeute",
  category: "reseaux-sociaux-et-publicite",
  title: "Instagram et Facebook : quoi publier quand on est thérapeute",
  description: "Les formats qui marchent pour un cabinet, un rythme tenable, et les limites à respecter quand on parle de bien-être et de santé.",
  excerpt: "Les réseaux sociaux ne remplissent pas un agenda à eux seuls. Bien utilisés, ils font ce que le référencement ne fait pas : montrer qui vous êtes, avant même la première séance.",
  published: "2026-11-24",
  intro: [
    "On ne cherche pas un thérapeute sur Instagram comme on le cherche sur Google. On y **vérifie** : qui est cette personne, comment parle-t-elle, son cabinet a-t-il l'air accueillant ?",
    "Vos publications servent donc moins à vous faire découvrir qu'à rassurer ceux qui vous ont déjà trouvé. Cela change ce qu'il faut publier.",
  ],
  sections: [
    {
      title: "Choisir un réseau, pas quatre",
      blocks: [
        "Mieux vaut un compte tenu qu'une présence partout et nulle part. **Instagram** convient aux pratiques qui se montrent et à un public plutôt jeune ; **Facebook** reste le réseau des groupes locaux et d'un public plus large.",
        "Choisissez celui où sont déjà vos patients. Vous pourrez toujours reprendre les mêmes contenus sur le second.",
      ],
    },
    {
      title: "Les cinq formats qui servent un cabinet",
      blocks: [
        {
          list: [
            "**Le conseil court** : un exercice, un geste, une habitude, en trois étapes.",
            "**La question fréquente** : « combien de séances ? », avec votre réponse honnête.",
            "**Les coulisses** : le cabinet, la préparation d'un atelier, une formation suivie.",
            "**L'idée reçue** : ce que votre pratique fait, et ce qu'elle ne fait pas.",
            "**L'information pratique** : un créneau qui s'ouvre, un atelier, des congés.",
          ],
          ordered: true,
        },
        "Alternez-les : un fil qui ne fait que de la promotion se lit comme une publicité, un fil qui ne parle jamais du cabinet n'amène personne.",
      ],
    },
    {
      title: "Un rythme que vous tiendrez",
      blocks: [
        "Deux publications par semaine suffisent. Le piège, c'est de publier tous les jours pendant un mois, puis plus rien.",
        "Préparez le mois d'un coup : une heure pour choisir les sujets, une autre pour les visuels et les légendes. Ensuite, il ne reste qu'à poster.",
        { note: "Avec la formule Scale de Harmony, vos publications du mois sont préparées pour vous — visuels, carrousels, stories, légendes. Vous les téléchargez et vous les postez depuis vos comptes : rien n'est publié à votre place." },
      ],
    },
    {
      title: "Les limites à respecter",
      blocks: [
        {
          list: [
            "**Aucune promesse de résultat**, aucun « avant / après ».",
            "**Aucun diagnostic en commentaire ou en message privé** : proposez un rendez-vous.",
            "**Aucune photo ni témoignage d'un patient** sans son accord écrit — et, même avec, la prudence s'impose.",
            "**Rappelez ce qui relève du médecin** chaque fois que le sujet touche à la santé.",
          ],
        },
        "Si votre profession a un ordre ou un code de déontologie, ses règles sur la communication s'appliquent aussi à vos réseaux.",
      ],
    },
    {
      title: "Relier vos réseaux au reste",
      blocks: [
        "Le lien de votre profil doit mener à la prise de rendez-vous ou à votre site, pas à une page d'accueil générale. Reprenez dans votre biographie votre métier et votre ville : c'est ce que l'on cherche.",
        "Enfin, mesurez ce qui compte : non pas les mentions « j'aime », mais les visites du site et les prises de contact venues des réseaux.",
      ],
    },
  ],
  faq: [
    { q: "Faut-il se montrer en vidéo ?", a: "Ce n'est pas obligatoire. Des visuels soignés et des textes clairs font déjà beaucoup. Si vous êtes à l'aise, une courte vidéo où vous répondez à une question crée un vrai lien." },
    { q: "Les réseaux sociaux remplacent-ils un site ?", a: "Non. Un compte ne vous appartient pas, n'apparaît pas sur les recherches locales de Google et ne se lit pas comme un site. Les réseaux rassurent ; le site et la fiche Google font trouver." },
    { q: "Faut-il payer pour être vu ?", a: "Pas pour commencer. La publicité sur Facebook et Instagram devient utile pour une occasion précise : un atelier, une ouverture, une offre de découverte." },
  ],
  related: ["quoi-ecrire-blog-cabinet", "google-ads-therapeute", "obtenir-avis-google-therapeute"],
};

export const googleAds: Article = {
  slug: "google-ads-therapeute",
  category: "reseaux-sociaux-et-publicite",
  title: "Google Ads pour un cabinet : dans quels cas cela vaut le coup",
  description: "Comment fonctionne la publicité sur Google pour un thérapeute, ce qu'il faut avoir en place avant, et comment juger si elle est rentable.",
  excerpt: "La publicité Google peut amener des rendez-vous en quelques jours — ou vider un budget sans rien produire. La différence tient à trois conditions, à vérifier avant de dépenser un euro.",
  published: "2026-11-24",
  intro: [
    "Google Ads affiche votre annonce au-dessus des résultats, pour les recherches que vous choisissez. Vous payez quand quelqu'un clique, pas quand l'annonce s'affiche.",
    "C'est le moyen le plus rapide d'être visible. Ce n'est pas toujours le plus rentable. Voici comment trancher.",
  ],
  sections: [
    {
      title: "Trois conditions avant de commencer",
      blocks: [
        {
          list: [
            "**Des gens cherchent ce que vous proposez, dans votre ville.** Sans recherches, pas de clics : la publicité ne crée pas la demande.",
            "**Une page d'arrivée précise.** Une annonce « arrêt du tabac » doit mener à votre page « arrêt du tabac », avec un bouton de rendez-vous — pas à votre accueil.",
            "**De la place dans l'agenda.** Payer des clics pour annoncer trois semaines d'attente n'a pas de sens.",
          ],
          ordered: true,
        },
        "S'il en manque une, commencez par là. La publicité amplifie un site qui convertit ; elle ne répare pas un site qui ne convertit pas.",
      ],
    },
    {
      title: "Choisir ses mots-clés",
      blocks: [
        "Visez des recherches qui disent une intention : le métier ou le besoin, suivi de la ville. « Sophrologue Albi », « hypnose arrêt tabac Albi ».",
        "Écartez les recherches d'information — « qu'est-ce que la sophrologie », « formation sophrologue » — avec des mots-clés à exclure. Ce sont des clics payés pour des personnes qui ne cherchent pas un rendez-vous.",
      ],
    },
    {
      title: "Fixer un budget, et s'y tenir",
      blocks: [
        "Vous fixez un montant par jour ; Google ne le dépasse pas sur le mois. Le prix d'un clic dépend de la concurrence dans votre ville et votre métier : il varie beaucoup d'un cabinet à l'autre.",
        "Commencez petit, sur une seule campagne et une zone resserrée autour du cabinet. Laissez tourner trois à quatre semaines avant de juger : les premiers jours ne disent rien.",
      ],
    },
    {
      title: "Ce que Google n'accepte pas",
      blocks: [
        "Les annonces liées à la santé sont encadrées. Une annonce descriptive passe ; une promesse de guérison, une allégation médicale ou un ciblage fondé sur l'état de santé sont refusés.",
        "Écrivez ce que vous proposez, où, et comment réserver. C'est aussi ce qui convertit le mieux.",
      ],
    },
    {
      title: "Juger la rentabilité",
      blocks: [
        "Ne regardez ni les clics ni les impressions. Une seule question : **combien coûte un nouveau patient venu de la publicité ?**",
        "Divisez la dépense du mois par le nombre de rendez-vous qu'elle a amenés. Comparez à ce qu'un patient représente pour vous, en comptant les séances suivantes. Si le compte est bon, continuez ; sinon, corrigez ou arrêtez.",
        { note: "Cela suppose de savoir d'où viennent vos rendez-vous. Sans suivi des clics sur la prise de rendez-vous, on pilote à l'aveugle." },
      ],
    },
    {
      title: "Publicité ou référencement ?",
      blocks: [
        "Les deux ne s'opposent pas. La publicité apporte des visites tout de suite et s'arrête avec le budget ; le [référencement local](/blog/referencement-local-therapeute) met quelques mois à s'installer et continue ensuite.",
        "Beaucoup de cabinets utilisent la publicité au lancement, le temps que le reste prenne le relais. Avec la formule Scale, Harmony établit un diagnostic chiffré, propose les mots-clés à viser et un plan d'action ; vous réglez votre compte Google Ads, et le budget est payé à Google.",
      ],
    },
  ],
  faq: [
    { q: "Quel budget prévoir pour commencer ?", a: "Un budget modeste et stable vaut mieux qu'un gros budget sur une semaine. Le bon montant dépend du prix des clics dans votre ville : c'est le diagnostic de départ qui le dit." },
    { q: "Puis-je gérer Google Ads seul ?", a: "Oui, avec un peu de méthode : une campagne, peu de mots-clés, une page d'arrivée précise, un suivi mensuel. Le plus difficile est de résister aux réglages automatiques qui élargissent la diffusion." },
    { q: "Et la publicité sur Facebook et Instagram ?", a: "Elle fonctionne autrement : on ne répond pas à une recherche, on se montre à un public. Elle convient pour faire connaître un atelier ou une offre de découverte, moins pour un besoin urgent." },
  ],
  related: ["referencement-local-therapeute", "instagram-facebook-therapeute", "agenda-qui-ne-se-remplit-pas"],
};

export const agenda: Article = {
  slug: "agenda-qui-ne-se-remplit-pas",
  category: "developper-sa-patientele",
  title: "Agenda clairsemé : cinq vérifications avant de dépenser en publicité",
  description: "Visibilité, clarté du site, prise de rendez-vous, avis, bouche-à-oreille : comment trouver où se perdent les demandes d'un cabinet.",
  excerpt: "Quand l'agenda reste vide, le réflexe est de vouloir « plus de visibilité ». Souvent, le problème est ailleurs : des gens vous trouvent, mais quelque chose les arrête avant le rendez-vous.",
  published: "2026-11-24",
  intro: [
    "Un rendez-vous est le bout d'une chaîne : on vous cherche, on vous trouve, on vous lit, on vous fait confiance, on réserve. **Un seul maillon faible suffit à tout arrêter.**",
    "Avant d'ajouter du trafic, cherchez le maillon. Cinq vérifications, dans l'ordre.",
  ],
  sections: [
    {
      title: "1. Vous trouve-t-on ?",
      blocks: [
        "Ouvrez une fenêtre de navigation privée et tapez votre métier suivi de votre ville. Êtes-vous sur la carte ? Dans les premiers résultats ?",
        "Si non, le chantier est là : [votre fiche Google](/blog/fiche-google-therapeute) d'abord, vos pages par motif ensuite.",
      ],
    },
    {
      title: "2. Comprend-on tout de suite ce que vous faites ?",
      blocks: [
        "Montrez votre page d'accueil cinq secondes à quelqu'un qui ne vous connaît pas, puis demandez-lui ce que vous proposez et pour qui. S'il hésite, vos visiteurs aussi.",
        "Un titre clair, votre ville, un bouton de rendez-vous : le haut de page doit répondre à ces trois points sans faire défiler.",
      ],
    },
    {
      title: "3. Prendre rendez-vous est-il simple ?",
      blocks: [
        "Comptez les gestes entre l'arrivée sur le site et la réservation, **sur un téléphone**. Plus de trois, et vous perdez du monde.",
        {
          list: [
            "Le numéro est-il cliquable ?",
            "Le bouton de rendez-vous est-il visible sans faire défiler ?",
            "Le formulaire demande-t-il plus que le nécessaire ?",
            "Répondez-vous dans la journée aux messages ?",
          ],
        },
      ],
    },
    {
      title: "4. Inspirez-vous confiance ?",
      blocks: [
        "Deux cabinets voisins, l'un avec des avis récents et une photo du praticien, l'autre sans rien : le choix est fait avant la lecture.",
        "Un portrait, quelques avis, vos tarifs affichés et le déroulé d'une séance lèvent l'essentiel des hésitations. Voir [comment obtenir des avis sans insister](/blog/obtenir-avis-google-therapeute).",
      ],
    },
    {
      title: "5. Vos patients parlent-ils de vous ?",
      blocks: [
        "Le bouche-à-oreille reste la première source de nouveaux patients pour beaucoup de cabinets. Il s'entretient : des cartes à l'accueil, un mot aux professionnels de santé du quartier, une présence aux événements locaux.",
        "Votre site sert aussi à cela : la personne à qui l'on vous a recommandé tape votre nom, et décide en vous lisant.",
      ],
    },
    {
      title: "Et seulement ensuite, la publicité",
      blocks: [
        "Si les cinq points sont en place et que la demande manque encore, la publicité devient une option sérieuse : elle amènera des visiteurs à un site prêt à les recevoir. Notre guide explique [dans quels cas Google Ads vaut le coup](/blog/google-ads-therapeute).",
        { note: "Pour savoir où se perdent les demandes, il faut des chiffres : visiteurs, provenance, clics sur la prise de rendez-vous. Sans eux, on corrige au hasard." },
      ],
    },
  ],
  faq: [
    { q: "Combien de temps pour remplir un agenda ?", a: "Il n'y a pas de délai universel : cela dépend de votre ville, de votre spécialité et de votre ancienneté. Ce qui se contrôle, c'est le travail fait chaque mois, et ses effets se mesurent." },
    { q: "Faut-il baisser ses tarifs ?", a: "Rarement. Un agenda vide tient plus souvent à un défaut de visibilité ou de clarté qu'au prix. Vérifiez d'abord les cinq points." },
    { q: "Les plateformes de réservation suffisent-elles ?", a: "Elles facilitent la prise de rendez-vous, mais vous placent à côté de vos confrères. Elles complètent un site et une fiche Google ; elles ne les remplacent pas." },
  ],
  related: ["fiche-google-therapeute", "obtenir-avis-google-therapeute", "google-ads-therapeute"],
};
