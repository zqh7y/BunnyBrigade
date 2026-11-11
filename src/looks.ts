import type { FoxKind } from './data';
import { pick } from './util';

/*
 * Every soldier gets its own look when it spawns: fur, markings, ears, clothes, hat and one accessory.
 * Rabbits all wear the brigade helmet (its colour shows the rabbit's class) but dress as they like underneath;
 * foxes dress by gang role (so a gunner still reads as a gunner) with their own colours and extras.
 */

export type RabbitOutfit = 'overalls' | 'vest' | 'jacket' | 'hoodie' | 'tank';
export type RabbitAcc = 'none' | 'scarf' | 'bandaid' | 'freckles' | 'glasses' | 'tags' | 'bandana';

export interface RabbitStyle {
  side: 'rabbit';
  fur: string;
  shade: string; // fur in shadow (far ear, far foot)
  belly: string; // muzzle and belly patch
  inner: string; // inside of the ears
  mark: 'none' | 'patch' | 'tips' | 'spots';
  markColor: string;
  ears: 'up' | 'lop' | 'tilt';
  outfit: RabbitOutfit;
  cloth: string;
  cloth2: string;
  acc: RabbitAcc;
  accColor: string;
  eye: string; // iris colour
}

export type FoxOutfit = 'tank' | 'stripes' | 'suit' | 'track' | 'leather' | 'aviator' | 'jersey' | 'ninja';
export type FoxHat = 'fedora' | 'flatcap' | 'beanie' | 'cap' | 'bowler' | 'aviator' | 'sweatband' | 'headband';
export type FoxAcc = 'none' | 'shades' | 'scar' | 'earring' | 'goldtooth' | 'eyepatch' | 'chain' | 'toothpick';

export interface FoxStyle {
  side: 'fox';
  kind: FoxKind;
  fur: string;
  shade: string;
  cream: string;
  dark: string; // ear backs and socks
  mask: boolean; // dark bandit fur round the eyes
  outfit: FoxOutfit;
  cloth: string;
  cloth2: string; // tie, stripes, collar
  hat: FoxHat;
  hatColor: string;
  band: string;
  acc: FoxAcc;
  eye: string;
}

export type Style = RabbitStyle | FoxStyle;

// ---------------------------------------------------------------- rabbits

const RABBIT_FURS: [string, string, string][] = [
  // fur, shade, belly
  ['#fbf8f3', '#e3dcd6', '#ffffff'],
  ['#f3e7d6', '#dccab3', '#fff8ee'],
  ['#e6e3ea', '#c8c3d0', '#fbfaff'],
  ['#dcc3a2', '#bfa27f', '#f6ead8'],
  ['#b99c80', '#9a7c62', '#ecdcc8'],
  ['#9b98a6', '#7d7a8a', '#e3e0ea'],
  ['#6e6474', '#554c5c', '#d8d0d8'],
  ['#e8c7a8', '#cfa784', '#fff1e2'],
];
const RABBIT_CLOTHES: Record<RabbitOutfit, [string, string][]> = {
  overalls: [
    ['#3c64c4', '#f2c84b'],
    ['#4f7a52', '#f2e6c8'],
    ['#7a4fa3', '#f6d36b'],
  ],
  vest: [
    ['#6f7d45', '#d9cfa8'],
    ['#5b6a7a', '#e8e2d6'],
    ['#8a6a3e', '#efe2c6'],
  ],
  jacket: [
    ['#c84b45', '#f2e8d8'],
    ['#2f8a7e', '#f6efe0'],
    ['#e08a2e', '#3a3448'],
  ],
  hoodie: [
    ['#7a8b99', '#5d6c79'],
    ['#e58fb0', '#c56d8f'],
    ['#4aa3d8', '#2f7fb2'],
  ],
  tank: [
    ['#f2efe8', '#c9c2b6'],
    ['#3a3448', '#8e8a99'],
    ['#e6c34a', '#a88a28'],
  ],
};
const ACC_COLORS = ['#e8484f', '#f2b840', '#4aa3d8', '#5ad66c', '#c48bff'];
const EYES = ['#2a2233', '#3b2a22', '#23324a', '#2c3a2a'];

export function rabbitStyle(): RabbitStyle {
  const [fur, shade, belly] = pick(RABBIT_FURS);
  const dark = fur === '#6e6474' || fur === '#9b98a6' || fur === '#b99c80';
  const outfit = pick(['overalls', 'overalls', 'vest', 'jacket', 'hoodie', 'tank'] as RabbitOutfit[]);
  const [cloth, cloth2] = pick(RABBIT_CLOTHES[outfit]);
  return {
    side: 'rabbit',
    fur,
    shade,
    belly,
    inner: dark ? '#e7a3b3' : '#ffb3c4',
    mark: pick(['none', 'none', 'none', 'patch', 'tips', 'spots'] as RabbitStyle['mark'][]),
    markColor: dark ? '#4a4150' : pick(['#b9a08a', '#8e8a92', '#c9a27a']),
    ears: pick(['up', 'up', 'up', 'lop', 'tilt'] as RabbitStyle['ears'][]),
    outfit,
    cloth,
    cloth2,
    acc: pick(['none', 'none', 'scarf', 'bandaid', 'freckles', 'glasses', 'tags', 'bandana'] as RabbitAcc[]),
    accColor: pick(ACC_COLORS),
    eye: pick(EYES),
  };
}

/** The rabbit on grid tiles and in the shop: always the same friendly face. */
export const ICON_RABBIT: RabbitStyle = {
  side: 'rabbit',
  fur: '#fbf8f3',
  shade: '#e3dcd6',
  belly: '#ffffff',
  inner: '#ffb3c4',
  mark: 'none',
  markColor: '#b9a08a',
  ears: 'up',
  outfit: 'overalls',
  cloth: '#3c64c4',
  cloth2: '#f2c84b',
  acc: 'none',
  accColor: '#e8484f',
  eye: '#2a2233',
};

// ---------------------------------------------------------------- foxes

const FOX_FURS: [string, string, string, string][] = [
  // fur, shade, cream, dark
  ['#ec7a2f', '#c96226', '#fff1e2', '#3d2c2c'],
  ['#e0612c', '#b94b22', '#fff0e0', '#3a2626'],
  ['#c9542b', '#a44322', '#f9e6d6', '#33221f'],
  ['#d9893f', '#b86f31', '#fff4e4', '#45322a'],
  ['#a7a2ad', '#8a8592', '#f4f2f6', '#3b3844'],
  ['#9a6a4a', '#7e553a', '#f1e2d2', '#33241e'],
];

interface Wardrobe {
  outfits: FoxOutfit[];
  hats: FoxHat[];
  cloth: [string, string][];
  hatColors: string[];
  accs: FoxAcc[];
}

/** Each gang role keeps its silhouette (hat and outfit type) so the player can read who is who. */
const WARDROBE: Record<FoxKind, Wardrobe> = {
  thug: {
    outfits: ['tank', 'stripes'],
    hats: ['flatcap', 'beanie'],
    cloth: [
      ['#d9d4cc', '#c84b45'],
      ['#4a4e5c', '#e8b84a'],
      ['#6d7a4e', '#d9d4cc'],
      ['#3a4a6e', '#f2efe8'],
    ],
    hatColors: ['#34303d', '#5b4a3a', '#7a3a3a', '#3f5a4a'],
    accs: ['none', 'scar', 'earring', 'toothpick', 'eyepatch'],
  },
  gunner: {
    outfits: ['suit'],
    hats: ['fedora'],
    cloth: [
      ['#4b3c34', '#d8343b'],
      ['#2f3242', '#e8b84a'],
      ['#3f4a3a', '#c84b45'],
      ['#5a4a6a', '#f2efe8'],
    ],
    hatColors: ['#5b4433', '#2b2b33', '#4a4a56', '#6a5a44'],
    accs: ['none', 'shades', 'scar', 'goldtooth', 'toothpick'],
  },
  sprayer: {
    outfits: ['track'],
    hats: ['cap'],
    cloth: [
      ['#2f6a52', '#f2efe8'],
      ['#6a3a8a', '#f6d36b'],
      ['#2a5a8a', '#ffffff'],
      ['#8a2f3a', '#f2efe8'],
    ],
    hatColors: ['#2e4a3c', '#e8484f', '#2b2b33', '#f2b840'],
    accs: ['none', 'shades', 'shades', 'earring', 'chain'],
  },
  brute: {
    outfits: ['leather'],
    hats: ['bowler'],
    cloth: [
      ['#3a3442', '#9a9aa6'],
      ['#4a2f2a', '#c9a24c'],
      ['#2f2f36', '#d8343b'],
    ],
    hatColors: ['#2b2b33', '#3f3530', '#4a2f2a'],
    accs: ['chain', 'scar', 'eyepatch', 'none'],
  },
  bomber: {
    outfits: ['aviator'],
    hats: ['aviator'],
    cloth: [
      ['#7a5236', '#efe6d5'],
      ['#4a5a3a', '#e8dcc4'],
      ['#5a4a3a', '#f2ece2'],
    ],
    hatColors: ['#6a4a32', '#4a3a2e', '#5a5a48'],
    accs: ['none', 'scar', 'goldtooth'],
  },
  runner: {
    outfits: ['jersey'],
    hats: ['sweatband'],
    cloth: [
      ['#f2efe8', '#e8484f'],
      ['#f6d36b', '#2a5a8a'],
      ['#9ad46a', '#2b2b33'],
      ['#6ab0e8', '#f2efe8'],
    ],
    hatColors: ['#ffffff', '#f6d36b', '#e8484f'],
    accs: ['none', 'earring', 'shades'],
  },
  ninja: {
    outfits: ['ninja'],
    hats: ['headband'],
    cloth: [
      ['#23212b', '#d8343b'],
      ['#2b2f45', '#e8b84a'],
      ['#3a2433', '#9ad46a'],
    ],
    hatColors: ['#d8343b', '#e8b84a', '#6ab0e8'],
    accs: ['none', 'scar', 'eyepatch'],
  },
  boss: {
    outfits: ['suit'],
    hats: ['fedora'],
    cloth: [['#7a1f33', '#ffcf3f']],
    hatColors: ['#6a2034'],
    accs: ['goldtooth'],
  },
};

export function foxStyle(kind: FoxKind): FoxStyle {
  const [fur, shade, cream, dark] = kind === 'boss' ? FOX_FURS[2] : pick(FOX_FURS);
  const w = WARDROBE[kind];
  const [cloth, cloth2] = pick(w.cloth);
  return {
    side: 'fox',
    kind,
    fur,
    shade,
    cream,
    dark,
    mask: kind === 'boss' || kind === 'ninja' || Math.random() < 0.35,
    outfit: pick(w.outfits),
    cloth,
    cloth2,
    hat: pick(w.hats),
    hatColor: pick(w.hatColors),
    band: kind === 'boss' ? '#ffcf3f' : pick(['#d8343b', '#e8b84a', '#2b2b33', '#f2efe8']),
    acc: pick(w.accs),
    eye: pick(['#f2c84b', '#9ad46a', '#e8843a', '#6ab0e8']),
  };
}
