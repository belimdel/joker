import { rankNameForLevel, rankStarsForLevel } from "@shared/progression";

// Étoiles de rang (1 à 4 pleines sur 4).
export function RankStars({ level }: { level: number }) {
  const filled = rankStarsForLevel(level);
  return (
    <span className="jk-stars" aria-label={`${filled}/4 étoiles`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`jk-stars__star ${i <= filled ? "" : "is-off"}`}>
          {i <= filled ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

// Nom du rang (Beginner / Amateur / Pro / Master). level null = invité →
// affiché « Beginner » comme l'app de référence.
export function rankLabel(level: number | null): string {
  return rankNameForLevel(level ?? 1);
}

export function RankBadge({ level }: { level: number | null }) {
  const name = rankLabel(level);
  return (
    <span className={`jk-pill ${name === "Master" ? "jk-pill--red" : ""}`}>{name}</span>
  );
}
