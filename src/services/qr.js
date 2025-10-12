// src/services/qr.js
// Minimal, dependency-free QR generator (Byte mode) returning SVG.
// Based on QR Code specification (ISO/IEC 18004) with compact RS/GF(256) impl.
// Public API: renderSVG(data, size=256, margin=2, ecc='M')

/* --------------------------- GF(256) + RS --------------------------- */
const GF256 = (() => {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive poly 0x11D
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
  const pow = (a, e) => (e === 0) ? 1 : EXP[(LOG[a] * e) % 255];
  return { EXP, LOG, mul, pow };
})();

function rsGeneratorPoly(ecLen) {
  // (x - a^0)(x - a^1)...(x - a^(ecLen-1))
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecLen; i++) {
    const p = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      p[j] ^= GF256.mul(poly[j], 1);
      p[j + 1] ^= GF256.mul(poly[j], GF256.pow(2, i));
    }
    poly = p;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[res.length - 1] = 0;
    for (let j = 0; j < gen.length; j++) {
      res[j] ^= GF256.mul(gen[j], factor);
    }
  }
  return res;
}

/* ------------------------- Version Tables -------------------------- */
// Format: per version: size, total data codewords per ECC level, block structure.
// Data from QR spec condensed. Each entry: { size, ec: {L,M,Q,H}, blocks: {L,M,Q,H} }
// blocks: [ [numBlocks, dataCodewordsPerBlock], ... ] (1 or 2 groups per spec)
const VERSIONS = [
  /* v1 */  {size:21, ec:{
    L:19, M:16, Q:13, H:9
  }, blocks:{
    L:[[1,19]], M:[[1,16]], Q:[[1,13]], H:[[1,9]]
  }},
  /* v2 */  {size:25, ec:{
    L:34, M:28, Q:22, H:16
  }, blocks:{
    L:[[1,34]], M:[[1,28]], Q:[[1,22]], H:[[1,16]]
  }},
  /* v3 */  {size:29, ec:{
    L:55, M:44, Q:34, H:26
  }, blocks:{
    L:[[1,55]], M:[[1,44]], Q:[[1,34]], H:[[1,26]]
  }},
  /* v4 */  {size:33, ec:{
    L:80, M:64, Q:48, H:36
  }, blocks:{
    L:[[1,80]], M:[[2,32]], Q:[[2,24]], H:[[4,9]]  // matches block groups
  }},
  /* v5 */  {size:37, ec:{
    L:108, M:86, Q:62, H:46
  }, blocks:{
    L:[[1,108]], M:[[2,43]], Q:[[2,15],[2,16]], H:[[2,11],[2,12]]
  }},
  /* v6 */  {size:41, ec:{
    L:136, M:108, Q:76, H:60
  }, blocks:{
    L:[[2,68]], M:[[4,27]], Q:[[4,19]], H:[[4,15]]
  }},
  /* v7 */  {size:45, ec:{
    L:156, M:124, Q:88, H:66
  }, blocks:{
    L:[[2,78]], M:[[4,31]], Q:[[2,14],[4,15]], H:[[4,13],[1,14]]
  }},
  /* v8 */  {size:49, ec:{
    L:194, M:154, Q:110, H:86
  }, blocks:{
    L:[[2,97]], M:[[2,38],[2,39]], Q:[[4,18],[2,19]], H:[[4,14],[2,15]]
  }},
  /* v9 */  {size:53, ec:{
    L:232, M:182, Q:132, H:100
  }, blocks:{
    L:[[2,116]], M:[[3,36],[2,37]], Q:[[4,16],[4,17]], H:[[4,12],[4,13]]
  }},
  /* v10 */ {size:57, ec:{
    L:274, M:216, Q:154, H:122
  }, blocks:{
    L:[[2,68],[2,69]], M:[[4,43],[1,44]], Q:[[6,19],[2,20]], H:[[6,15],[2,16]]
  }},
];
// Above covers v1..v10 which is plenty for ticket URLs/content. Extend if needed.

// EC codewords per block (spec) for v1..v10:
const EC_PER_BLOCK = {
  L:[7,10,15,20,26,18,20,24,30,18],
  M:[10,16,26,18,24,16,18,22,22,26],
  Q:[13,22,18,26,18,24,18,22,20,24],
  H:[17,28,22,16,22,28,26,26,24,28],
};

const ECC_LEVELS = { L:"L", M:"M", Q:"Q", H:"H" };

/* --------------------------- Bit Buffer --------------------------- */
class BitBuffer {
  constructor() { this.bits = []; }
  put(n, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((n >>> i) & 1);
    }
  }
  putBytes(arr) {
    for (const b of arr) this.put(b, 8);
  }
  // pad to totalBits with 0s then 236/17 alternation
  finalize(totalBits) {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    let padBytesNeeded = (totalBits - this.bits.length) / 8;
    let toggle = true;
    while (padBytesNeeded-- > 0) {
      this.put(toggle ? 0xec : 0x11, 8);
      toggle = !toggle;
    }
  }
}

/* --------------------- Encoding (Byte mode) ---------------------- */
function utf8Bytes(s) {
  return new TextEncoder().encode(s);
}

function pickVersion(dataLen, ecc) {
  // Estimate: for Byte mode, need: 4 (mode+length headers vary) + 8*len + terminator
  // We'll try versions in order; accurate capacity is from VERSIONS[ver-1].ec[ecc]
  for (let v = 1; v <= VERSIONS.length; v++) {
    const cap = VERSIONS[v-1].ec[ecc]; // data codewords capacity
    if (cap >= dataLen + 3) return v;  // loose check; proper will use bits below
  }
  return null;
}

function totalDataCodewords(version, ecc) {
  return VERSIONS[version-1].ec[ecc];
}

function blockPlan(version, ecc) {
  return VERSIONS[version-1].blocks[ecc];
}

function ecPerBlock(version, ecc) {
  const idx = version - 1;
  const map = { L:EC_PER_BLOCK.L, M:EC_PER_BLOCK.M, Q:EC_PER_BLOCK.Q, H:EC_PER_BLOCK.H };
  return map[ecc][idx];
}

function interleaveBlocks(blocks) {
  const maxLen = Math.max(...blocks.map(b => b.data.length));
  const out = [];

  // data codewords
  for (let i = 0; i < maxLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) out.push(b.data[i]);
    }
  }
  // ecc codewords
  const ecMaxLen = Math.max(...blocks.map(b => b.ec.length));
  for (let i = 0; i < ecMaxLen; i++) {
    for (const b of blocks) {
      if (i < b.ec.length) out.push(b.ec[i]);
    }
  }
  return new Uint8Array(out);
}

/* ------------------------- Matrix + Mask ------------------------- */
function initMatrix(n) {
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = new Array(n).fill(null);
  }
  return m;
}

function placeFinderPattern(mat, x, y) {
  const p = [
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1],
  ];
  for (let r=0;r<7;r++) for (let c=0;c<7;c++) mat[y+r][x+c] = {v:p[r][c], f:true};
}

function placeTiming(mat) {
  const n = mat.length;
  for (let i = 8; i < n - 8; i++) {
    const v = (i % 2) ? 0 : 1;
    if (mat[6][i] == null) mat[6][i] = {v, f:true};
    if (mat[i][6] == null) mat[i][6] = {v, f:true};
  }
}

function placeAlignPattern(mat, cx, cy) {
  // 5x5
  const p = [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ];
  for (let r=0;r<5;r++) for (let c=0;c<5;c++) {
    const x = cx-2+c, y = cy-2+r;
    if (mat[y] && mat[y][x] == null) mat[y][x] = {v:p[r][c], f:true};
  }
}

// Alignment pattern centers per version 1..10 (from spec)
const ALIGN_POS = {
  1: [],
  2: [6,18],
  3: [6,22],
  4: [6,26],
  5: [6,30],
  6: [6,34],
  7: [6,22,38],
  8: [6,24,42],
  9: [6,26,46],
  10:[6,28,50],
};

function placeAlignmentPatterns(mat, version) {
  const pos = ALIGN_POS[version] || [];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const cx = pos[i], cy = pos[j];
      // skip finder overlaps corners
      const corner = ( (i===0 && j===0) ||
                       (i===0 && j===pos.length-1) ||
                       (i===pos.length-1 && j===0) );
      if (corner) continue;
      placeAlignPattern(mat, cx, cy);
    }
  }
}

function reserveFormatAreas(mat) {
  const n = mat.length;
  for (let i=0;i<9;i++){
    if (i !== 6) {
      mat[8][i] = mat[8][i] || {v:0, f:true, fmt:true};
      mat[i][8] = mat[i][8] || {v:0, f:true, fmt:true};
    }
  }
  for (let i=n-8;i<n;i++){
    mat[8][i] = mat[8][i] || {v:0, f:true, fmt:true};
    mat[i][8] = mat[i][8] || {v:0, f:true, fmt:true};
  }
  mat[n-8][8] = {v:1, f:true}; // dark module
}

function maskFunc(mask, r, c) {
  switch (mask) {
    case 0: return ((r + c) % 2) === 0;
    case 1: return (r % 2) === 0;
    case 2: return (c % 3) === 0;
    case 3: return ((r + c) % 3) === 0;
    case 4: return (((Math.floor(r/2) + Math.floor(c/3)) % 2) === 0);
    case 5: return (((r*c) % 2) + ((r*c) % 3)) === 0;
    case 6: return ((((r*c) % 2) + ((r*c) % 3)) % 2) === 0;
    case 7: return ((((r+c) % 2) + ((r*c) % 3)) % 2) === 0;
    default: return false;
  }
}

function formatBits(ecc, mask) {
  // ECC: L=01, M=00, Q=11, H=10  (per spec)
  const eccBits = { L:1, M:0, Q:3, H:2 }[ecc];
  const data = (eccBits << 3) | mask; // 5 bits
  // BCH(15,5) with poly 0x537
  let v = data << 10;
  const poly = 0x537;
  for (let i = 14; i >= 10; i--) {
    if ((v >>> i) & 1) v ^= (poly << (i - 10));
  }
  const format = ((data << 10) | v) ^ 0x5412;
  return format & 0x7FFF;
}

function drawFormatBits(mat, ecc, mask) {
  const n = mat.length;
  const f = formatBits(ecc, mask);
  for (let i = 0; i < 15; i++) {
    const bit = (f >>> i) & 1;
    // up-left timing row/col
    if (i < 6) {
      mat[8][i].v = bit;
      mat[i][8].v = bit;
    } else if (i === 6) {
      mat[8][7].v = bit;
      mat[7][8].v = bit;
    } else if (i < 8) {
      mat[8][14 - i].v = bit;
      mat[14 - i][8].v = bit;
    } else {
      // other side
      const j = i - 8;
      mat[8][mat.length - 1 - j].v = bit;
      mat[mat.length - 1 - j][8].v = bit;
    }
  }
}

function fillData(mat, dataBits, maskId) {
  const n = mat.length;
  let i = n - 1, dir = -1, bitIdx = 0;

  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing
    for (;;) {
      for (let c = col; c >= col - 1; c--) {
        if (mat[i][c] == null || (mat[i][c] && !mat[i][c].f)) {
          const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
          const m = maskFunc(maskId, i, c) ? 1 : 0;
          mat[i][c] = { v: bit ^ m, f: false };
        }
      }
      i += dir;
      if (i < 0 || i >= n) {
        dir = -dir;
        i += dir;
        break;
      }
    }
  }
}

/* ------------------------- Penalty score ------------------------- */
function penalty(mat) {
  const n = mat.length;
  let score = 0;

  // Adjacent modules in row/col
  for (let r=0;r<n;r++){
    let run = 1;
    for (let c=1;c<n;c++){
      if (mat[r][c].v === mat[r][c-1].v) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let c=0;c<n;c++){
    let run = 1;
    for (let r=1;r<n;r++){
      if (mat[r][c].v === mat[r-1][c].v) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }

  // 2x2 blocks
  for (let r=0;r<n-1;r++){
    for (let c=0;c<n-1;c++){
      const v = mat[r][c].v;
      if (mat[r][c+1].v===v && mat[r+1][c].v===v && mat[r+1][c+1].v===v) score += 3;
    }
  }

  // Finder-like patterns (1:1:3:1:1)
  const pattern = [1,1,3,1,1];
  const checkPattern = (arr) => {
    for (let i=0;i<=arr.length-11;i++){
      const a = arr.slice(i, i+11);
      const b = a.map(x=>x?1:0);
      // pattern and its inverse with margins
      const seqs = [
        [0,0,0,...pattern,0,0,0],
        [1,1,1,...pattern.map(x=>1-x),1,1,1]
      ];
      for (const s of seqs) {
        let ok = true;
        for (let k=0;k<11;k++) if (b[k]!==s[k]) { ok=false; break; }
        if (ok) return true;
      }
    }
    return false;
  };
  for (let r=0;r<n;r++){
    const row = mat[r].map(x=>x.v);
    if (checkPattern(row)) score += 40;
  }
  for (let c=0;c<n;c++){
    const col = Array.from({length:n}, (_,r)=>mat[r][c].v);
    if (checkPattern(col)) score += 40;
  }

  // Balance of dark modules
  let dark = 0;
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (mat[r][c].v) dark++;
  const ratio = Math.abs((dark * 100 / (n*n)) - 50) / 5;
  score += Math.floor(ratio) * 10;

  return score;
}

/* ------------------------- High-level build ------------------------ */
function buildMatrix(version, ecc, dataCodewords) {
  const n = VERSIONS[version-1].size;
  const mat = initMatrix(n);

  // Finder patterns + separators
  placeFinderPattern(mat, 0, 0);
  placeFinderPattern(mat, n - 7, 0);
  placeFinderPattern(mat, 0, n - 7);

  // Timing + alignment
  placeTiming(mat);
  placeAlignmentPatterns(mat, version);

  // Reserve format info areas
  reserveFormatAreas(mat);

  // Try masks 0..7, choose lowest penalty
  let best = null, bestMask = 0, bestScore = Infinity;
  for (let mask=0; mask<8; mask++) {
    // Deep copy light matrix
    const test = mat.map(row => row.map(cell => cell ? {...cell} : null));
    fillData(test, dataCodewords, mask);
    drawFormatBits(test, ecc, mask);
    const sc = penalty(test);
    if (sc < bestScore) { bestScore = sc; bestMask = mask; best = test; }
  }
  return { matrix: best, mask: bestMask };
}

function makeCodewords(version, ecc, dataBytes) {
  const totalDC = totalDataCodewords(version, ecc); // data codewords capacity
  const mode = 0b0100; // Byte mode
  const ccBits = (version >= 10) ? 16 : 8;

  const bb = new BitBuffer();
  bb.put(mode, 4);
  bb.put(dataBytes.length, ccBits);
  bb.putBytes(dataBytes);
  bb.put(0, Math.min(4, (totalDC*8) - bb.bits.length)); // terminator up to 4 bits

  // align to byte
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);

  const needed = totalDC - (bb.bits.length / 8);
  let toggle = true;
  for (let i=0;i<needed;i++) {
    bb.put(toggle ? 0xec : 0x11, 8);
    toggle = !toggle;
  }

  // Split into RS blocks as per plan
  const blocks = [];
  const plan = blockPlan(version, ecc);
  const ecCount = ecPerBlock(version, ecc);

  let offset = 0;
  for (const [num, k] of plan) {
    for (let i=0;i<num;i++) {
      const dc = new Uint8Array(k);
      for (let j=0;j<k;j++) {
        dc[j] = bitsToByte(bb.bits, (offset + j) * 8);
      }
      offset += k;
      const ec = rsEncode(dc, ecCount);
      blocks.push({ data: dc, ec });
    }
  }

  // Interleave all blocks to final stream (in bytes -> bits)
  const inter = interleaveBlocks(blocks);
  const outBits = [];
  for (const b of inter) for (let i=7;i>=0;i--) outBits.push((b>>>i)&1);
  return outBits;
}

function bitsToByte(bits, idx) {
  let v = 0;
  for (let i=0;i<8;i++) v = (v<<1) | (bits[idx+i]||0);
  return v;
}

/* --------------------------- Public API --------------------------- */
export async function renderSVG(data, size = 256, margin = 2, ecc = 'M') {
  try {
    const eccU = (ecc || 'M').toUpperCase();
    if (!ECC_LEVELS[eccU]) throw new Error("Invalid ECC level");

    // Encode as UTF-8 bytes
    const bytes = utf8Bytes(String(data));
    // Find minimal version that can fit
    const vPick = pickVersion(bytes.length, eccU);
    if (!vPick) throw new Error("Data too long for supported versions (v1..v10)");

    const bits = makeCodewords(vPick, eccU, bytes);
    const { matrix } = buildMatrix(vPick, eccU, bits);

    // Render to SVG
    const n = matrix.length;
    const cell = 1;
    const dim = (n + margin * 2) * cell;

    let path = "";
    for (let y=0;y<n;y++){
      let run = 0; // build horizontal runs for compact path
      for (let x=0;x<n;x++){
        if (matrix[y][x].v) {
          // draw as unit square
          path += `M${x+margin},${y+margin}h1v1h-1z`;
        }
      }
    }

    const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#fff"/>
  <path d="${path}" fill="#000"/>
</svg>`;

    return svg;
  } catch (_e) {
    // On any unexpected failure, return undefined so the caller can 501 gracefully
    return undefined;
  }
}
