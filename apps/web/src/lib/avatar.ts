const ENDPOINT = "https://api.dicebear.com/9.x/micah/svg";

/**
 * DiceBear picks one of each list by seed. They are narrowed to the ink and the
 * off-whites of the app so a canvas full of faces doesn't turn into confetti.
 */
const PALETTE = {
  backgroundColor: "ecebe4,e6e2d6,eae6dc,f0ece2,e4e4dc",
  hairColor: "16150f,4a4437,6e6c63",
  shirtColor: "d9d3c5,c8c1af,b9b2a0",
  baseColor: "f2dfc9,e6cdb0,d3ac89",
};

/**
 * The face an agent gets. Seeded by node id rather than by name so renaming a
 * role doesn't hand it a different face.
 */
export function avatarUrl(seed: string): string {
  const params = new URLSearchParams({
    ...PALETTE,
    seed: seed || "agente",
    radius: "50",
    scale: "115",
    earringsProbability: "0",
  });
  return `${ENDPOINT}?${params.toString()}`;
}
