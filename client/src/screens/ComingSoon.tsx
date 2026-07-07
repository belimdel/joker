import "./screens.css";

// Pages vitrines « Coming soon » : Shop, Friends, Tournaments.
type ComingSoonProps = {
  page: "shop" | "friends" | "tournaments";
};

const CONTENT = {
  shop: {
    title: "Shop",
    icon: "🎁",
    text: "Avatars, dos de cartes et tables personnalisées arrivent bientôt.",
    tiles: [
      ["🃏", "Dos de cartes"],
      ["🧑‍🎨", "Avatars"],
      ["🟩", "Tables"],
      ["👑", "VIP"],
    ],
  },
  friends: {
    title: "Friends",
    icon: "👥",
    text: "Ajoute tes amis, invite-les à ta table et suis leurs parties.",
    tiles: [
      ["✉️", "Invitations"],
      ["🎮", "Jouer ensemble"],
      ["🟢", "En ligne"],
      ["🏅", "Comparer les stats"],
    ],
  },
  tournaments: {
    title: "Tournaments",
    icon: "🏆",
    text: "Championnats hebdomadaires avec prix et classements par région.",
    tiles: [
      ["🇪🇺", "EU Weekly"],
      ["🌍", "World Cup"],
      ["🎟️", "Tickets"],
      ["💰", "Prizes"],
    ],
  },
} as const;

export function ComingSoon({ page }: ComingSoonProps) {
  const c = CONTENT[page];
  return (
    <div className="jk-soonpage">
      <h1 className="jk-soonpage__title jk-fade-up">{c.title}</h1>
      <div className="jk-soonpage__hero jk-fade-up">
        <span className="jk-soonpage__icon">{c.icon}</span>
        <span className="jk-soonpage__big">Coming soon</span>
        <span className="jk-soonpage__text">{c.text}</span>
      </div>
      <div className="jk-soonpage__grid jk-fade-up">
        {c.tiles.map(([icon, label]) => (
          <div key={label} className="jk-soonpage__tile">
            <span>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
