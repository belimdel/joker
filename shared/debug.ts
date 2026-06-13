import { deal } from "./deal";
import { createDeck } from "./cards";

const deck = createDeck();
const r1 = deal(4, 3, 0, deck);

console.log("Mains :", JSON.stringify(r1.hands, null, 2));

const toutes = r1.hands.flat();
console.log("Nombre de cartes distribuées :", toutes.length);

const signatures = toutes.map((c) =>
  c.type === "normal" ? `${c.suit}-${c.rank}` : c.id
);
console.log("Signatures :", signatures);
console.log("Signatures uniques :", new Set(signatures).size);