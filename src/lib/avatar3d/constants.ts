/**
 * Sofia 3D Digital Human — Constants & FACS 52 Blendshapes Specification
 * Standard ARKit 52 facial blendshapes + Viseme mappings for phoneme lip-sync
 */

export const ARKIT_BLENDSHAPES = [
  // Eye blendshapes (14)
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',

  // Jaw blendshapes (4)
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',

  // Mouth & Lip blendshapes (27)
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',

  // Brow blendshapes (5)
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',

  // Cheek & Nose & Tongue blendshapes (5)
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'noseSneerLeft',
  'noseSneerRight',
  'tongueOut',
] as const;

export type ARKitBlendshapeName = typeof ARKIT_BLENDSHAPES[number];

/**
 * Phoneme-to-Viseme mappings
 * Translates speech phonemes to weighted ARKit blendshape combinations
 */
export interface VisemeMapping {
  jawOpen: number;
  mouthFunnel?: number;
  mouthPucker?: number;
  mouthSmileLeft?: number;
  mouthSmileRight?: number;
  mouthPressLeft?: number;
  mouthPressRight?: number;
  mouthRollUpper?: number;
  mouthRollLower?: number;
  mouthClose?: number;
  tongueOut?: number;
}

export const VISEME_MAP: Record<string, VisemeMapping> = {
  // Silent / Neutral rest
  sil: { jawOpen: 0.0, mouthClose: 0.0 },
  
  // Vowel 'A' (Ah, Father) - Wide jaw opening
  aa: { jawOpen: 0.85, mouthFunnel: 0.25, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  
  // Vowel 'E' (Eh, Bed) - Moderate jaw, spread corners
  ee: { jawOpen: 0.45, mouthSmileLeft: 0.45, mouthSmileRight: 0.45, mouthStretchLeft: 0.35, mouthStretchRight: 0.35 } as VisemeMapping,
  
  // Vowel 'I' (Ee, Meet) - Narrow jaw, maximum horizontal spread
  ih: { jawOpen: 0.25, mouthSmileLeft: 0.65, mouthSmileRight: 0.65, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 } as VisemeMapping,
  
  // Vowel 'O' (Oh, Boat) - Large round funnel
  oh: { jawOpen: 0.65, mouthFunnel: 0.75, mouthPucker: 0.35 },
  
  // Vowel 'U' (Oo, Boot) - Tight pucker / circular protrusion
  ou: { jawOpen: 0.3, mouthPucker: 0.85, mouthFunnel: 0.4 },
  
  // Bilabial consonants (M, B, P) - Tight lip closure & press
  mbp: { jawOpen: 0.05, mouthClose: 0.95, mouthPressLeft: 0.8, mouthPressRight: 0.8 },
  
  // Labiodental fricatives (F, V) - Upper teeth on lower lip
  fv: { jawOpen: 0.2, mouthRollLower: 0.7, mouthUpperUpLeft: 0.2, mouthUpperUpRight: 0.2 } as VisemeMapping,
  
  // Dental / Alveolar (T, D, N, S, Z) - Partial opening with teeth contact
  tds: { jawOpen: 0.25, mouthSmileLeft: 0.3, mouthSmileRight: 0.3, mouthClose: 0.3 },
  
  // Palatal / Velar (K, G, NG) - Neutral mouth, internal tongue contact
  kg: { jawOpen: 0.4, mouthSmileLeft: 0.15, mouthSmileRight: 0.15 },
  
  // Liquid / Rhotic (L, R) - Slightly rounded, tongue elevation
  lr: { jawOpen: 0.35, mouthPucker: 0.35, mouthFunnel: 0.3, tongueOut: 0.2 },
};

/**
 * Character PBR Aesthetic Palette matching user's 3D reference image
 */
export const SOFIA_3D_PALETTE = {
  skin: {
    albedo: 0xffe8e1,
    subsurface: 0xff9999,
    roughness: 0.38,
    metalness: 0.02,
    sheen: 0.2,
  },
  hair: {
    baseColor: 0xff9ec6,       // Bubblegum / pastel pink
    highlightColor: 0xffd1e4,  // Soft highlight sheen
    roughness: 0.28,
    metalness: 0.1,
    sheen: 0.55,
  },
  hoodie: {
    baseColor: 0xf9c5d1,       // Pastel baby pink fleece
    accentWhite: 0xffffff,     // Drawstrings, bear logo, stripe accents
    roughness: 0.82,
    metalness: 0.0,
  },
  shorts: {
    baseColor: 0x18181b,       // Dark graphite / black bike shorts
    roughness: 0.65,
    metalness: 0.05,
  },
  socks: {
    baseColor: 0xffffff,       // Pure white thigh-high socks
    stripeColor: 0xf472b6,     // Dual pink varsity stripes
    roughness: 0.75,
    metalness: 0.0,
  },
  sneakers: {
    leatherWhite: 0xfdfdfd,
    pinkAccent: 0xf472b6,
    soleRubber: 0xf1f5f9,
    roughness: 0.4,
    metalness: 0.05,
  },
  eyes: {
    irisColor: 0x2563eb,       // Vibrant anime blue iris
    irisHighlight: 0x93c5fd,   // Cyan/light blue specular gradient
    scleraColor: 0xf8fafc,
    pupilColor: 0x09090b,
    corneaRoughness: 0.05,
    corneaTransmission: 0.95,
    corneaIor: 1.336,
  },
  tieRings: {
    color: 0xffffff,           // White hair tie ring capsules
    roughness: 0.25,
    metalness: 0.15,
  },
};
