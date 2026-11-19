import type { CSSProperties } from "react";
import { clsx } from "clsx";
import { STAGE_META, type CrmStage } from "@/lib/crm/model";
import { STAGE_COLOR, STAGE_ICON, avatarTint, initialsOf } from "@/lib/crm/stage-style";

/*
 * Petites pièces communes aux écrans du CRM (pipeline, liste, fiche,
 * corbeille). Sans état ni script : elles se rendent aussi bien côté serveur
 * que dans un composant client. Leurs styles sont dans globals.css (.crm-*).
 */

const BADGE: Record<"xs" | "sm" | "md" | "lg", { box: string; icon: number }> = {
  xs: { box: "h-5 w-5", icon: 11 },
  sm: { box: "h-6 w-6", icon: 13 },
  md: { box: "h-9 w-9", icon: 18 },
  lg: { box: "h-11 w-11", icon: 22 },
};

/** Pastille d'une étape : son icône sur son dégradé. Décorative, le libellé voisin porte le sens. */
export function StageIcon({ stage, size = "sm", className }: { stage: CrmStage; size?: keyof typeof BADGE; className?: string }) {
  const Icon = STAGE_ICON[stage];
  return (
    <span aria-hidden style={{ "--stage": STAGE_COLOR[stage] } as CSSProperties} className={clsx("crm-stage-badge inline-grid shrink-0 place-items-center rounded-full", BADGE[size].box, className)}>
      <Icon size={BADGE[size].icon} strokeWidth={2.4} />
    </span>
  );
}

/** Étape en toutes lettres, avec sa pastille : la couleur ne porte jamais le sens à elle seule. */
export function StagePill({ stage, className }: { stage: CrmStage; className?: string }) {
  return (
    <span style={{ "--stage": STAGE_COLOR[stage] } as CSSProperties} className={clsx("crm-stage-pill inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-ink-900", className)}>
      <StageIcon stage={stage} size="xs" />
      {STAGE_META[stage].label}
    </span>
  );
}

const AVATAR: Record<"sm" | "md" | "lg", string> = {
  sm: "h-8 w-8 text-[0.7rem]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

/** Initiales du prospect sur une teinte qui lui reste attachée. */
export function Avatar({ contact, size = "sm", className }: { contact: { firstName: string; lastName: string; company: string }; size?: keyof typeof AVATAR; className?: string }) {
  return (
    <span aria-hidden style={avatarTint(contact)} className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight", AVATAR[size], className)}>
      {initialsOf(contact)}
    </span>
  );
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Chiffre clé animé : à l'arrivée, chaque chiffre roule de 0 jusqu'à sa valeur,
 * une fois ; quand la valeur change, il roule de nouveau. Tout en CSS, absent
 * en mouvement réduit. Les lecteurs d'écran lisent le nombre en clair.
 */
export function Odometer({ text, className }: { text: string; className?: string }) {
  let rank = 0;
  return (
    <span className={clsx("inline-block", className)}>
      <span className="sr-only">{text}</span>
      <span key={text} aria-hidden className="crm-odo">
        {Array.from(text).map((char, index) =>
          char >= "0" && char <= "9" ? (
            <span key={index} className="crm-odo-col" style={{ "--d": Number(char), "--i": rank++ } as CSSProperties}>
              <span className="invisible">{char}</span>
              <span className="crm-odo-strip">
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={index}>{char}</span>
          ),
        )}
      </span>
    </span>
  );
}
