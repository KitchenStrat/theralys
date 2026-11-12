import {
  ArrowRight,
  CalendarCheck,
  Download,
  Eye,
  FileSearch,
  MapPin,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  AiBadge,
  AnimatedNumber,
  AreaChart,
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  EmptyState,
  IconBadge,
  InlineSuccess,
  InteractiveCard,
  KpiTile,
  KpiTileSkeleton,
  LinkButton,
  NextStepCard,
  PageHeader,
  ProgressBar,
  ProgressRing,
  SECTIONS,
  SECTION_ORDER,
  SectionBadge,
  SetupChecklist,
  SkeletonText,
  Sparkline,
  Spinner,
  Stagger,
  StatusPill,
  StepProgress,
} from "@/components/ds";
import { Replay, RegistryCheck, SaveDemo, SegmentedDemo, TabsDemo } from "./_components/demos";
import { GenerationDemo } from "./_components/generation-demo";
import { PreviewNav } from "./_components/preview-nav";
import { assertPreviewAllowed } from "./_lib/guard";
import { CHECKLIST, GENERATION_STEPS, TRENDS, VISITS_30 } from "./_lib/sample";

const RAMPS: { name: string; token: string; steps: number[]; note: string }[] = [
  { name: "Marque", token: "brand", steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], note: "500 = bleu de marque (pictogrammes, grands titres) · 600 et plus foncé : fonds sous texte blanc · 700 : liens" },
  { name: "Teal", token: "teal", steps: [50, 100, 200, 300, 500, 600, 700, 900], note: "185°" },
  { name: "Cyan", token: "cyan", steps: [50, 100, 200, 300, 500, 600, 700, 900], note: "215°" },
  { name: "Bleu", token: "blue", steps: [50, 100, 200, 300, 500, 600, 700, 900], note: "260°" },
  { name: "Indigo", token: "indigo", steps: [50, 100, 200, 300, 500, 600, 700, 900], note: "277°" },
  { name: "Violet", token: "violet", steps: [50, 100, 200, 300, 500, 600, 700, 900], note: "293°" },
  { name: "Encre", token: "ink", steps: [25, 50, 100, 200, 300, 400, 450, 500, 600, 700, 800, 900], note: "50 : fond de page · 200-300 : filets · 450 : bordure de champ · 600 : texte secondaire · 900 : texte" },
  { name: "Réussite", token: "success", steps: [100, 600, 700, 900], note: "statut" },
  { name: "Attention", token: "warning", steps: [100, 500, 700, 900], note: "statut" },
  { name: "Erreur", token: "danger", steps: [100, 600, 700, 900], note: "statut" },
  { name: "Soleil", token: "sun", steps: [100, 200, 400, 600, 700, 900], note: "seul accent chaud : réussites, « Nouveau », durée d'une étape" },
];

function Block({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-24">
      <h2 id={id} className="font-ds-display text-2xl font-bold text-ds-ink-900">
        {title}
      </h2>
      {lead ? <p className="mt-1 max-w-[75ch] text-base text-ds-ink-600">{lead}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function Specimen({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h3 className="text-ds-body font-semibold text-ds-ink-900">{title}</h3>
      {note ? <p className="mt-0.5 text-ds-meta text-ds-ink-600">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function DesignPreviewPage() {
  assertPreviewAllowed();
  return (
    <>
      <PreviewNav current="fondations" />
      <Stagger className="space-y-12">
        <header>
          <p className="text-ds-body font-semibold text-ds-brand-700">Socle du nouveau studio — rien n'est encore branché sur les vraies pages</p>
          <h1 className="mt-1 font-ds-display text-[2rem]/10 font-extrabold tracking-tight text-ds-ink-900 sm:text-[2.5rem]/[1.15]">
            Un ciel vivant, toujours bleu
          </h1>
          <p className="mt-3 max-w-[70ch] text-lg/7 text-ds-ink-700">
            Une famille de bleus voisins, du turquoise au violet, un dégradé par section, un seul accent chaud. Des textes
            en 16 px, des contrastes vérifiés, un mouvement bref qui répond à un geste.
          </p>
          <div className="mt-4">
            <RegistryCheck />
          </div>
        </header>

        <Block
          id="sections"
          title="Sections : un dégradé, une teinte, une icône"
          lead="Chaque section se reconnaît d'un coup d'œil et toutes forment une famille. Le dégradé vif porte les pictogrammes et les grands titres ; le dégradé profond est le seul à recevoir du texte blanc de taille courante."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SECTION_ORDER.map((key) => {
              const def = SECTIONS[key];
              return (
                <Card key={key} section={key} padding="sm">
                  <div className="flex items-center gap-3">
                    <SectionBadge section={key} size="md" />
                    <div className="min-w-0">
                      <p className="font-ds-display text-lg font-bold text-ds-section-ink">{def.label}</p>
                      <p className="text-ds-meta text-ds-ink-600">Dégradé « {def.gradient.name} »</p>
                    </div>
                  </div>
                  <div className="mt-3.5 grid grid-cols-2 gap-2">
                    <div className="grid h-[4.5rem] place-items-center rounded-ds-sm bg-ds-section-gradient text-ds-section-on">
                      <span className="font-ds-display text-2xl font-bold">Vif</span>
                    </div>
                    <div className="grid h-[4.5rem] place-items-center rounded-ds-sm bg-ds-section-gradient-deep px-2 text-center text-ds-body font-medium text-ds-section-on-deep">
                      Profond : texte courant
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-ds-sm bg-ds-section-tint p-2.5 ring-1 ring-ds-section-line">
                    <span className="size-6 rounded-md bg-ds-section-tint-2 ring-1 ring-ds-section-line" />
                    <span className="text-ds-body font-semibold text-ds-section-ink">Encre</span>
                    <span className="text-ds-body font-semibold text-ds-section-accent">Accent</span>
                    <span className="text-ds-body text-ds-ink-600">sur teinte</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </Block>

        <Block
          id="couleurs"
          title="Couleurs"
          lead="Mêmes paliers de luminosité dans toutes les familles : un contraste vérifié sur une teinte vaut pour les autres. Jetons « ds-… », aucun nom existant n'est réutilisé."
        >
          <Card>
            <div className="space-y-3.5">
              {RAMPS.map((ramp) => (
                <div key={ramp.token} className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-ds-body font-semibold text-ds-ink-900">{ramp.name}</p>
                    <p className="text-xs text-ds-ink-600">ds-{ramp.token}</p>
                  </div>
                  <div>
                    {/* Le numéro du pas est écrit sous la pastille : aucun texte posé sur une couleur moyenne */}
                    <div className="flex gap-1">
                      {ramp.steps.map((step) => (
                        <span key={step} className="min-w-0 flex-1 text-center">
                          <span
                            className="block h-10 rounded-lg ring-1 ring-ds-ink-900/10 ring-inset"
                            style={{ backgroundColor: `var(--color-ds-${ramp.token}-${step})` } as CSSProperties}
                          />
                          <span className="mt-1 block text-xs text-ds-ink-700 ds-tnum">{step}</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-ds-ink-600">{ramp.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Block>

        <Block id="typographie" title="Typographie" lead="Figtree pour les titres, Inter pour tout le reste. Corps en 16 px, rien d'informatif sous 13 px.">
          <Card>
            <dl className="divide-y divide-ds-ink-200">
              {[
                ["Titre de page · Figtree 700 · 28 puis 32 px", <span key="a" className="font-ds-display text-ds-title font-bold text-ds-ink-900 sm:text-[2rem]/10">Réseaux sociaux</span>],
                ["Titre de carte · Figtree 700 · 18 puis 20 px", <span key="b" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">Prochaines publications</span>],
                ["Chiffre clé · Inter 700 · 34 px (text-ds-kpi)", <span key="c" className="text-ds-kpi font-bold text-ds-ink-900">1 284</span>],
                ["Corps · Inter 400 · 16 px", <span key="d" className="text-base text-ds-ink-900">Nous écrivons vos articles ; vous les relisez avant publication.</span>],
                ["Secondaire · Inter 400 · 15 px (text-ds-body), encre 600", <span key="e" className="text-ds-body text-ds-ink-600">Prévu le vendredi 13 novembre, à 9 h 00.</span>],
                ["Mention et badge · Inter 500 · 13 px (text-ds-meta)", <span key="f" className="text-ds-meta font-medium text-ds-ink-600">7 derniers jours</span>],
              ].map(([label, sample]) => (
                <div key={String(label)} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[20rem_minmax(0,1fr)] sm:items-baseline sm:gap-6">
                  <dt className="text-ds-meta text-ds-ink-600">{label}</dt>
                  <dd>{sample}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </Block>

        <Block id="boutons" title="Boutons" lead="Une seule action principale par vue, toujours au bleu de marque. 44 px de haut ; la pression enfonce le bouton de 3 % en 100 ms, le survol pose un voile en 150 ms.">
          <Specimen title="Variantes" note="primary (dégradé de marque) · secondary · quiet · danger · inverse (sur bandeau en dégradé)">
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<Sparkles size={18} aria-hidden />}>Préparer mes contenus</Button>
              <Button variant="secondary" icon={<Download size={18} aria-hidden />}>
                Télécharger
              </Button>
              <Button variant="quiet">Plus tard</Button>
              <Button variant="danger" icon={<Trash2 size={18} aria-hidden />}>
                Supprimer
              </Button>
              <span data-ds-section="accueil" className="rounded-full bg-ds-section-gradient-deep p-2">
                <Button variant="inverse">Voir le résultat</Button>
              </span>
            </div>
          </Specimen>
          <div className="grid gap-5 lg:grid-cols-2">
            <Specimen title="Tailles et liens" note="lg 48 px · md 44 px · sm 36 px (44 px au doigt) · LinkButton pour naviguer">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">Grand</Button>
                <Button>Moyen</Button>
                <Button size="sm">Petit</Button>
                <LinkButton href="/apercu-design/accueil" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />}>
                  Lien interne
                </LinkButton>
                <LinkButton href="https://cabinet.example" external variant="quiet">
                  Voir mon site
                </LinkButton>
              </div>
            </Specimen>
            <Specimen title="États" note="inactif · en cours (le libellé reste) · réussite annoncée à côté du bouton">
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>Inactif</Button>
                <Button variant="secondary" disabled>
                  Inactif
                </Button>
                <Button loading>Enregistrement…</Button>
              </div>
              <div className="mt-4">
                <SaveDemo />
              </div>
            </Specimen>
          </div>
        </Block>

        <Block id="badges" title="Badges et statuts" lead="Teinte 100, texte 900 : au moins 9:1 en 13 px. Un statut porte toujours une icône et un libellé, jamais la couleur seule.">
          <div className="grid gap-5 lg:grid-cols-2">
            <Specimen title="Statuts d'un contenu">
              <div className="flex flex-wrap gap-2">
                <StatusPill status="brouillon" />
                <StatusPill status="planifie" />
                <StatusPill status="a-relire" />
                <StatusPill status="en-cours" />
                <StatusPill status="publie" />
                <StatusPill status="echec" />
              </div>
            </Specimen>
            <Specimen title="Badges" note="neutre · marque · section · accent chaud · contenu produit par l'IA">
              <div className="flex flex-wrap gap-2">
                <Badge>Carrousel</Badge>
                <Badge tone="brand">Formule Scale</Badge>
                <Badge tone="section">8 contenus</Badge>
                <Badge tone="sun">Nouveau</Badge>
                <AiBadge />
              </div>
            </Specimen>
          </div>
        </Block>

        <Block id="cartes" title="Cartes" lead="Blanches, à ombre douce teintée. Seule la carte cliquable se soulève au survol ; la carte teintée met en avant sans ajouter d'ombre.">
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <CardHeader as="h3" icon={FileSearch} title="Carte simple" description="Fond blanc, ombre de repos." />
              <p className="mt-4 text-base text-ds-ink-700">Un message ou une mesure par carte.</p>
            </Card>
            <Card variant="tinted" section="fiche-google">
              <CardHeader as="h3" icon={MapPin} title="Carte teintée" description="La teinte de la section." />
              <p className="mt-4 text-base text-ds-ink-700">Pour le bloc à remarquer : un résumé, un conseil.</p>
            </Card>
            <InteractiveCard href="/apercu-design/accueil" section="publications">
              <span className="flex items-start gap-3.5">
                <IconBadge icon={PenLine} />
                <span>
                  <span className="block font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">Carte cliquable</span>
                  <span className="block text-ds-body text-ds-ink-600">Se soulève au survol, s'enfonce à la pression.</span>
                </span>
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-ds-body font-semibold text-ds-brand-700">
                Ouvrir <ArrowRight size={16} aria-hidden />
              </span>
            </InteractiveCard>
          </div>
        </Block>

        <Block id="chiffres" title="Chiffres clés et graphiques" lead="Anatomie fixe : pastille et libellé, valeur, variation signée avec sa période, mini-courbe. Les chiffres roulent une fois à l'arrivée ; les courbes se révèlent de gauche à droite.">
          <Replay>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiTile section="mon-site" icon={Users} label="Visiteurs du site" caption="7 derniers jours" value={1284} delta={{ value: 12, label: "en une semaine" }} trend={TRENDS.visits} />
              <KpiTile section="accueil" icon={CalendarCheck} label="Demandes de rendez-vous" caption="7 derniers jours" value={18} delta={{ value: -2, unit: "", label: "en une semaine" }} trend={TRENDS.appointments} />
              <KpiTile section="google-ads" icon={Search} label="Coût moyen d'un clic" caption="30 derniers jours" value={0.85} format={{ style: "currency", currency: "EUR" }} delta={{ value: -8, label: "en un mois", goodWhen: "down" }} />
              <KpiTile section="reseaux-sociaux" icon={Eye} label="Vues de vos publications" caption="30 derniers jours" value={4812} delta={{ value: 0, label: "stable sur un mois" }} href="/apercu-design/section/reseaux-sociaux" />
            </div>
          </Replay>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Specimen title="Graphique en aire (AreaChart)" note="Survol, toucher ou flèches du clavier : repère et infobulle. Les valeurs restent lisibles dans le tableau replié." className="min-w-0">
              <div data-ds-section="mon-site">
                <AreaChart data={VISITS_30} unit={["visite", "visites"]} label="Visites de votre site sur 30 jours" height={200} />
              </div>
            </Specimen>
            <Specimen title="Mini-courbes (Sparkline) et chiffre animé" note="La couleur suit la section englobante.">
              <div className="space-y-4">
                {(["mon-site", "reseaux-sociaux", "google-ads"] as const).map((key) => (
                  <div key={key} data-ds-section={key} className="flex items-center gap-4">
                    <SectionBadge section={key} size="sm" tone="soft" />
                    <Sparkline data={key === "mon-site" ? TRENDS.visits : key === "reseaux-sociaux" ? TRENDS.reach : TRENDS.reviews} label={`Tendance — ${SECTIONS[key].label}`} className="flex-1" height={40} />
                  </div>
                ))}
                <p className="text-ds-kpi font-bold text-ds-ink-900">
                  <AnimatedNumber value={12480.5} format={{ style: "currency", currency: "EUR" }} />
                </p>
              </div>
            </Specimen>
          </div>
        </Block>

        <Block id="progression" title="Progression" lead="La jauge prend le dégradé de la section, sa piste une teinte de la même famille. Barre et anneau se remplissent à l'arrivée (translation et rotation seulement) et sont toujours doublés d'un texte.">
          <div className="grid gap-5 lg:grid-cols-2">
            <Specimen title="Barres (ProgressBar)">
              <div className="space-y-5">
                <ProgressBar value={3} max={8} label="Contenus publiés" valueText="3 sur 8" section="reseaux-sociaux" />
                <ProgressBar value={74} label="Score de votre fiche" valueText="74 sur 100" section="fiche-google" />
                <ProgressBar value={2} max={4} label="Articles du mois" valueText="2 sur 4 · remise à zéro le 1er décembre" section="publications" size="sm" />
                <ProgressBar value={45} label="Travail en cours" valueText="Étape 3 sur 5" busy section="meta-ads" />
              </div>
            </Specimen>
            <Specimen title="Anneaux (ProgressRing)">
              <Replay>
                <div className="flex flex-wrap items-center gap-6">
                  {([["accueil", 3, 5], ["fiche-google", 74, 100], ["meta-ads", 1, 4], ["mon-site", 6, 6]] as const).map(([key, value, max]) => (
                    <ProgressRing key={key} section={key} value={value} max={max} size={76} thickness={8} label={`Exemple ${SECTIONS[key].label}`} valueText={`${value} sur ${max}`}>
                      <span className="text-lg font-bold text-ds-ink-900 ds-tnum">
                        {max === 100 ? value : `${value}/${max}`}
                      </span>
                    </ProgressRing>
                  ))}
                  <ProgressRing section="academie" value={2} max={6} size={48} thickness={6} label="Fiches lues" valueText="2 sur 6">
                    <span className="text-ds-meta font-bold text-ds-ink-900 ds-tnum">2/6</span>
                  </ProgressRing>
                </div>
              </Replay>
            </Specimen>
          </div>
        </Block>

        <Block id="demarrage" title="Mise en route et prochaine étape" lead="Une seule « prochaine étape » par écran, avec sa durée. La mise en route garde visibles les étapes déjà faites et ne met en avant que la suivante.">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <SetupChecklist steps={CHECKLIST} section="accueil" />
            <div className="space-y-5">
              <NextStepCard
                as="h3"
                section="fiche-google"
                title="Répondre à vos 3 derniers avis"
                duration="5 min"
                action={<Button iconRight={<ArrowRight size={18} aria-hidden />}>Voir les réponses proposées</Button>}
                secondary={<Button variant="quiet">Plus tard</Button>}
              >
                Une réponse montre que vous êtes à l'écoute, et compte dans votre classement. Nous les avons rédigées : il
                reste à les relire.
              </NextStepCard>
              <SetupChecklist title="Mise en route terminée" steps={CHECKLIST.map((step) => ({ ...step, done: true }))} section="mon-site" defaultOpen={false} />
            </div>
          </div>
        </Block>

        <Block id="vides" title="États vides" lead="Trois situations, trois messages : rien encore (la cause, le bénéfice, une action), rien trouvé (comment élargir), tout est traité. Jamais pendant un chargement.">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card padding="none" section="google-ads">
              <EmptyState icon={Sparkles} title="Vous n'avez pas encore de campagne" action={<Button>Voir combien cela coûterait</Button>}>
                La publicité fait apparaître votre cabinet en haut des résultats quand quelqu'un cherche un praticien près de
                chez vous.
              </EmptyState>
            </Card>
            <Card padding="none" section="publications">
              <EmptyState icon={Search} title="Aucun article ne correspond à « sommeil »" action={<Button variant="secondary">Effacer la recherche</Button>}>
                Essayez un autre mot, ou parcourez tous vos articles.
              </EmptyState>
            </Card>
            <EmptyState tone="tinted" section="fiche-google" icon={MapPin} title="Vous êtes à jour" secondary={<Button variant="quiet">Voir les avis déjà traités</Button>}>
              Aucun avis n'attend de réponse. Nous vous préviendrons au prochain.
            </EmptyState>
          </div>
        </Block>

        <Block id="chargement" title="Chargement" lead="Un squelette reprend la forme du contenu attendu ; son reflet est le seul mouvement en boucle admis, et il s'arrête en mouvement réduit.">
          <div className="grid gap-5 md:grid-cols-3">
            <KpiTileSkeleton />
            <CardSkeleton lines={3} />
            <Specimen title="Blocs de texte et indicateur">
              <SkeletonText lines={4} />
              <p className="mt-4 flex items-center gap-2 text-ds-body text-ds-ink-600">
                <Spinner className="size-5 text-ds-brand-600" /> Chargement de vos avis…
              </p>
            </Specimen>
          </div>
        </Block>

        <Block id="onglets" title="Onglets" lead="L'onglet actif se distingue par trois indices : le trait ou la pastille, la graisse, la couleur. L'indicateur glisse en 240 ms.">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Specimen title="Onglets de page (Tabs)" className="min-w-0">
              <div data-ds-section="reseaux-sociaux">
                <TabsDemo />
              </div>
            </Specimen>
            <Specimen title={'Sélecteur à segments (Tabs variant="pill")'} note="Colonnes égales : périodes, vues.">
              <SegmentedDemo />
            </Specimen>
          </div>
        </Block>

        <Block id="generation" title="Génération longue et confirmation" lead="Pour 30 à 90 secondes d'attente : des étapes nommées, ce qui se fait, une durée annoncée, le temps écoulé — jamais un pourcentage inventé. La réussite : une coche, une onde chaude, un message.">
          <div className="grid items-start gap-5 lg:grid-cols-3">
            <Card section="reseaux-sociaux">
              <GenerationDemo
                title="Nous préparons vos contenus de décembre"
                steps={GENERATION_STEPS.map((step) => step.label)}
                detail="Légende 4 sur 8 : « Une routine du soir en 5 minutes »"
                doneMessage="Vos 8 contenus de décembre sont prêts."
              />
            </Card>
            <Card section="publications">
              <StepProgress
                title="Votre article est prêt"
                steps={[{ label: "Plan de l'article" }, { label: "Rédaction" }, { label: "Choix de l'image" }, { label: "Relecture" }]}
                current={4}
                status="done"
                elapsed={48}
                doneMessage="Article prêt à relire."
                footer={<Button size="sm">Relire l'article</Button>}
              />
            </Card>
            <Card section="fiche-google">
              <StepProgress
                title="Analyse de votre fiche"
                steps={[{ label: "Lecture de votre fiche" }, { label: "Comparaison avec les cabinets voisins" }, { label: "Plan d'action" }]}
                current={1}
                status="error"
                elapsed={31}
                errorMessage="Nous n'arrivons plus à lire votre fiche Google. Rien n'est perdu."
                footer={
                  <Button size="sm" variant="secondary">
                    Réessayer
                  </Button>
                }
              />
            </Card>
          </div>
          <Specimen title="Confirmation discrète (InlineSuccess)" note="Annoncée aux lecteurs d'écran sans prendre le focus.">
            <Replay>
              <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                <InlineSuccess>Article publié</InlineSuccess>
                <InlineSuccess size="md" detail="Il sera visible sur votre site dans quelques instants.">
                  Votre article est en ligne
                </InlineSuccess>
              </div>
            </Replay>
          </Specimen>
        </Block>

        <Block id="en-tetes" title="En-têtes de page" lead="La pastille de la section, le titre, une phrase d'usage, l'action principale. Le bandeau en dégradé profond est réservé à l'Accueil et aux moments forts.">
          <PageHeader as="h3" ambient={false} section="publications" action={<Button icon={<Plus size={18} aria-hidden />}>Proposer un sujet</Button>} />
          <PageHeader as="h3" ambient={false} section="fiche-google" action={<Button>Actualiser ma fiche</Button>} secondary={<Button variant="secondary">Voir ma fiche</Button>} />
          <PageHeader as="h3" ambient={false} section="meta-ads" tone="vivid" action={<Button variant="inverse">Lancer le diagnostic</Button>} />
          <PageHeader as="h3" ambient={false} section="academie" tone="vivid" action={<Button variant="inverse">Reprendre ma fiche</Button>} />
        </Block>
      </Stagger>
    </>
  );
}
