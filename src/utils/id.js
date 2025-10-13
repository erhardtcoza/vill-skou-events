// /src/utils/id.js
// Tiny, Workers-safe ID helpers (no deps)

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';

/** URL-safe random id. Default size 21 (like nanoid) */
export function nanoid(size = 21) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] & 63];
  return id;
}

/** Short readable id (e.g. WJ8K2ZQ). Prefix optional. */
export function shortReadable(prefix = 'W', len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = prefix;
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
