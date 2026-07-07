// Avatar « carte » à initiales : couleur pastel déterministe dérivée du
// pseudo (même joueur = même visage partout, zéro dépendance externe).

const PALETTE = [
  ["#f2a65a", "#d9822b"],
  ["#7fb069", "#5a8f47"],
  ["#6c91bf", "#4a6fa5"],
  ["#b56dab", "#94508b"],
  ["#e0777d", "#c4565c"],
  ["#5fb0a5", "#3f8f84"],
  ["#c9a227", "#a68417"],
  ["#8d7bd4", "#6c5ab3"],
];

function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

type AvatarProps = {
  name: string | null; // null = siège vide
  size?: number; // côté court en px (l'avatar est une « carte » 1:1.25)
};

export function Avatar({ name, size = 44 }: AvatarProps) {
  const style = {
    width: size,
    height: Math.round(size * 1.25),
    fontSize: Math.round(size * 0.42),
  };

  if (!name) {
    return <span className="jk-avatar jk-avatar--empty" style={style} />;
  }

  const [top, bottom] = PALETTE[hashOf(name) % PALETTE.length];
  return (
    <span
      className="jk-avatar"
      style={{ ...style, background: `linear-gradient(180deg, ${top}, ${bottom})` }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
