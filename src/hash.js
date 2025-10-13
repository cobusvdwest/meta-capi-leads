import crypto from 'crypto';

/**
 * Meta requires SHA-256 hashing of user data after normalization:
 * - trim, lowercase, remove spaces for emails
 * - phone: remove non-digits, include country code (no +), e.g., 27821234567
 */
export function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().lowercase ? String(email).trim().lowercase() : String(email).trim().toLowerCase();
}

export function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).strip ? String(phone).strip() : String(phone).trim();
  p = p.replace(/[^0-9]/g, '');
  // If starts with 0 and you know the country (e.g., South Africa), add 27
  if (p.startsWith('0')) p = '27' + p.slice(1);
  return p;
}

export function normalizeText(s) {
  if (!s) return null;
  return String(s).trim().toLowerCase();
}

export function sha256(value) {
  if (value == null) return null;
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function hashIf(value, normalizer) {
  const n = normalizer ? normalizer(value) : value;
  return n ? sha256(n) : null;
}