// 3D viewer presets: sample models, material and lighting options.
export interface ThreeDModelOption {
  id: string;
  name: string;
  category: 'character' | 'product' | 'hardware' | 'trophy';
  influencerName: string;
  tagline: string;
  polyCount: string;
  vertices: string;
  textures: string;
  primaryColor: string;
  glowColor: string;
}

export const MODEL_PRESETS: ThreeDModelOption[] = [
  {
    id: 'sophia-cyber',
    name: 'Sophia Chen - Cyber Avatar Spec v4',
    category: 'character',
    influencerName: 'Sophia Chen',
    tagline: 'Hyper-detailed 3D virtual presenter mesh with procedural facial node rig.',
    polyCount: '48,200 Polys',
    vertices: '24,150 Verts',
    textures: '4K PBR Metallic/Roughness',
    primaryColor: '#6366f1', // Indigo
    glowColor: '#38bdf8', // Sky Blue
  },
  {
    id: 'aether-glasses',
    name: 'AetherVision Pro Spatial Glasses',
    category: 'product',
    influencerName: 'Marcus Thorne',
    tagline: 'Titanium-alloy spatial smart glasses with dual optical waveguide lenses.',
    polyCount: '32,400 Polys',
    vertices: '18,200 Verts',
    textures: '4K Anisotropic Metal & Glass',
    primaryColor: '#ec4899', // Pink
    glowColor: '#a855f7', // Purple
  },
  {
    id: 'genesis-core',
    name: 'Genesis AI Autonomous Server Pod',
    category: 'hardware',
    influencerName: 'Elena Vance',
    tagline: 'Liquid-cooled enterprise AI compute node with animated core glow.',
    polyCount: '64,100 Polys',
    vertices: '38,900 Verts',
    textures: '4K Carbon Fiber & Glass',
    primaryColor: '#10b981', // Emerald
    glowColor: '#34d399', // Mint
  },
  {
    id: 'aura-trophy',
    name: 'Aura Gold Campaign Trophy',
    category: 'trophy',
    influencerName: 'Maya Lin',
    tagline: 'Floating 3D geometric award emblem for top-performing campaigns.',
    polyCount: '19,800 Polys',
    vertices: '10,400 Verts',
    textures: '24k Gold Metallic Reflection',
    primaryColor: '#f59e0b', // Amber
    glowColor: '#fbbf24', // Yellow
  },
];

export type MaterialMode = 'pbr' | 'hologram' | 'gold' | 'glass';
export type LightingPreset = 'cyber' | 'studio' | 'sunset' | 'deepspace';

export const MATERIAL_OPTIONS: { id: MaterialMode; label: string }[] = [
  { id: 'pbr', label: 'Metallic (PBR)' },
  { id: 'hologram', label: 'Hologram wireframe' },
  { id: 'gold', label: 'Gold' },
  { id: 'glass', label: 'Glass' },
];

export const LIGHTING_OPTIONS: { id: LightingPreset; label: string; colors: [number, number, number] }[] = [
  { id: 'cyber', label: 'Neon (indigo, sky, purple)', colors: [0x6366f1, 0x38bdf8, 0xa855f7] },
  { id: 'studio', label: 'Studio white', colors: [0xffffff, 0xe2e8f0, 0x94a3b8] },
  { id: 'sunset', label: 'Sunset', colors: [0xf59e0b, 0xef4444, 0xec4899] },
  { id: 'deepspace', label: 'Deep space', colors: [0x06b6d4, 0x3b82f6, 0x10b981] },
];
