// Illustration du Joker : image plein cadre servie depuis client/public/.
// Vite sert le dossier public/ à la racine → /joker_image.svg.
// Ton SVG fait 300×420 = ratio 5/7, identique à la carte : object-fit: cover
// remplit toute la carte sans rognage ni bord. Coins arrondis via
// overflow:hidden du conteneur .jk-card. Remplace le fichier
// public/joker_image.svg pour changer l'illustration, sans toucher au code.
export function JokerCardArt() {
  return (
    <img
      src="/joker_image.svg"
      alt="Joker"
      draggable={false}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}
