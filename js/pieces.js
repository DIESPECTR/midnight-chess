import * as THREE from 'three';

function lathe(pts, segs = 36) {
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segs,
  );
}

function mesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function hash(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    hash(x0, y0) * (1 - ux) * (1 - uy)
    + hash(x0 + 1, y0) * ux * (1 - uy)
    + hash(x0, y0 + 1) * (1 - ux) * uy
    + hash(x0 + 1, y0 + 1) * ux * uy
  );
}

function fbm(x, y) {
  return noise(x, y) * 0.5 + noise(x * 2.03, y * 2.03) * 0.28 + noise(x * 4.1, y * 4.1) * 0.14;
}

function canvasTex(size, draw, color = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function woodMaps(palette) {
  const map = canvasTex(512, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const g = fbm(x * 0.018, y * 0.075);
        const ring = 0.5 + 0.5 * Math.sin((x * 0.045 + g * 5.2) * 6.2 + y * 0.01);
        const pore = noise(x * 0.45, y * 0.9);
        const t = Math.min(1, Math.max(0, ring * 0.72 + g * 0.22 + (pore - 0.5) * 0.08));
        const i = (y * n + x) * 4;
        d[i] = mix(palette[0][0], palette[1][0], t) + mix(0, palette[2][0] - palette[1][0], g);
        d[i + 1] = mix(palette[0][1], palette[1][1], t) + mix(0, palette[2][1] - palette[1][1], g);
        d[i + 2] = mix(palette[0][2], palette[1][2], t) + mix(0, palette[2][2] - palette[1][2], g);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  const rough = canvasTex(512, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 140 + fbm(x * 0.04, y * 0.09) * 90 + noise(x * 0.3, y * 0.6) * 20;
        const i = (y * n + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = Math.min(255, v);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false);
  return { map, rough };
}

function stoneMaps(kind) {
  const ivory = kind === 'ivory';
  const map = canvasTex(512, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const n1 = fbm(x * 0.012, y * 0.014);
        const n2 = fbm(x * 0.035 + 20, y * 0.02);
        const vein = Math.pow(1 - Math.abs(Math.sin((x * 0.018 + y * 0.012 + n1 * 3.4) * Math.PI)), ivory ? 10 : 7);
        const speckle = noise(x * 0.7, y * 0.7);
        let r;
        let g;
        let b;
        if (ivory) {
          r = 236 + n1 * 14 - vein * 38 - speckle * 6;
          g = 226 + n2 * 12 - vein * 42 - speckle * 5;
          b = 206 + n1 * 10 - vein * 36;
        } else {
          r = 18 + n1 * 10 + vein * 22 + speckle * 6;
          g = 16 + n2 * 8 + vein * 14;
          b = 18 + n1 * 8 + vein * 10;
        }
        const i = (y * n + x) * 4;
        d[i] = Math.min(255, Math.max(0, r));
        d[i + 1] = Math.min(255, Math.max(0, g));
        d[i + 2] = Math.min(255, Math.max(0, b));
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  const rough = canvasTex(256, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = ivory
          ? 70 + fbm(x * 0.06, y * 0.06) * 50
          : 40 + fbm(x * 0.08, y * 0.08) * 45;
        const i = (y * n + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false);
  return { map, rough };
}

function makeMats() {
  const ivory = stoneMaps('ivory');
  const ebony = stoneMaps('ebony');
  const white = new THREE.MeshPhysicalMaterial({
    color: 0xf4ead8,
    map: ivory.map,
    roughness: 0.26,
    roughnessMap: ivory.rough,
    metalness: 0.04,
    clearcoat: 0.62,
    clearcoatRoughness: 0.2,
    sheen: 0.32,
    sheenColor: new THREE.Color(0xf8ecd8),
    sheenRoughness: 0.4,
    envMapIntensity: 0.9,
  });
  const black = new THREE.MeshPhysicalMaterial({
    color: 0x1a171c,
    map: ebony.map,
    roughness: 0.2,
    roughnessMap: ebony.rough,
    metalness: 0.22,
    clearcoat: 0.78,
    clearcoatRoughness: 0.16,
    sheen: 0.12,
    sheenColor: new THREE.Color(0x2c241c),
    envMapIntensity: 1.05,
  });
  return { w: white, b: black };
}

const MATS = makeMats();

function pawn(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.28, 0], [0.28, 0.06], [0.22, 0.09],
    [0.14, 0.14], [0.12, 0.38], [0.15, 0.42], [0.11, 0.46],
  ]), mat));
  const head = mesh(new THREE.SphereGeometry(0.145, 28, 20), mat);
  head.position.y = 0.58;
  g.add(head);
  return g;
}

function rook(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.30, 0], [0.30, 0.07], [0.24, 0.11],
    [0.18, 0.16], [0.17, 0.58], [0.22, 0.62], [0.22, 0.72],
    [0.18, 0.72], [0.18, 0.66], [0, 0.66],
  ]), mat));
  const merlon = new THREE.BoxGeometry(0.1, 0.12, 0.08);
  for (let i = 0; i < 4; i++) {
    const m = mesh(merlon, mat);
    const a = (i * Math.PI) / 2;
    m.position.set(Math.cos(a) * 0.2, 0.78, Math.sin(a) * 0.2);
    g.add(m);
  }
  return g;
}

function knight(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.30, 0], [0.30, 0.07], [0.22, 0.11],
    [0.16, 0.18], [0.15, 0.36], [0.18, 0.42],
  ]), mat));

  const chest = mesh(new THREE.BoxGeometry(0.22, 0.32, 0.28), mat);
  chest.position.set(0, 0.54, 0.02);
  chest.rotation.x = -0.25;
  g.add(chest);

  const neck = mesh(new THREE.BoxGeometry(0.16, 0.28, 0.18), mat);
  neck.position.set(0, 0.74, 0.08);
  neck.rotation.x = -0.55;
  g.add(neck);

  const head = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), mat);
  head.position.set(0, 0.9, 0.16);
  head.rotation.x = 0.15;
  g.add(head);

  const snout = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), mat);
  snout.position.set(0, 0.84, 0.32);
  g.add(snout);

  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.045, 0.12, 8), mat);
    ear.position.set(side * 0.055, 1.02, 0.08);
    ear.rotation.x = -0.3;
    g.add(ear);
  }
  return g;
}

function bishop(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.28, 0], [0.28, 0.06], [0.21, 0.1],
    [0.13, 0.16], [0.12, 0.48], [0.16, 0.54], [0.1, 0.58],
    [0.14, 0.72], [0.1, 0.88], [0.04, 0.96], [0, 0.96],
  ]), mat));
  const tip = mesh(new THREE.SphereGeometry(0.055, 16, 12), mat);
  tip.position.y = 1.02;
  g.add(tip);
  const slit = mesh(
    new THREE.BoxGeometry(0.02, 0.16, 0.12),
    new THREE.MeshPhysicalMaterial({ color: 0x0c0b0a, roughness: 0.55, metalness: 0.05 }),
  );
  slit.position.set(0, 0.82, 0.08);
  slit.rotation.x = -0.35;
  g.add(slit);
  return g;
}

function queen(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.31, 0], [0.31, 0.07], [0.23, 0.11],
    [0.14, 0.18], [0.13, 0.52], [0.18, 0.58], [0.12, 0.64],
    [0.16, 0.78], [0.2, 0.92], [0.14, 0.96], [0, 0.96],
  ]), mat));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pearl = mesh(new THREE.SphereGeometry(0.04, 12, 10), mat);
    pearl.position.set(Math.cos(a) * 0.16, 1.0, Math.sin(a) * 0.16);
    g.add(pearl);
  }
  const top = mesh(new THREE.SphereGeometry(0.06, 16, 12), mat);
  top.position.y = 1.06;
  g.add(top);
  return g;
}

function king(mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe([
    [0, 0], [0.32, 0], [0.32, 0.07], [0.24, 0.12],
    [0.15, 0.2], [0.14, 0.56], [0.2, 0.62], [0.13, 0.68],
    [0.17, 0.86], [0.2, 1.0], [0.14, 1.04], [0, 1.04],
  ]), mat));
  const ring = mesh(new THREE.TorusGeometry(0.12, 0.025, 10, 24), mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.08;
  g.add(ring);
  const v = mesh(new THREE.BoxGeometry(0.055, 0.22, 0.055), mat);
  v.position.y = 1.2;
  g.add(v);
  const h = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), mat);
  h.position.y = 1.22;
  g.add(h);
  return g;
}

const BUILD = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

export function createPiece(type, color) {
  const group = BUILD[type](MATS[color]);
  if (type === 'n') group.rotation.y = color === 'w' ? Math.PI : 0;
  group.userData = { type, color };
  group.traverse((o) => {
    if (o.isMesh) o.userData.pieceRoot = group;
  });
  return group;
}

export function squareToWorld(s) {
  return {
    x: (s & 7) - 3.5,
    z: 3.5 - (s >> 3),
  };
}

export function worldToSquare(x, z) {
  const file = Math.round(x + 3.5);
  const rank = Math.round(3.5 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return file + rank * 8;
}

export function createBoard() {
  const root = new THREE.Group();
  const maple = woodMaps([[210, 168, 118], [232, 198, 148], [188, 142, 92]]);
  const walnut = woodMaps([[72, 42, 24], [112, 68, 38], [48, 28, 16]]);
  const frameMaps = woodMaps([[42, 26, 16], [68, 40, 22], [28, 16, 10]]);

  const lightBase = new THREE.MeshPhysicalMaterial({
    color: 0xe6c49a,
    map: maple.map,
    roughness: 0.52,
    roughnessMap: maple.rough,
    metalness: 0.03,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.45,
  });
  const darkBase = new THREE.MeshPhysicalMaterial({
    color: 0x6b4126,
    map: walnut.map,
    roughness: 0.58,
    roughnessMap: walnut.rough,
    metalness: 0.04,
    clearcoat: 0.14,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.4,
  });

  const tiles = [];
  const geo = new THREE.BoxGeometry(0.98, 0.12, 0.98);

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const s = f + r * 8;
      const base = (f + r) % 2 === 0 ? darkBase : lightBase;
      const mat = base.clone();
      const map = base.map.clone();
      map.offset.set(((s * 0.37) % 1), ((s * 0.61) % 1));
      map.rotation = (s % 4) * Math.PI * 0.5;
      mat.map = map;
      const tile = new THREE.Mesh(geo, mat);
      const { x, z } = squareToWorld(s);
      tile.position.set(x, -0.06, z);
      tile.receiveShadow = true;
      tile.userData.square = s;
      root.add(tile);
      tiles[s] = tile;
    }
  }

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x3a2416,
    map: frameMaps.map,
    roughness: 0.62,
    roughnessMap: frameMaps.rough,
    metalness: 0.06,
    clearcoat: 0.12,
    envMapIntensity: 0.35,
  });
  frameMat.map.repeat.set(2.2, 2.2);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.18, 8.7), frameMat);
  frame.position.y = -0.16;
  frame.receiveShadow = true;
  root.add(frame);

  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xb08948,
    metalness: 0.88,
    roughness: 0.28,
    envMapIntensity: 1.1,
  });
  const inlay = [
    [0, 4.03, 8.12, 0.07],
    [0, -4.03, 8.12, 0.07],
    [4.03, 0, 0.07, 8.12],
    [-4.03, 0, 0.07, 8.12],
  ];
  for (const [x, z, w, d] of inlay) {
    const strip = mesh(new THREE.BoxGeometry(w, 0.03, d), brass);
    strip.position.set(x, -0.004, z);
    strip.castShadow = false;
    root.add(strip);
  }

  const felt = new THREE.Mesh(
    new THREE.CylinderGeometry(9.6, 9.6, 0.16, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x101812,
      roughness: 0.94,
      metalness: 0,
      sheen: 0.55,
      sheenColor: new THREE.Color(0x1d3324),
      sheenRoughness: 0.75,
    }),
  );
  felt.position.y = -0.28;
  felt.receiveShadow = true;
  root.add(felt);

  return { root, tiles };
}
