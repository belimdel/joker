// ─── Les enchères (bidding) ─────────────────────────────────────
// Avant de jouer une manche, chaque joueur annonce combien de plis
// il pense remporter. Deux règles encadrent ces annonces :
//
//   1. Bornes : on ne peut annoncer qu'entre 0 et le nombre de
//      cartes que l'on a en main cette manche (cardsPerPlayer).
//
//   2. Règle du donneur (« hook ») : le TOTAL des enchères ne doit
//      jamais égaler le nombre de cartes de la manche. Ainsi il est
//      mathématiquement impossible que tout le monde réussisse son
//      contrat. Seul le DERNIER enchérisseur (le donneur) subit
//      cette contrainte — c'est lui qui « ajuste » pour éviter
//      l'égalité. Les autres annoncent librement (dans les bornes).
//
// Tout est pur : on ne mute aucun argument, on ne lit aucun état
// global. Les entrées suffisent à déterminer la sortie.

// ─── Une enchère est-elle autorisée ? ───────────────────────────
// Entrées :
//   - bid : l'enchère qu'on veut tester
//   - cardsPerPlayer : nombre de cartes en main cette manche
//   - previousBids : les enchères DÉJÀ annoncées avant ce joueur
//   - isLastBidder : true si ce joueur est le donneur (dernier à parler)
export function isBidAllowed(
  bid: number,
  cardsPerPlayer: number,
  previousBids: number[],
  isLastBidder: boolean
): boolean {
  // Une enchère est un entier (pas de demi-pli).
  if (!Number.isInteger(bid)) {
    return false;
  }

  // Bornes : entre 0 et le nombre de cartes en main, inclus.
  if (bid < 0 || bid > cardsPerPlayer) {
    return false;
  }

  // Contrainte du donneur : le total ne doit pas tomber pile sur
  // le nombre de cartes de la manche.
  if (isLastBidder) {
    const total = previousBids.reduce((somme, b) => somme + b, 0) + bid;
    if (total === cardsPerPlayer) {
      return false;
    }
  }

  return true;
}

// ─── Enchère INTERDITE au donneur (dernier à parler) ────────────
// La valeur qui ferait tomber le total des enchères pile sur
// cardsPerPlayer (règle du « hook ») : elle est interdite au donneur,
// donc c'est elle qui le « force à parler ». Retourne null si cette
// valeur sort des bornes 0..cardsPerPlayer (le donneur n'a alors aucune
// contrainte). Sert à l'affichage : indiquer le chiffre grisé.
export function forbiddenLastBid(
  cardsPerPlayer: number,
  previousBids: number[]
): number | null {
  const sum = previousBids.reduce((somme, b) => somme + b, 0);
  const forbidden = cardsPerPlayer - sum;
  return forbidden >= 0 && forbidden <= cardsPerPlayer ? forbidden : null;
}

// ─── Liste des enchères autorisées ──────────────────────────────
// Pratique côté interface : on propose au joueur uniquement les
// boutons valides. On balaie 0..cardsPerPlayer et on garde ceux
// qu'isBidAllowed accepte (une seule source de vérité pour la règle).
export function allowedBids(
  cardsPerPlayer: number,
  previousBids: number[],
  isLastBidder: boolean
): number[] {
  const result: number[] = [];

  for (let bid = 0; bid <= cardsPerPlayer; bid++) {
    if (isBidAllowed(bid, cardsPerPlayer, previousBids, isLastBidder)) {
      result.push(bid);
    }
  }

  return result;
}
