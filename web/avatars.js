// Pixel-art employee avatars. Deterministic from the login: skin tone, hair
// color + style, shirt/tie or blouse. Base look is standard office attire;
// cosmetics (found on shifts) render as overlays. Pure SVG rects — crisp at
// any size, no assets.
(function () {
  const SKIN = ['#f2c9a0', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a06a42'];
  const HAIR = ['#2b2118', '#4a3220', '#7a5230', '#1a1a22', '#5b1f1f', '#888078', '#d9b380', '#3d2b4f'];
  const SHIRT_M = ['#dfe5ea', '#c7d6e8', '#d8d2c2', '#bcd0c4'];
  const SHIRT_F = ['#d8c7e8', '#e8c7c7', '#c7e8df', '#e3d9bd', '#c7d6e8'];
  const TIE = ['#8c2f2f', '#2f4f8c', '#2f6b3a', '#6b2f6b', '#8c6a2f'];
  const PANTS = ['#3a3f48', '#2c2c34', '#4a4036'];

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 12 wide × 16 tall. Rows 0-2 are headroom for hats; body starts row 2.
  // Legend: S skin, H hair, E eye, W shirt/blouse, T tie/buttons, A arms(shirt),
  //         P pants, K shoes, . empty
  const BASE_M = [
    '............',
    '............',
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HSSSSSSH..',
    '..SSESSESS..',
    '...SSSSSS...',
    '...SSSSSS...',
    '....SSSS....',
    '..WWWTTWWW..',
    '.AWWWTTWWWA.',
    '.AWWWTTWWWA.',
    '.A.WWWWWW.A.',
    '...PPPPPP...',
    '...PP..PP...',
    '...KK..KK...',
  ];
  const BASE_F = [
    '............',
    '............',
    '...HHHHHH...',
    '..HHHHHHHH..',
    '..HSSSSSSH..',
    '..HSESSESH..',
    '..HSSSSSSH..',
    '..HSSSSSSH..',
    '..H.SSSS.H..',
    '..WWWWWWWW..',
    '.AWWWTWWWWA.',
    '.AWWWWWWWWA.',
    '.A.WWWWWW.A.',
    '...PPPPPP...',
    '...PP..PP...',
    '...KK..KK...',
  ];

  // Cosmetic overlays: arrays of [x, y, color]. Hats sit in rows 0-2,
  // face items on the eye line (row 5) or forehead.
  const px = (x, y, c) => [x, y, c];
  const row = (x0, x1, y, c) => {
    const out = [];
    for (let x = x0; x <= x1; x++) out.push([x, y, c]);
    return out;
  };
  const COSMETIC_PIXELS = {
    paperhat: [...row(3, 8, 1, '#e8e4d8'), ...row(4, 7, 0, '#d8d2c2')],
    trafficcone: [...row(4, 7, 2, '#e87b2f'), ...row(5, 6, 1, '#e87b2f'), ...row(5, 6, 0, '#fff')],
    partyhat: [px(5, 0, '#ff5fa2'), ...row(5, 6, 1, '#5fb7ff'), ...row(4, 7, 2, '#ffd75f')],
    hardhat: [...row(3, 8, 1, '#f2c12e'), ...row(2, 9, 2, '#f2c12e'), ...row(4, 7, 0, '#d9a912')],
    beret: [...row(3, 8, 1, '#7a2430'), px(9, 1, '#7a2430'), px(6, 0, '#7a2430')],
    wardencap: [...row(3, 8, 1, '#23262e'), ...row(2, 9, 2, '#23262e'), ...row(4, 7, 0, '#3a3f48'), px(5, 2, '#ffb454'), px(6, 2, '#ffb454')],
    halo: [...row(4, 7, 0, '#6dffa6')],
    tapeglasses: [...row(3, 8, 5, '#9a9a8e'), px(5, 5, '#fff'), px(6, 5, '#9a9a8e')],
    shades: [...row(3, 8, 5, '#14161c')],
    visitorsticker: [px(3, 10, '#e8e4d8'), px(4, 10, '#e8e4d8'), px(3, 11, '#c44'), px(4, 11, '#c44')],
    monocle: [px(7, 5, '#ffd75f'), px(8, 5, '#ffd75f'), px(8, 6, '#ffd75f')],
    thirdeye: [px(5, 4, '#fff'), px(6, 4, '#5fb7ff')],
  };

  // Render an employee. cosmetics = { hat, face }.
  window.NS_avatar = function (login, gender, cosmetics, size) {
    const h = hash(login || 'employee');
    const skin = SKIN[h % SKIN.length];
    const hair = HAIR[(h >>> 3) % HAIR.length];
    const isF = gender === 'f';
    const shirt = isF ? SHIRT_F[(h >>> 6) % SHIRT_F.length] : SHIRT_M[(h >>> 6) % SHIRT_M.length];
    const tie = TIE[(h >>> 9) % TIE.length];
    const pants = PANTS[(h >>> 12) % PANTS.length];
    const eyes = '#1a1d24';
    const shoes = '#1c1c22';
    const grid = isF ? BASE_F : BASE_M;
    const colorOf = { S: skin, H: hair, E: eyes, W: shirt, T: isF ? tie : tie, A: shirt, P: pants, K: shoes };

    // hair style tweak: some logins get a flat-top / side part (drop a few hair px)
    const styleCut = (h >>> 15) % 3;

    let rects = '';
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < 12; x++) {
        let ch = grid[y][x];
        if (ch === '.') continue;
        if (ch === 'H' && styleCut === 1 && y === 2 && (x === 3 || x === 8)) continue;
        if (ch === 'H' && styleCut === 2 && y === 2) continue;
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colorOf[ch]}"/>`;
      }
    }
    // cosmetic overlays
    const overlays = [cosmetics && cosmetics.hat, cosmetics && cosmetics.face].filter(Boolean);
    for (const id of overlays) {
      for (const [x, y, c] of COSMETIC_PIXELS[id] ?? []) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
    size = size || 48;
    return `<svg viewBox="0 0 12 16" width="${size}" height="${Math.round((size * 16) / 12)}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  };
})();
