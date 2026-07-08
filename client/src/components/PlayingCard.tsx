import type { CSSProperties } from "react";
import type { Card, Suit } from "@shared/cards";
import { JokerCardArt } from "./JokerCardArt";
import "./card.css";

const SUIT: Record<Suit, { glyph: string; tone: "red" | "ink" }> = {
  spades: { glyph: "♠", tone: "ink" },
  hearts: { glyph: "♥", tone: "red" },
  diamonds: { glyph: "♦", tone: "red" },
  clubs: { glyph: "♣", tone: "ink" },
};

export type PlayingCardProps = {
  card?: Card; // absent ou faceDown → dos de carte
  faceDown?: boolean;
  disabled?: boolean; // injouable (grisé)
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  dealIndex?: number; // pour l'animation de distribution échelonnée
};

// Le corner index (rang + petit symbole), répété en haut-gauche et,
// pivoté, en bas-droite — comme une vraie carte.
function Corner({ rank, glyph, place }: { rank: string; glyph: string; place: "tl" | "br" }) {
  return (
    <span className={`jk-card__corner jk-card__corner--${place}`}>
      <span className="jk-card__rank">{rank}</span>
      <span className="jk-card__suit">{glyph}</span>
    </span>
  );
}

function CardFace({ card }: { card: Card }) {
  if (card.type === "joker") {
    return (
      <span className="jk-card__joker">
        <JokerCardArt />
      </span>
    );
  }
  const s = SUIT[card.suit];
  // Valeur affichée EN GRAND au centre (rang + enseigne) pour TOUTES les
  // cartes — chiffres comme figures : la valeur est lisible d'un coup d'œil,
  // et l'index de coin reste petit (pas de chevauchement centre/coin).
  return (
    <span className={`jk-card__face jk-card__face--${s.tone}`}>
      <Corner rank={card.rank} glyph={s.glyph} place="tl" />
      <span className="jk-card__court">
        <span className="jk-card__court-letter">{card.rank}</span>
        <span className="jk-card__court-suit">{s.glyph}</span>
      </span>
      <Corner rank={card.rank} glyph={s.glyph} place="br" />
    </span>
  );
}

export function PlayingCard({
  card,
  faceDown,
  disabled,
  selected,
  onClick,
  size = "md",
  dealIndex,
}: PlayingCardProps) {
  const back = faceDown || !card;
  const isJoker = !back && card!.type === "joker";
  // Le TYPE d'élément (bouton vs div) ne doit dépendre QUE de la
  // présence d'un gestionnaire de clic, jamais de `disabled` : sinon,
  // quand une carte passe jouable ↔ injouable, React démonte/remonte
  // le nœud (changement de tag) et rejoue l'animation jk-deal pour
  // rien. `disabled` ne pilote que le rendu (classe CSS) et l'attribut
  // HTML natif, qui bloque déjà le clic sans changer de tag.
  const interactive = !!onClick && !back;
  const clickable = interactive && !disabled;

  const className = [
    "jk-card",
    `jk-card--${size}`,
    back && "jk-card--back",
    isJoker && "jk-card--joker",
    disabled && "is-disabled",
    selected && "is-selected",
    clickable && "is-clickable",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties | undefined =
    dealIndex !== undefined
      ? { animationDelay: `${dealIndex * 55}ms` }
      : undefined;

  const content = back ? (
    <span className="jk-card__back">
      <span className="jk-card__back-emblem">✦</span>
    </span>
  ) : (
    <CardFace card={card!} />
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        disabled={!clickable}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={style} aria-hidden={back}>
      {content}
    </div>
  );
}
