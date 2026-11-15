// Emberworks look plan, in one place. A warm foundry at dusk: dark iron, hot ember
// orange for the attackers and the furnace, cold steel blue for the defenders. The
// lighting builds every shade the game needs, so no other colour appears in the code.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#191410',
  surface: '#2b241b',
  hairline: '#453a2c',
  ink: '#f4eee1',
  muted: '#ab9d86',
  accent: '#ff7a1a',
  ember: '#ff5a00',
  steel: '#7fb2d9',
  brass: '#d9a441',
  danger: '#e5484d',
  good: '#46a758',
};

export function shade(name) {
  return PALETTE[name];
}
