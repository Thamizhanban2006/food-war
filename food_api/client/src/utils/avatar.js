export function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getAvatarUrl(seedInput, size = 64) {
  const seed = encodeURIComponent(String(seedInput || "player").trim() || "player");
  // use more attractive cartoon styles
  const styles = ["adventurer", "adventurer-neutral", "avataaars", "bottts", "pixel-art"];
  const idx = hashString(seed) % styles.length;
  const style = styles[idx];
  return `https://api.dicebear.com/6.x/${style}/svg?seed=${seed}&size=${size}`;
}

export function createFallbackAvatar(name, size = 64) {
  const initials = String(name || "?").trim().split(/\s+/).map(n => n[0]?.toUpperCase() || '').slice(0,2).join('') || '?';
  // pick a color from a palette based on name hash
  const colors = ["#ff6b6b", "#ffd166", "#6bffb3", "#6bc1ff", "#c36bff", "#fda4af", "#fef08a"]
  const color = colors[hashString(name || 'fallback') % colors.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
    <rect width='100%' height='100%' rx='50%' fill='${color}' />
    <text x='50%' y='50%' dy='.36em' text-anchor='middle' font-family='Arial, Helvetica, sans-serif' font-size='${Math.floor(size/2.4)}' fill='#ffffff'>${initials}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
