// Procedural item "containment sigils". Every artifact gets a unique, stable
// emblem derived from its id — a rarity-shaped frame around a deterministic
// glyph of arcs, spokes, and nodes. No art assets; pure SVG. Shared by the
// overlay (loot pops) and the companion (stash + collection).
(function () {
  const RARITY = {
    scrap: { color: '#9a9a8e', frame: 'square' },
    common: { color: '#7fd47f', frame: 'circle' },
    rare: { color: '#5fb7ff', frame: 'hex' },
    anomalous: { color: '#ff9d3c', frame: 'burst' },
  };

  // tiny deterministic hash → 32-bit
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  function framePath(frame) {
    switch (frame) {
      case 'square':
        return '<rect x="8" y="8" width="84" height="84" rx="6" />';
      case 'hex':
        return '<polygon points="50,6 90,28 90,72 50,94 10,72 10,28" />';
      case 'burst': {
        let pts = [];
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const r = i % 2 ? 30 : 46;
          pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" />`;
      }
      default:
        return '<circle cx="50" cy="50" r="42" />';
    }
  }

  // Build the inner glyph: a few seeded spokes + arcs + nodes.
  function glyph(rand, color) {
    const cx = 50, cy = 50;
    let g = '';
    const spokes = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + rand() * 0.5;
      const r1 = 6 + rand() * 8;
      const r2 = 22 + rand() * 12;
      g += `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}" />`;
      if (rand() < 0.6) g += `<circle cx="${(cx + Math.cos(a) * r2).toFixed(1)}" cy="${(cy + Math.sin(a) * r2).toFixed(1)}" r="${(1.5 + rand() * 2).toFixed(1)}" fill="${color}" stroke="none" />`;
    }
    const rings = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < rings; i++) g += `<circle cx="${cx}" cy="${cy}" r="${(8 + rand() * 14).toFixed(1)}" fill="none" opacity="0.7" />`;
    if (rand() < 0.5) {
      const a0 = rand() * 6.28;
      g += `<path d="M ${(cx + Math.cos(a0) * 26).toFixed(1)} ${(cy + Math.sin(a0) * 26).toFixed(1)} A 26 26 0 0 1 ${(cx + Math.cos(a0 + 2) * 26).toFixed(1)} ${(cy + Math.sin(a0 + 2) * 26).toFixed(1)}" fill="none" stroke-width="3" />`;
    }
    return g;
  }

  // Returns an inline SVG string for an item. `glow` adds a rarity halo.
  window.NS_sprite = function (id, rarity, size, glow) {
    const r = RARITY[rarity] || RARITY.scrap;
    const rand = rng(hash(id || 'x'));
    size = size || 48;
    const filt = glow ? `style="filter:drop-shadow(0 0 6px ${r.color})"` : '';
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" ${filt} aria-hidden="true">
      <g fill="rgba(0,0,0,0.35)" stroke="${r.color}" stroke-width="2.5" stroke-linejoin="round">${framePath(r.frame)}</g>
      <g stroke="${r.color}" stroke-width="2" stroke-linecap="round">${glyph(rand, r.color)}</g>
    </svg>`;
  };

  window.NS_rarityColor = function (rarity) {
    return (RARITY[rarity] || RARITY.scrap).color;
  };
})();
