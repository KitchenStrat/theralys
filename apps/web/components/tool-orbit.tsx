"use client";

import { useRef, type CSSProperties } from "react";
import { Brand } from "./brand";
import { MEDIA, ScrollTrigger, gsap, useGSAP } from "./motion/gsap";
import { TOOLS } from "./tools";

/*
 * Les outils en orbite autour de Harmony, à la manière des anneaux de Saturne.
 *
 * La scène est dessinée en perspective : des anneaux en bandes (pleins devant,
 * plus pâles derrière), des poussières qui tournent plus vite près de la
 * planète que loin d'elle, et les pastilles des outils, qui glissent dans le
 * sillon entre deux bandes — devant la sphère sur la moitié proche, derrière
 * sur la moitié lointaine. Chaque pastille tire derrière elle une traînée à sa
 * couleur ; quand elle passe au plus près, la planète lui répond d'une onde.
 *
 * Le mouvement vit avec le lecteur : le plan des anneaux s'incline sous le
 * pointeur, l'orbite s'emballe quand on fait défiler la page puis retrouve son
 * allure, et tout s'arrête en douceur le temps de viser une pastille. Au
 * clavier, la pastille qui reçoit le focus vient se placer devant.
 *
 * Deux calques `<canvas>` (derrière et devant la sphère) portent les anneaux,
 * les poussières et les traînées ; la sphère et les pastilles restent du
 * HTML : le mot-marque est net, les pastilles sont de vrais liens. Sans
 * mouvement (`prefers-reduced-motion`), la scène est posée, immobile. Les
 * dimensions viennent de la feuille de style (variables de `.saturn`).
 */

const TAU = Math.PI * 2;
/** Un tour des pastilles, en secondes. */
const PERIOD = 34;
/** Longueur d'une traînée, en radians, à l'allure de croisière. */
const TRAIL = 0.85;
const TRAIL_STEPS = 16;
/** Durée de l'onde que la planète émet au passage d'un outil, en secondes. */
const PULSE = 1.5;

/** Bandes des anneaux : rayons intérieur et extérieur (1 = l'orbite des pastilles) et opacité. */
const BANDS: readonly { from: number; to: number; alpha: number }[] = [
  { from: 0.64, to: 0.75, alpha: 0.08 },
  { from: 0.78, to: 0.965, alpha: 0.2 },
  { from: 1.035, to: 1.15, alpha: 0.14 },
];
/** Filets : bords des bandes, sillon des pastilles (le plus net) et anneau extérieur. */
const LINES: readonly { at: number; alpha: number; width: number }[] = [
  { at: 0.64, alpha: 0.18, width: 0.75 },
  { at: 0.78, alpha: 0.34, width: 0.75 },
  { at: 0.965, alpha: 0.38, width: 0.75 },
  { at: 1, alpha: 0.78, width: 1.25 },
  { at: 1.035, alpha: 0.38, width: 0.75 },
  { at: 1.15, alpha: 0.3, width: 0.75 },
  { at: 1.2, alpha: 0.22, width: 0.75 },
];

type Palette = { line: string; band: string; dust: readonly string[] };
const PALETTES: Record<"dark" | "light", Palette> = {
  dark: { line: "255 255 255", band: "191 229 251", dust: ["255 255 255", "191 229 251", "255 236 205"] },
  light: { line: "14 151 221", band: "14 151 221", dust: ["14 151 221", "91 79 201", "47 109 211"] },
};

type Dust = { radius: number; angle: number; speed: number; size: number; alpha: number; tone: number; phase: number };

/** Générateur déterministe : les poussières sont les mêmes à chaque visite. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poussières des anneaux : réparties dans les bandes, plus rapides près de la planète (troisième loi de Kepler). */
function createDust(count: number): Dust[] {
  const random = seeded(20261121);
  return Array.from({ length: count }, () => {
    const lane = random();
    const band = lane < 0.14 ? BANDS[0]! : lane < 0.66 ? BANDS[1]! : BANDS[2]!;
    const radius = band.from + (band.to - band.from) * random();
    return {
      radius,
      angle: random() * TAU,
      speed: 0.11 * radius ** -1.5,
      size: 0.6 + random() * 1.4,
      alpha: 0.35 + random() * 0.65,
      tone: Math.floor(random() * 3),
      phase: random() * TAU,
    };
  });
}

/** « #23A381 » → « 35 163 129 », éclairci vers le blanc de `lift` (0 à 1). */
function rgb(hex: string, lift = 0): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * lift);
  return `${mix((value >> 16) & 255)} ${mix((value >> 8) & 255)} ${mix(value & 255)}`;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

export function ToolOrbit({ className = "", style, onDark = false }: { className?: string; style?: CSSProperties; onDark?: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const host = root.current;
      if (!host) return;
      const stage = host.querySelector<HTMLElement>(".saturn-stage");
      const gauge = host.querySelector<HTMLElement>(".saturn-gauge");
      const planet = host.querySelector<HTMLElement>(".saturn-planet");
      const rim = host.querySelector<HTMLElement>(".saturn-rim");
      const back = host.querySelector<HTMLCanvasElement>(".saturn-canvas--back");
      const front = host.querySelector<HTMLCanvasElement>(".saturn-canvas--front");
      const items = gsap.utils.toArray<HTMLElement>(".saturn-item", host);
      const backCtx = back?.getContext("2d");
      const frontCtx = front?.getContext("2d");
      if (!stage || !gauge || !planet || !back || !front || !backCtx || !frontCtx || items.length === 0) return;

      const palette = PALETTES[onDark ? "dark" : "light"];
      const count = items.length;
      // Couleur de chaque outil, éclaircie sur fond sombre pour rester lisible sur la vidéo
      const tones = TOOLS.map((tool) => rgb(tool.colors.from, onDark ? 0.45 : 0));
      const geometry = { width: 0, height: 0, cx: 0, cy: 0, rx: 0, ry: 0, planet: 0, tilt: 0, ratio: 1 };
      // angle : position de l'orbite ; speed : allure (1 = croisière) ; boost : élan donné par le défilement ;
      // spread, ring, dust : avancement de l'entrée ; px, py : pointeur, de -1 à 1
      const state = { angle: 0.6, speed: 1, boost: 0, spread: 1, ring: 1, dust: 1, px: 0, py: 0 };
      const dust = createDust(window.matchMedia("(min-width: 1024px)").matches ? 240 : 120);
      let dustClock = 0;
      const pulses: { tone: string; born: number }[] = [];
      const laps = new Array<number | null>(count).fill(null);
      let settled = false;

      const measure = () => {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        geometry.width = back.clientWidth;
        geometry.height = back.clientHeight;
        geometry.cx = geometry.width / 2;
        geometry.cy = geometry.height / 2;
        geometry.rx = gauge.offsetWidth / 2;
        geometry.ry = gauge.offsetHeight / 2;
        geometry.planet = planet.offsetWidth / 2;
        geometry.tilt = ((Number.parseFloat(getComputedStyle(host).getPropertyValue("--tilt")) || -6) * Math.PI) / 180;
        geometry.ratio = ratio;
        for (const canvas of [back, front]) {
          canvas.width = Math.round(geometry.width * ratio);
          canvas.height = Math.round(geometry.height * ratio);
        }
      };

      /** Dessine la scène à l'instant `time` (secondes) : anneaux, poussières, traînées, ondes, puis place les pastilles. */
      const render = (time: number, still = false) => {
        const { width, height, cx, cy, rx, planet: planetRadius, ratio } = geometry;
        if (width === 0 || rx === 0) return;
        // Le plan des anneaux suit le pointeur : il pivote un peu et s'ouvre ou se referme
        const tilt = geometry.tilt + state.px * 0.05;
        const ry = geometry.ry * (1 + state.py * 0.24);
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const grow = 0.62 + 0.38 * state.ring;
        const big = (width + height) * 2;

        for (const ctx of [backCtx, frontCtx]) {
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          ctx.clearRect(0, 0, width, height);
        }

        // ── Anneaux : bandes pleines et filets, une moitié par calque ──
        for (const [ctx, near] of [[backCtx, false], [frontCtx, true]] as const) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tilt);
          ctx.beginPath();
          ctx.rect(-big, near ? 0 : -big, big * 2, big);
          ctx.clip();
          const depth = (near ? 1 : 0.6) * state.ring;
          for (const band of BANDS) {
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * band.to * grow, ry * band.to * grow, 0, 0, TAU);
            ctx.ellipse(0, 0, rx * band.from * grow, ry * band.from * grow, 0, 0, TAU);
            ctx.fillStyle = `rgb(${palette.band} / ${band.alpha * depth})`;
            ctx.fill("evenodd");
          }
          for (const line of LINES) {
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * line.at * grow, ry * line.at * grow, 0, 0, TAU);
            ctx.strokeStyle = `rgb(${palette.line} / ${line.alpha * depth})`;
            ctx.lineWidth = line.width;
            ctx.stroke();
          }
          ctx.restore();
        }

        // ── Poussières ──
        if (state.dust > 0.01) {
          for (const grain of dust) {
            const angle = grain.angle + grain.speed * dustClock;
            const depth = Math.sin(angle);
            const x = Math.cos(angle) * rx * grain.radius * grow;
            const y = depth * ry * grain.radius * grow;
            const nearness = (depth + 1) / 2;
            const twinkle = still ? 1 : 0.72 + 0.28 * Math.sin(time * 1.7 + grain.phase);
            const ctx = depth < 0 ? backCtx : frontCtx;
            ctx.beginPath();
            ctx.arc(cx + x * cos - y * sin, cy + x * sin + y * cos, grain.size * (0.65 + 0.35 * nearness), 0, TAU);
            ctx.fillStyle = `rgb(${palette.dust[grain.tone]} / ${grain.alpha * (0.4 + 0.6 * nearness) * twinkle * state.dust})`;
            ctx.fill();
          }
        }

        // ── Ondes de la planète, derrière elle : seul ce qui dépasse de la sphère se voit ──
        for (let i = pulses.length - 1; i >= 0; i--) {
          const pulse = pulses[i]!;
          const progress = (time - pulse.born) / PULSE;
          if (progress >= 1) {
            pulses.splice(i, 1);
            continue;
          }
          const fade = (1 - progress) ** 2;
          backCtx.beginPath();
          backCtx.arc(cx, cy, planetRadius * (1.03 + 0.62 * (1 - (1 - progress) ** 3)), 0, TAU);
          backCtx.strokeStyle = `rgb(${pulse.tone} / ${0.6 * fade})`;
          backCtx.lineWidth = 0.75 + 2.25 * fade;
          backCtx.stroke();
        }

        // ── Pastilles et traînées ──
        const pace = clamp01(state.speed + state.boost);
        items.forEach((item, index) => {
          // Entrée : chaque pastille quitte la planète à son tour et rejoint l'orbite en spirale
          const arrival = smooth(clamp01(state.spread * 1.45 - (index / count) * 0.45));
          const angle = state.angle + (index * TAU) / count - (1 - arrival) * 2.1;
          const reach = 0.1 + 0.9 * arrival;
          const depth = Math.sin(angle);
          const x = Math.cos(angle) * rx * reach;
          const y = depth * ry * reach;
          const nearness = ((depth + 1) / 2) ** 1.25;
          item.style.translate = `calc(-50% + ${(x * cos - y * sin).toFixed(2)}px) calc(-50% + ${(x * sin + y * cos).toFixed(2)}px)`;
          item.style.scale = (0.74 + 0.36 * nearness).toFixed(3);
          item.style.opacity = ((0.5 + 0.5 * nearness) * arrival).toFixed(3);
          item.style.zIndex = String(depth < 0 ? 2 + Math.round((depth + 1) * 6) : 12 + Math.round(depth * 8));
          // 0 à 1 à l'approche du point le plus proche : la pastille s'y pare de sa couleur (cf. `.saturn-chip`)
          item.style.setProperty("--near", smooth(clamp01((depth - 0.55) / 0.45)).toFixed(3));

          if (!still && arrival > 0.2) {
            const length = TRAIL * (0.25 + 0.75 * pace) * arrival;
            for (let step = 0; step < TRAIL_STEPS; step++) {
              const head = (step + 1) / TRAIL_STEPS;
              const from = angle - length * (1 - step / TRAIL_STEPS);
              const to = angle - length * (1 - head) + 0.004;
              const middle = Math.sin((from + to) / 2);
              const ctx = middle < 0 ? backCtx : frontCtx;
              const glow = head ** 1.7 * (middle < 0 ? 0.5 : 1) * arrival;
              ctx.lineCap = "round";
              // Un halo large et pâle sous un trait fin et vif : la traînée paraît lumineuse
              for (const [width, alpha] of [[2.5 + 7 * head, 0.16], [0.75 + 3 * head, 0.95]] as const) {
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx * reach, ry * reach, tilt, from, to);
                ctx.strokeStyle = `rgb(${tones[index]} / ${glow * alpha})`;
                ctx.lineWidth = width;
                ctx.stroke();
              }
            }
          }

          // Passage au plus près du lecteur : la planète répond d'une onde à la couleur de l'outil
          const lap = Math.floor((angle - Math.PI / 2) / TAU);
          if (settled && !still && laps[index] !== null && lap > laps[index]! && state.speed > 0.35) {
            pulses.push({ tone: tones[index]!, born: time });
            if (rim) {
              rim.style.setProperty("--rim", `rgb(${tones[index]})`);
              gsap.fromTo(rim, { opacity: 0.9 }, { opacity: 0, duration: PULSE, ease: "power2.out", overwrite: true });
            }
          }
          laps[index] = lap;
        });

        // Le reflet de la sphère se déplace avec le pointeur
        planet.style.setProperty("--lx", `${(32 + state.px * 9).toFixed(1)}%`);
        planet.style.setProperty("--ly", `${(26 + state.py * 7).toFixed(1)}%`);
      };

      measure();
      const mm = gsap.matchMedia();

      mm.add(MEDIA, (context) => {
        // ── Mouvement réduit : la scène est posée, immobile ──
        if (context.conditions?.calm) {
          Object.assign(state, { angle: 0.6, speed: 0, boost: 0, spread: 1, ring: 1, dust: 1, px: 0, py: 0 });
          const draw = () => {
            measure();
            render(0, true);
          };
          draw();
          const observer = new ResizeObserver(draw);
          observer.observe(stage);
          return () => observer.disconnect();
        }

        // ── Entrée : la sphère se pose, les anneaux s'ouvrent, les outils rejoignent l'orbite en spirale ──
        Object.assign(state, { speed: 1, spread: 0, ring: 0, dust: 0 });
        settled = false;
        const intro = gsap
          .timeline({ delay: 0.6, onComplete: () => (settled = true) })
          .fromTo(planet, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1, clearProps: "scale,opacity" }, 0)
          .to(state, { ring: 1, duration: 1.5 }, 0.1)
          .to(state, { dust: 1, duration: 1.8, ease: "power1.out" }, 0.35)
          .to(state, { spread: 1, duration: 2, ease: "power2.out" }, 0.3)
          .fromTo(state, { speed: 3.4 }, { speed: 1, duration: 2.8, ease: "power2.out" }, 0.3);

        // ── Boucle : l'orbite avance, la scène est redessinée tant qu'elle est à l'écran ──
        let visible = true;
        const watcher = new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? true), { rootMargin: "120px" });
        watcher.observe(stage);
        const tick = (time: number, delta: number) => {
          if (!visible || document.hidden) return;
          const dt = Math.min(delta, 50) / 1000;
          state.angle += (TAU / PERIOD) * (state.speed + state.boost) * dt;
          // Les poussières ne s'arrêtent jamais tout à fait : l'anneau reste vivant quand les pastilles attendent
          dustClock += dt * (1 + state.boost * 0.8);
          render(time);
        };
        gsap.ticker.add(tick);

        const resizer = new ResizeObserver(() => {
          measure();
          render(gsap.ticker.time);
        });
        resizer.observe(stage);

        // ── Défilement : l'orbite prend de l'élan, puis retrouve son allure ──
        const hero = host.closest<HTMLElement>("[data-hero]") ?? host;
        const momentum = ScrollTrigger.create({
          trigger: hero,
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => {
            const push = Math.min(3.2, Math.abs(self.getVelocity()) / 700);
            if (push <= state.boost) return;
            state.boost = push;
            gsap.to(state, { boost: 0, duration: 1.6, ease: "power2.out", overwrite: "auto" });
          },
        });

        // ── Pointeur : le plan des anneaux s'incline, le reflet de la sphère suit ──
        const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        const toX = gsap.quickTo(state, "px", { duration: 1.1, ease: "power3.out" });
        const toY = gsap.quickTo(state, "py", { duration: 1.1, ease: "power3.out" });
        const onPointer = (event: PointerEvent) => {
          const box = stage.getBoundingClientRect();
          toX(gsap.utils.clamp(-1, 1, (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2)));
          toY(gsap.utils.clamp(-1, 1, (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2)));
        };
        const onLeave = () => {
          toX(0);
          toY(0);
        };
        if (fine) {
          hero.addEventListener("pointermove", onPointer);
          hero.addEventListener("pointerleave", onLeave);
        }

        // ── Viser une pastille : l'orbite s'arrête en douceur, puis repart ──
        const chipOf = (target: EventTarget | null) => (target as Element | null)?.closest?.<HTMLElement>(".saturn-chip") ?? null;
        const hold = () => gsap.to(state, { speed: 0, duration: 0.55, ease: "power2.out", overwrite: "auto" });
        const release = () => gsap.to(state, { speed: 1, duration: 1, ease: "power2.inOut", overwrite: "auto" });
        const onOver = (event: PointerEvent) => {
          if (event.pointerType === "mouse" && chipOf(event.target)) hold();
        };
        const onOut = (event: PointerEvent) => {
          if (event.pointerType === "mouse" && chipOf(event.target) && !chipOf(event.relatedTarget)) release();
        };
        // Au clavier : la pastille qui reçoit le focus vient devant la planète, par le plus court chemin
        const onFocus = (event: FocusEvent) => {
          const chip = chipOf(event.target);
          if (!chip || !chip.matches(":focus-visible")) return;
          const index = items.findIndex((item) => item.contains(chip));
          if (index < 0) return;
          intro.progress(1);
          const current = state.angle + (index * TAU) / count;
          const turn = ((Math.PI / 2 - current) % TAU + TAU + Math.PI) % TAU - Math.PI;
          gsap.to(state, { angle: state.angle + turn, speed: 0, duration: 0.8, ease: "power3.out", overwrite: "auto" });
        };
        const onBlur = (event: FocusEvent) => {
          if (chipOf(event.target) && !chipOf(event.relatedTarget)) release();
        };
        host.addEventListener("pointerover", onOver);
        host.addEventListener("pointerout", onOut);
        host.addEventListener("focusin", onFocus);
        host.addEventListener("focusout", onBlur);

        return () => {
          gsap.ticker.remove(tick);
          watcher.disconnect();
          resizer.disconnect();
          momentum.kill();
          intro.kill();
          gsap.killTweensOf(state);
          hero.removeEventListener("pointermove", onPointer);
          hero.removeEventListener("pointerleave", onLeave);
          host.removeEventListener("pointerover", onOver);
          host.removeEventListener("pointerout", onOut);
          host.removeEventListener("focusin", onFocus);
          host.removeEventListener("focusout", onBlur);
        };
      });

      return () => mm.revert();
    },
    { scope: root, dependencies: [onDark] },
  );

  return (
    <div ref={root} data-reveal data-intro="orbit" style={style} className={`saturn ${onDark ? "saturn--dark" : ""} ${className}`}>
      <div className="saturn-stage">
        <canvas aria-hidden className="saturn-canvas saturn-canvas--back" />
        {/* Gabarit invisible : ses côtés donnent au dessin les demi-axes de l'orbite */}
        <span aria-hidden className="saturn-gauge" />
        <div aria-hidden className="saturn-planet">
          <span className="saturn-globe">
            <span className="saturn-bands" />
            <span className="saturn-shadow" />
            <span className="saturn-sheen" />
          </span>
          <span className="saturn-rim" />
          <span className="saturn-level">
            <Brand onDark />
          </span>
        </div>
        <canvas aria-hidden className="saturn-canvas saturn-canvas--front" />
        <ul aria-label="Les outils de Harmony">
          {TOOLS.map((tool, index) => (
            <li key={tool.id} className="saturn-item" style={{ "--i": index, "--n": TOOLS.length } as CSSProperties}>
              <a
                href="#outils"
                data-tool={tool.id}
                style={{ "--t-from": tool.colors.from, "--t-to": tool.colors.to } as CSSProperties}
                className="saturn-chip focus-ring inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-cream-200 bg-white p-1.5 text-sm font-semibold text-ink-900 lg:pr-3.5"
              >
                <span className="tool-chip grid h-8 w-8 place-items-center rounded-full lg:h-7 lg:w-7">
                  <tool.icon size={16} strokeWidth={2.25} aria-hidden />
                </span>
                <span className="sr-only lg:not-sr-only">{tool.short}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
