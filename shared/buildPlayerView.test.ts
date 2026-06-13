import { buildPlayerView } from "./views";
import { createGame, GameState } from "./game";
import { Card } from "./cards";
import { check } from "./test-utils";

const c = (suit: any, rank: any): Card => ({ type: "normal", suit, rank });

console.log("══════ Vue déterministe (mains connues et distinctes) ══════");
// On part d'une vraie partie puis on impose des mains distinctes par
// couleur : joueur 0 = pique, 1 = cœur, 2 = carreau, 3 = trèfle. L'atout
// est un pique (carte publique) pour garder l'invariant « la vue du
// joueur 0 ne contient QUE du pique ».
const base = createGame(4);
const known: GameState = {
  ...base,
  round: {
    ...base.round,
    phase: "bidding",
    trumpSuit: "spades",
    trumpCard: c("spades", "Q"),
    hands: [
      [c("spades", "A"), c("spades", "K")],
      [c("hearts", "A"), c("hearts", "K")],
      [c("diamonds", "A"), c("diamonds", "K")],
      [c("clubs", "A"), c("clubs", "K")],
    ],
    bids: [1, null, null, null],
    tricksWon: [0, 0, 0, 0],
    currentPlayer: 1,
    trickLeader: 0,
    currentTrick: [],
  },
};

const v0 = buildPlayerView(known, 0);

// ── Ce que le joueur 0 DOIT voir ──
check("Vue : qui regarde", v0.you, 0);
check("Vue : ma main en clair", v0.hand, [c("spades", "A"), c("spades", "K")]);
check("Vue : compte de cartes de tous", v0.handCounts, [2, 2, 2, 2]);
check("Vue : enchères publiques", v0.bids, [1, null, null, null]);
check("Vue : plis gagnés publics", v0.tricksWon, [0, 0, 0, 0]);
check("Vue : à qui le tour", v0.currentPlayer, 1);
check("Vue : atout visible", v0.trumpSuit, "spades");
check("Vue : carte d'atout visible", v0.trumpCard, c("spades", "Q"));
check("Vue : donneur visible", v0.dealerIndex, known.dealerIndex);
check("Vue : phase de manche", v0.roundPhase, "bidding");

// ── ANTI-FUITE : aucune carte adverse ne doit apparaître ──
// On sérialise la vue et on vérifie qu'aucune couleur adverse n'y est.
const json = JSON.stringify(v0);
check("Anti-fuite : pas de cœur (joueur 1) dans la vue", json.includes('"suit":"hearts"'), false);
check("Anti-fuite : pas de carreau (joueur 2) dans la vue", json.includes('"suit":"diamonds"'), false);
check("Anti-fuite : pas de trèfle (joueur 3) dans la vue", json.includes('"suit":"clubs"'), false);
check("Mes piques, eux, sont bien présents", json.includes('"suit":"spades"'), true);

console.log("\n══════ Anti-fuite sur une vraie partie (paquet mélangé) ══════");
// Preuve générique : pour CHAQUE autre joueur, aucune de ses cartes ne
// doit se retrouver dans ma vue (quel que soit le tirage aléatoire).
const g = createGame(4);
for (let viewer = 0; viewer < 4; viewer++) {
  const view = buildPlayerView(g, viewer);
  const viewJson = JSON.stringify(view);

  // Ma main correspond exactement à ma vraie main.
  const ok = JSON.stringify(view.hand) === JSON.stringify(g.round.hands[viewer]);

  // Aucune carte d'un AUTRE joueur n'apparaît dans ma vue.
  let leaked = 0;
  for (let other = 0; other < 4; other++) {
    if (other === viewer) continue;
    for (const card of g.round.hands[other]) {
      const sig =
        card.type === "normal"
          ? `"suit":"${card.suit}","rank":"${card.rank}"`
          : `"id":"${card.id}"`;
      if (viewJson.includes(sig)) leaked++;
    }
  }
  check(`Joueur ${viewer} : voit sa main`, ok, true);
  check(`Joueur ${viewer} : zéro carte adverse dans sa vue`, leaked, 0);
}

console.log("\n══════ handCounts cohérent quand les mains se vident ══════");
// Après quelques cartes jouées, le compte reflète les mains réelles
// sans révéler leur contenu.
const g2 = createGame(4);
const partial: GameState = {
  ...g2,
  round: {
    ...g2.round,
    hands: [
      [c("spades", "A")],
      [],
      [c("clubs", "7"), c("clubs", "8")],
      [c("diamonds", "9")],
    ],
  },
};
const pv = buildPlayerView(partial, 2);
check("handCounts reflète les tailles réelles", pv.handCounts, [1, 0, 2, 1]);
check("Je vois ma main (joueur 2)", pv.hand, [c("clubs", "7"), c("clubs", "8")]);
