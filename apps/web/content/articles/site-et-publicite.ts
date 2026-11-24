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
        "Sous ce premier écran, trois blocs suffisent : vos accompagnements, quelques avis, et les informations pratiques — adresse, horaires, tarifs. Tout le reste a sa propre page.",
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
      title: "Ce que chaque page doit contenir",
      blocks: [
        "Quel que soit son sujet, une page utile suit le même fil.",
        {
          list: [
            "**Un titre** qui dit le sujet et le lieu.",
            "**Deux phrases** qui montrent que vous avez compris la situation de la personne.",
            "**Ce que vous proposez**, concrètement, sans vocabulaire de spécialiste.",
            "**Le déroulé** : durée, nombre de séances habituel, tarif ou lien vers les tarifs.",
            "**Un bouton de rendez-vous**, en haut et en bas.",
          ],
          ordered: true,
        },
        "Visez une page qui se lit en deux minutes. Si elle déborde, c'est souvent qu'elle traite deux sujets : faites-en deux pages.",
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
        "Ajoutez ce qui situe votre sérieux : votre école, votre fédération ou votre syndicat, votre assurance professionnelle. Une ligne chacun suffit.",
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
      title: "Écrire pour être lu",
      blocks: [
        "Sur un écran, on ne lit pas : on parcourt. Aidez le regard.",
        {
          list: [
            "Des **paragraphes de trois lignes** au plus.",
            "Des **intertitres** qui se comprennent seuls, comme une table des matières.",
            "Des **mots simples** : « mal de dos » plutôt que « lombalgie », sauf si vos patients emploient le terme.",
            "Le **« vous »** plutôt que le « nous » : la page parle de la personne, pas du cabinet.",
          ],
        },
        "Un test simple : lisez seulement les titres et les mots en gras. Si l'essentiel y est, la page est bonne.",
      ],
    },
    {
      title: "Les photos",
      blocks: [
        "On choisit un praticien autant qu'une pratique, et l'on veut voir où l'on va. Trois photos font l'essentiel : un portrait de vous, la pièce où vous recevez, l'entrée du cabinet.",
        "Préférez des photos réelles, même imparfaites, aux images de banques : le galet posé sur le sable, tout le monde l'a déjà vu. Une lumière du jour et un cadrage simple suffisent.",
        { note: "Si une personne apparaît sur une photo, il vous faut son accord écrit. Pour un patient, abstenez-vous." },
      ],
    },
    {
      title: "Sur téléphone d'abord",
      blocks: [
        "La plupart de vos visiteurs vous lisent sur un téléphone. Ouvrez votre site sur le vôtre, et vérifiez quatre choses.",
        {
          list: [
            "Le texte se lit sans zoomer.",
            "Le bouton de rendez-vous est visible sans faire défiler.",
            "Le numéro s'appelle d'un toucher.",
            "Le menu tient en cinq ou six entrées.",
          ],
        },
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
    {
      title: "Dans quel ordre s'y prendre",
      blocks: [
        "Inutile de tout écrire avant d'ouvrir le site. Un ordre qui marche :",
        {
          list: [
            "L'accueil, les tarifs et le contact : le site peut être en ligne.",
            "La page « Comment se passe une séance ».",
            "Vos deux accompagnements les plus fréquents.",
            "Votre présentation, avec un portrait.",
            "Les pages par motif suivantes, une par mois.",
          ],
          ordered: true,
        },
        "Avec Harmony, cette première version est préparée pour vous à partir de votre pratique et de votre ville : vous la relisez et vous l'ajustez, au lieu de partir d'une page blanche.",
      ],
    },
  ],
  faq: [
    { q: "Combien de pages faut-il au minimum ?", a: "Cinq suffisent pour démarrer : accueil, une page d'accompagnement, déroulé d'une séance, tarifs, contact. Les pages par motif s'ajoutent ensuite, une à une." },
    { q: "Faut-il un blog dès le départ ?", a: "Non. Mieux vaut un site court et complet qu'un blog vide. Le blog vient quand les pages principales sont en place." },
    { q: "Qui écrit les textes ?", a: "Vous connaissez votre pratique mieux que personne, mais l'écriture prend du temps. Avec Harmony, les textes de votre site sont préparés à partir de votre activité et de votre ville, puis vous les ajustez en quelques clics." },
    { q: "Faut-il une page par ville ?", a: "Seulement si vous recevez réellement à plusieurs adresses : une page par lieu, avec l'accès et les horaires. Des pages créées pour des villes où vous n'exercez pas n'apportent rien de durable." },
    { q: "Dois-je afficher mes diplômes ?", a: "Oui, simplement : votre formation et votre école, sur la page de présentation. Deux lignes suffisent ; le détail peut rester sur demande." },
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
      title: "Ce que les devis ne disent pas",
      blocks: [
        {
          list: [
            "**Les modifications** : changer un tarif, ajouter un horaire, publier une photo. Sont-elles comprises, ou facturées à l'heure ?",
            "**Le renouvellement** du nom de domaine et de l'hébergement, chaque année.",
            "**Les textes** : qui les écrit ? Un site livré avec du faux texte n'est pas un site fini.",
            "**La sortie** : si vous arrêtez, que deviennent votre nom de domaine et vos contenus ?",
          ],
        },
        "Demandez ces quatre réponses par écrit avant de signer. Un prestataire sérieux les donne sans hésiter.",
      ],
    },
    {
      title: "Le faire soi-même",
      blocks: [
        "Les outils de création en ligne coûtent quelques dizaines d'euros par mois, et permettent un résultat propre. Tout le reste vous revient : structure, textes, référencement, mises à jour.",
        "C'est un bon choix si vous aimez cela et si vous avez du temps. C'est un mauvais calcul si le site reste inachevé pendant six mois.",
        "Avant de vous lancer, écrivez la liste des pages et bloquez les créneaux dans votre agenda. Un site que l'on fera « quand on aura le temps » ne sort jamais.",
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
        "Lisez le contrat de suivi avec autant d'attention que le devis de création : c'est lui que vous paierez le plus longtemps.",
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
      title: "Comparer sur trois ans, pas sur le premier mois",
      blocks: [
        "Un site vit plusieurs années. Le bon calcul additionne ce que vous payez au départ et ce que vous paierez ensuite, sur trois ans.",
        "Un site réglé une fois paraît moins cher, jusqu'au jour où il faut le mettre à jour, le sécuriser ou le refaire. Un abonnement paraît plus cher, jusqu'à ce que l'on compte ce qu'il comprend : hébergement, maintenance, contenus.",
        "Posez les deux colonnes côte à côte, avec vos propres chiffres. Et ajoutez la ligne que l'on oublie toujours : **vos heures**. Une soirée par semaine passée sur le site a un prix, celui des séances que vous ne donnez pas ou du repos que vous ne prenez pas.",
      ],
    },
    {
      title: "Les signaux qui doivent alerter",
      blocks: [
        {
          list: [
            "Un **nom de domaine que vous ne pourriez pas reprendre** en partant : demandez comment se passe le transfert.",
            "Une **première place promise** sur Google : personne ne peut la garantir.",
            "Un **engagement long sans prix public**, ni conditions de sortie écrites.",
            "Un site dit **« optimisé »** sans que l'on vous explique ce qui a été fait, concrètement.",
          ],
        },
      ],
    },
    {
      title: "Comment savoir si c'est rentable",
      blocks: [
        "Rapportez le coût mensuel au prix d'une séance. Si le site vous amène deux ou trois nouveaux patients par mois, et que chacun revient quelques fois, le calcul est vite fait.",
        "Notre [simulateur de rentabilité](/#simulateur) le fait avec vos propres chiffres : tarif, nouveaux patients, séances par patient. Il ne promet rien ; il vous montre le seuil à partir duquel le site se paie.",
      ],
    },
    {
      title: "Choisir selon votre situation",
      blocks: [
        "Il n'y a pas de réponse universelle. Trois situations, trois choix raisonnables.",
        {
          list: [
            "**Vous débutez, avec peu de budget et du temps** : faites-le vous-même, avec un nom de domaine à vous, en commençant par cinq pages.",
            "**Vous êtes installé et le temps vous manque** : une solution qui prend en charge le site et ses contenus vous rend vos soirées.",
            "**Vous êtes plusieurs praticiens**, avec une identité à construire : un indépendant ou une agence, sur un cahier des charges précis.",
          ],
        },
      ],
    },
  ],
  faq: [
    { q: "Un site gratuit, est-ce une bonne idée ?", a: "Pour tester, oui. Pour un cabinet, les limites arrivent vite : adresse au nom de la plateforme, publicités, peu de maîtrise du référencement. Un nom de domaine à vous est la première dépense utile." },
    { q: "Que coûte un site une fois en ligne ?", a: "Au minimum le nom de domaine et l'hébergement, chaque année. S'y ajoutent les mises à jour et les contenus, que vous faites vous-même, que vous payez à la demande, ou qui sont compris dans un abonnement." },
    { q: "Le référencement est-il compris dans le prix d'un site ?", a: "Rarement. Un site « optimisé » a une structure correcte ; cela ne remplace ni la fiche Google, ni les pages par motif, ni les articles. Demandez toujours ce que le mot recouvre." },
    { q: "Puis-je changer de solution plus tard ?", a: "Oui, à condition de pouvoir emporter votre nom de domaine : c'est lui qui porte votre référencement. Posez la question avant tout engagement, quelle que soit la formule." },
    { q: "Faut-il payer en plus pour apparaître sur Google ?", a: "Non. Apparaître dans les résultats naturels est gratuit. Ce qui se paie, c'est le travail qui vous y fait progresser — pages, contenus, fiche Google — ou la publicité, qui reste facultative." },
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
      title: "Soigner son profil avant de publier",
      blocks: [
        "Un visiteur décide en quelques secondes s'il s'abonne ou s'il repart. Trois éléments font le travail.",
        {
          list: [
            "**La photo** : votre visage, net et souriant. Pas un logo.",
            "**La biographie** : votre métier, votre ville, à qui vous vous adressez. « Sophrologue à Albi. J'accompagne le stress et le sommeil. »",
            "**Le lien** : vers la prise de rendez-vous ou vers votre site.",
          ],
        },
        "Sur Instagram, épinglez trois publications en haut du profil : qui vous êtes, comment se passe une séance, comment réserver. C'est la vitrine que verra chaque nouveau visiteur.",
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
      title: "Carrousel, story, vidéo : à quoi sert chaque format",
      blocks: [
        {
          list: [
            "**Le carrousel** explique : trois à six images qui se lisent comme une petite fiche. C'est le format que l'on enregistre.",
            "**La story** montre le quotidien, puis disparaît : un créneau libre, les coulisses, une question posée à vos abonnés.",
            "**La vidéo courte** fait découvrir : trente secondes face à la caméra pour répondre à une question touchent des personnes qui ne vous suivent pas encore.",
            "**L'image simple** rappelle : une phrase, un conseil, une information pratique.",
          ],
        },
      ],
    },
    {
      title: "Écrire une légende qui se lit",
      blocks: [
        "La première ligne décide si l'on lit la suite. Posez-y la situation : « Vous vous réveillez à 3 heures, et impossible de vous rendormir ? »",
        "Ensuite : une idée par publication, des phrases courtes, des retours à la ligne. Terminez par une invitation simple — enregistrer la publication, poser une question, consulter le lien du profil.",
        "Quelques mots-dièse suffisent, précis et locaux : votre pratique, votre ville, le thème. En aligner trente n'apporte rien.",
      ],
    },
    {
      title: "Recycler plutôt que tout inventer",
      blocks: [
        "Vous n'avez pas à trouver une idée neuve à chaque publication. Un seul sujet fait plusieurs contenus.",
        {
          list: [
            "Un **article de blog** devient un carrousel en cinq images.",
            "Une **question fréquente** devient une story, avec un sondage.",
            "Un **conseil** donné en séance devient une courte vidéo.",
            "Une **publication qui a bien marché** se reprend six mois plus tard, reformulée.",
          ],
        },
        "Le même contenu peut paraître sur Instagram et sur Facebook : les deux publics ne se recoupent qu'en partie.",
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
      title: "Répondre, sans y passer ses soirées",
      blocks: [
        "Un commentaire laissé sans réponse décourage le suivant. Répondez à tous, brièvement, dans la journée ou le lendemain.",
        "Fixez-vous un cadre : dix minutes par jour, à heure fixe, plutôt qu'un œil sur le téléphone entre chaque séance. Et quand une question devient personnelle, la réponse est toujours la même : « Parlons-en en séance », avec le lien de rendez-vous.",
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
        "Les statistiques de votre compte professionnel montrent les publications enregistrées et partagées. Ce sont elles qui indiquent ce qui intéresse vraiment vos abonnés.",
      ],
    },
  ],
  faq: [
    { q: "Faut-il se montrer en vidéo ?", a: "Ce n'est pas obligatoire. Des visuels soignés et des textes clairs font déjà beaucoup. Si vous êtes à l'aise, une courte vidéo où vous répondez à une question crée un vrai lien." },
    { q: "Les réseaux sociaux remplacent-ils un site ?", a: "Non. Un compte ne vous appartient pas, n'apparaît pas sur les recherches locales de Google et ne se lit pas comme un site. Les réseaux rassurent ; le site et la fiche Google font trouver." },
    { q: "Faut-il payer pour être vu ?", a: "Pas pour commencer. La publicité sur Facebook et Instagram devient utile pour une occasion précise : un atelier, une ouverture, une offre de découverte." },
    { q: "Faut-il un compte professionnel ?", a: "Oui. Il est gratuit, donne accès aux statistiques et permet d'afficher vos coordonnées. Gardez votre compte personnel pour votre vie privée." },
    { q: "Combien de temps avant d'en voir l'effet ?", a: "Comptez en mois plutôt qu'en semaines, et ne jugez pas au nombre d'abonnés : regardez les visites du site et les prises de contact venues des réseaux." },
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
      title: "Comment une campagne se présente",
      blocks: [
        "Trois niveaux, à connaître pour ne pas se perdre.",
        {
          list: [
            "**La campagne** fixe le budget quotidien et la zone géographique.",
            "**Le groupe d'annonces** réunit des mots-clés proches et les annonces qui y répondent : un groupe par motif.",
            "**L'annonce** est ce que la personne voit : des titres, deux lignes de description, et l'adresse de la page d'arrivée.",
          ],
        },
        "Pour un cabinet, une seule campagne sur le réseau de recherche, deux ou trois groupes et quelques mots-clés chacun : c'est suffisant, et cela reste lisible.",
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
      title: "Écrire une annonce honnête, donc efficace",
      blocks: [
        "Une bonne annonce reprend les mots de la recherche et dit ce qui se passe après le clic.",
        {
          list: [
            "**Le titre** : le motif et la ville. « Sophrologie et sommeil à Albi ».",
            "**La description** : ce que vous proposez, la durée d'une séance, comment réserver.",
            "**La page d'arrivée** : la même promesse que l'annonce, et un bouton de rendez-vous visible.",
          ],
        },
        "Ajoutez votre numéro et votre adresse en complément d'annonce : ils s'affichent sous le texte et rendent le contact immédiat.",
      ],
    },
    {
      title: "Fixer un budget, et s'y tenir",
      blocks: [
        "Vous fixez un montant par jour ; Google ne le dépasse pas sur le mois. Le prix d'un clic dépend de la concurrence dans votre ville et votre métier : il varie beaucoup d'un cabinet à l'autre.",
        "Commencez petit, sur une seule campagne et une zone resserrée autour du cabinet. Laissez tourner trois à quatre semaines avant de juger : les premiers jours ne disent rien.",
        "Prévoyez aussi du temps : une demi-heure par semaine pour lire les termes de recherche et ajuster. Une campagne laissée seule dérive.",
      ],
    },
    {
      title: "Les réglages qui font fondre un budget",
      blocks: [
        {
          list: [
            "**Les mots-clés en requête large**, qui diffusent l'annonce sur des recherches voisines sans rapport avec votre cabinet.",
            "**Une zone trop grande** : personne ne traverse le département pour une séance. Ciblez les communes d'où viennent déjà vos patients.",
            "**Les partenaires de recherche et le réseau Display**, souvent cochés par défaut : décochez-les pour rester sur les recherches Google.",
            "**Les recommandations automatiques**, appliquées sans être lues : elles augmentent souvent la dépense avant la pertinence.",
          ],
        },
        "Une fois par semaine, ouvrez la liste des **termes de recherche** réellement tapés. Chaque terme hors sujet devient un mot-clé à exclure.",
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
      title: "Les professions qui ne peuvent pas faire de publicité",
      blocks: [
        "Avant les règles de Google, il y a celles de votre métier. Les professions de santé dotées d'un ordre — médecins, kinésithérapeutes, sages-femmes, pédicures-podologues, entre autres — ont un code de déontologie qui interdit d'acheter un référencement prioritaire. Pour elles, Google Ads est exclu.",
        "Si votre pratique dépend d'un ordre, d'une fédération ou d'un syndicat, vérifiez leurs règles avant de lancer une campagne.",
      ],
    },
    {
      title: "Juger la rentabilité",
      blocks: [
        "Ne regardez ni les clics ni les impressions. Une seule question : **combien coûte un nouveau patient venu de la publicité ?**",
        "Divisez la dépense du mois par le nombre de rendez-vous qu'elle a amenés. Comparez à ce qu'un patient représente pour vous, en comptant les séances suivantes. Si le compte est bon, continuez ; sinon, corrigez ou arrêtez.",
        { note: "Cela suppose de savoir d'où viennent vos rendez-vous. Sans suivi des clics sur la prise de rendez-vous, on pilote à l'aveugle." },
        "Fixez un seuil avant de commencer : ce que vous acceptez de dépenser pour un nouveau patient. Sans ce repère décidé à froid, on prolonge par habitude une campagne qui ne rapporte pas, ou l'on coupe trop tôt une campagne qui démarre.",
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
    { q: "Faut-il un site pour faire de la publicité ?", a: "Oui, et une page précise par annonce. Envoyer des clics payés vers une page d'accueil générale est la façon la plus sûre de les perdre." },
    { q: "Que se passe-t-il si j'arrête ?", a: "Les annonces cessent de s'afficher aussitôt, et les visites qu'elles amenaient s'arrêtent avec elles. C'est la grande différence avec le référencement naturel, dont les effets durent." },
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
      title: "Partir des chiffres que vous avez déjà",
      blocks: [
        "Avant de chercher ce qui manque, regardez ce que vous savez. Trois chiffres, même approximatifs, orientent tout le reste.",
        {
          list: [
            "**Combien de nouvelles personnes** vous ont contacté le mois dernier ?",
            "**D'où venaient-elles** : recommandation, Google, réseaux sociaux, un confrère ?",
            "**Combien ont pris rendez-vous**, et combien sont revenues ?",
          ],
        },
        "Si personne ne vous contacte, le problème est la visibilité. Si l'on vous contacte sans réserver, il est dans la réponse ou dans le tarif. Si l'on vient une fois sans revenir, il est ailleurs encore — et aucune publicité n'y changera rien.",
        "Demandez simplement à chaque nouveau patient comment il vous a trouvé, et notez-le. En trois mois, vous saurez où mettre votre énergie.",
      ],
    },
    {
      title: "1. Vous trouve-t-on ?",
      blocks: [
        "Ouvrez une fenêtre de navigation privée et tapez votre métier suivi de votre ville. Êtes-vous sur la carte ? Dans les premiers résultats ?",
        "Si non, le chantier est là : [votre fiche Google](/blog/fiche-google-therapeute) d'abord, vos pages par motif ensuite.",
        "Faites aussi l'essai avec deux ou trois motifs — « sophrologie sommeil » suivi de votre ville, par exemple. Si vous n'apparaissez que sur votre nom, on ne vous trouve qu'en vous connaissant déjà.",
      ],
    },
    {
      title: "2. Comprend-on tout de suite ce que vous faites ?",
      blocks: [
        "Montrez votre page d'accueil cinq secondes à quelqu'un qui ne vous connaît pas, puis demandez-lui ce que vous proposez et pour qui. S'il hésite, vos visiteurs aussi.",
        "Un titre clair, votre ville, un bouton de rendez-vous : le haut de page doit répondre à ces trois points sans faire défiler.",
        "Relisez aussi vos premières lignes : parlent-elles de la personne et de sa difficulté, ou de vous et de vos diplômes ? Celui qui hésite veut d'abord se reconnaître.",
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
        "Testez aussi votre répondeur : annonce-t-il votre nom, ce que vous faites, et quand vous rappelez ? Un message qui dit « je vous rappelle dans la journée » retient une personne qui, sinon, appelle le cabinet suivant.",
      ],
    },
    {
      title: "4. Inspirez-vous confiance ?",
      blocks: [
        "Deux cabinets voisins, l'un avec des avis récents et une photo du praticien, l'autre sans rien : le choix est fait avant la lecture.",
        "Un portrait, quelques avis, vos tarifs affichés et le déroulé d'une séance lèvent l'essentiel des hésitations. Voir [comment obtenir des avis sans insister](/blog/obtenir-avis-google-therapeute).",
        "Vérifiez enfin ce que l'on voit de vous ailleurs : une fiche d'annuaire abandonnée, un profil sans photo, une ancienne adresse. Ces détails font douter.",
      ],
    },
    {
      title: "5. Vos patients parlent-ils de vous ?",
      blocks: [
        "Le bouche-à-oreille reste la première source de nouveaux patients pour beaucoup de cabinets. Il s'entretient : des cartes à l'accueil, un mot aux professionnels de santé du quartier, une présence aux événements locaux.",
        "Votre site sert aussi à cela : la personne à qui l'on vous a recommandé tape votre nom, et décide en vous lisant.",
        "Faites la liste de cinq professionnels du quartier qui reçoivent le même public que vous, et allez vous présenter. Un échange de dix minutes vaut souvent des mois de publications.",
      ],
    },
    {
      title: "Et vos créneaux ?",
      blocks: [
        "Un agenda peut sembler vide parce que ses créneaux ne correspondent pas à la vie de vos patients. Ceux qui travaillent cherchent le soir, le samedi matin ou la pause de midi.",
        "Regardez à quels moments tombent vos rendez-vous actuels, et les demandes que vous avez dû refuser. Ouvrir un seul créneau tardif par semaine change parfois davantage qu'un mois de communication.",
      ],
    },
    {
      title: "Garder le lien avec ceux qui vous connaissent",
      blocks: [
        "Trouver un nouveau patient demande plus d'efforts que de rester présent à l'esprit de ceux qui sont déjà venus.",
        {
          list: [
            "**Proposez le rendez-vous suivant** en fin de séance, quand un suivi a du sens.",
            "**Envoyez un rappel** la veille : il réduit les oublis.",
            "**Donnez des nouvelles** deux ou trois fois par an — un atelier, un nouvel horaire — à ceux qui ont accepté d'en recevoir.",
            "**Remerciez** la personne qui vous a recommandé : elle recommencera.",
          ],
        },
        { note: "Pour écrire à vos patients, il vous faut leur accord. Une case à cocher sur votre fiche de première séance suffit." },
      ],
    },
    {
      title: "Un plan sur quatre semaines",
      blocks: [
        {
          list: [
            "**Semaine 1** : faites les cinq vérifications, et notez ce qui manque.",
            "**Semaine 2** : complétez votre fiche Google, corrigez le haut de votre page d'accueil.",
            "**Semaine 3** : simplifiez la prise de rendez-vous, affichez vos tarifs.",
            "**Semaine 4** : demandez vos premiers avis, reprenez contact avec votre réseau.",
          ],
          ordered: true,
        },
        "Ensuite seulement, mesurez. Si les demandes n'ont pas bougé après deux ou trois mois de ce régime, la publicité devient la bonne question.",
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
    { q: "Je viens de m'installer : est-ce normal que ce soit calme ?", a: "Oui. Une patientèle se construit sur des mois : le bouche-à-oreille et le référencement ont besoin de temps. Profitez de ce calme pour soigner votre fiche Google, votre site et votre réseau local." },
    { q: "Faut-il proposer une première séance à prix réduit ?", a: "C'est un choix personnel. Si vous le faites, limitez-le dans le temps et dites-le clairement ; un tarif juste et affiché rassure souvent davantage qu'une remise." },
  ],
  related: ["fiche-google-therapeute", "obtenir-avis-google-therapeute", "google-ads-therapeute"],
};
