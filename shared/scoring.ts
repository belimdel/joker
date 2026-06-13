// ─── Le score d'un joueur sur UNE manche ────────────────────────
// On calcule combien de points un joueur marque sur une manche, à
// partir de son enchère (bid) et du nombre de plis réellement
// remportés (tricksWon). On a aussi besoin de cardsPerPlayer pour
// détecter le cas spécial de l'enchère pleine.
//
// Barème du Joker géorgien :
//
//   • Contrat RÉUSSI (tricksWon === bid), cas général :
//        50 points par pli annoncé + 50 de bonus.
//        Ex. enchère 3, gagne 3 → 3×50 + 50 = 200.
//
//   • Contrat RÉUSSI à ENCHÈRE PLEINE (bid === cardsPerPlayer
//     ET tricksWon === bid) : le barème change.
//        100 points par pli (au lieu de 50 + 50).
//        Ex. manche 4, enchère 4, gagne 4 → 4×100 = 400.
//
//   • Contrat RATÉ (tricksWon !== bid) :
//        10 points par pli réellement gagné.
//        Ex. enchère 3, gagne 4 → 40. Enchère 4, gagne 3 → 30.
//
// Cas particuliers couverts SANS branche dédiée :
//   • « passe réussie » (enchère 0, gagne 0) : c'est un contrat
//     réussi → tombe sous la règle générale → 50×0 + 50 = 50.
//   • « passe ratée » (enchère 0, gagne des plis) : contrat raté
//     → 10 par pli. Ex. passe et gagne 2 → 20.
//
// NB : le bonus de « set » (réussir toutes ses enchères sur un set)
// et la variante « hist » (pénalité) ne sont PAS gérés ici : ce sont
// des règles de niveau partie, traitées plus tard avec l'état global.
//
// Fonction pure : entrées → sortie, aucun effet de bord.
export function computePlayerScore(
  bid: number,
  tricksWon: number,
  cardsPerPlayer: number
): number {
  // ── Garde-fou « fail fast » ──────────────────────────────────
  // scoring.ts est une fonction de CALCUL interne, pas un point de
  // validation utilisateur. On ne veut donc PAS d'un retour par
  // défaut qui masquerait un bug du moteur : on lève une Error pour
  // qu'un appel erroné explose immédiatement pendant le dev plutôt
  // que de produire un score faux silencieusement.
  if (!Number.isInteger(bid)) {
    throw new Error(`bid invalide : ${bid} (doit être un entier)`);
  }
  if (!Number.isInteger(tricksWon)) {
    throw new Error(`tricksWon invalide : ${tricksWon} (doit être un entier)`);
  }
  if (bid < 0) {
    throw new Error(`bid invalide : ${bid} (doit être ≥ 0)`);
  }
  if (tricksWon < 0) {
    throw new Error(`tricksWon invalide : ${tricksWon} (doit être ≥ 0)`);
  }
  if (bid > cardsPerPlayer) {
    throw new Error(`bid invalide : ${bid} (max ${cardsPerPlayer})`);
  }
  if (tricksWon > cardsPerPlayer) {
    throw new Error(`tricksWon invalide : ${tricksWon} (max ${cardsPerPlayer})`);
  }

  const contratReussi = tricksWon === bid;

  if (contratReussi) {
    // Enchère pleine réussie : barème spécial à 100 le pli.
    if (bid === cardsPerPlayer) {
      return bid * 100;
    }
    // Cas général réussi : 50 le pli annoncé + 50 de bonus.
    // (englobe la « passe réussie » 0/0 → 0 + 50 = 50)
    return bid * 50 + 50;
  }

  // Contrat raté : 10 points par pli réellement remporté.
  // (englobe la « passe ratée » : enchère 0 mais des plis gagnés)
  return tricksWon * 10;
}
