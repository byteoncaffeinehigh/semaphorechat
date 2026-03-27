const CANVAS_SIZE = 440;

const ASSETS: Record<string, string[]> = {
  background: ["Boom.png", "Bricks.png", "Solid.png"],
  body: ["Muscle shirt.png", "Necklace.png", "Plain.png", "Print.png", "Super hero.png", "Sweater.png"],
  eyebrows: ["Angry.png", "Formed.png", "Round.png", "Thick.png", "Thin.png", "Unsure.png"],
  eyes: ["Lashes.png", "Nice.png", "Normal.png", "Original.png", "Tired.png"],
  glasses: ["Plain.png", "Reading.png", "Sunnies.png"],
  head: ["Head.png"],
  mouth: ["Beard.png", "Line.png", "Lips.png", "Open Smile.png", "Original.png", "Smile.png"],
  pet: ["Cat.png", "Dog.png", "Fish.png", "Raptor.png"],
  top: ["Bun.png", "Cap.png", "Crazy.png", "Curly.png", "Long.png", "Mohawk.png", "Mullet.png", "Ninja.png", "Ponytail.png", "Smooth.png", "Styled.png"],
};

const COLLECTION = [
  { name: "background", top: 0,   left: 220, layer: 1 },
  { name: "head",       top: 58,  left: 220, layer: 2 },
  { name: "body",       top: 225, left: 220, layer: 3 },
  { name: "eyes",       top: 145, left: 220, layer: 4 },
  { name: "eyebrows",   top: 120, left: 220, layer: 4 },
  { name: "mouth",      top: 170, left: 220, layer: 4 },
  { name: "glasses",    top: 142, left: 220, layer: 5 },
  { name: "top",        top: 8,   left: 220, layer: 6 },
  { name: "pet",        top: 210, left: 0,   layer: 6 },
];

function pick(arr: string[], seed: number): string {
  return arr[seed % arr.length];
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface AvatarSeed {
  background: number;
  body: number;
  eyebrows: number;
  eyes: number;
  glasses: number;
  head: number;
  mouth: number;
  pet: number;
  top: number;
}

export function randomSeed(): AvatarSeed {
  const r = () => Math.floor(Math.random() * 100);
  return { background: r(), body: r(), eyebrows: r(), eyes: r(), glasses: r(), head: r(), mouth: r(), pet: r(), top: r() };
}

export async function generateAvatar(seed: AvatarSeed = randomSeed()): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;

  const layers = [...COLLECTION].sort((a, b) => a.layer - b.layer);

  for (const layer of layers) {
    const files = ASSETS[layer.name];
    const file = pick(files, seed[layer.name as keyof AvatarSeed]);
    const src = `/avatar-assets/${layer.name}/${file}`;
    try {
      const img = await loadImg(src);
      const leftPadding = layer.left - img.naturalWidth / 2;
      ctx.drawImage(img, leftPadding, layer.top);
    } catch {
      // skip missing asset
    }
  }

  return canvas.toDataURL("image/png");
}
