import fetch from 'node-fetch';

const META_URL = (pixelId) => `https://graph.facebook.com/v19.0/${pixelId}/events`;

/**
 * Send a single Meta CAPI event.
 * - Assumes PII (em/ph/fn/ln/ct/st/country/zp) are already SHA-256 hashed upstream.
 * - Sends fbp, fbc, external_id RAW (unhashed), exactly as received.
 *
 * @param {Object} opts
 * @param {string} opts.accessToken
 * @param {string} opts.pixelId
 * @param {string=} opts.testEventCode
 * @param {string} opts.eventName        // e.g., "Lead", "Contact"
 * @param {number} opts.eventTime        // Unix seconds (NOT ms)
 * @param {string=} opts.eventId         // must match browser eventID for dedupe
 * @param {Object} opts.userData         // { em, ph, fn, ln, ct, st, country, zp, client_user_agent, client_ip_address, fbp, fbc, external_id }
 * @param {Object=} opts.customData      // { value, currency, ... } only if valid
 * @param {string=} opts.actionSource    // default "website"
 * @param {string=} opts.eventSourceUrl  // optional: page/referrer url
 */
export async function sendLeadToMeta({
  accessToken,
  pixelId,
  testEventCode,
  eventName = 'Lead',
  eventTime = Math.floor(Date.now() / 1000),
  eventId,
  userData,
  customData = {},
  actionSource = 'website',
  eventSourceUrl
}) {
  if (!accessToken) throw new Error('Missing accessToken');
  if (!pixelId) throw new Error('Missing pixelId');
  if (!eventName) throw new Error('Missing eventName');
  if (!Number.isFinite(eventTime)) throw new Error('eventTime must be unix seconds');

  // Sanitize custom_data: only include value/currency when BOTH valid
  const cd = { ...customData };
  if ('value' in cd || 'currency' in cd) {
    const valueOk = typeof cd.value === 'number' && Number.isFinite(cd.value);
    const currencyOk = typeof cd.currency === 'string' && /^[A-Z]{3}$/.test(cd.currency.toUpperCase());
    if (!(valueOk && currencyOk)) {
      delete cd.value;
      delete cd.currency;
    } else {
      cd.currency = cd.currency.toUpperCase();
    }
  }
  prune(cd);

  // IMPORTANT: userData should already be normalized upstream.
  // Do NOT mutate fbp/fbc/external_id here.
  const payload = {
    data: [{
      event_name: eventName,
      event_time: eventTime,         // seconds
      event_id: eventId || undefined,
      action_source: actionSource || 'website',
      event_source_url: eventSourceUrl || undefined,
      user_data: pruneAndReturn(userData),
      custom_data: Object.keys(cd || {}).length ? cd : undefined
    }],
    ...(testEventCode ? { test_event_code: testEventCode } : {})
  };
  prune(payload);

  const url = META_URL(pixelId) + `?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`Meta CAPI error ${res.status}`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

/** Remove undefined/null/empty-string and empty objects/arrays (in-place) */
function prune(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      prune(obj[i]);
      if (obj[i] == null || obj[i] === '' || (typeof obj[i] === 'object' && !Object.keys(obj[i]).length)) {
        obj.splice(i, 1);
      }
    }
    return;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') prune(v);
    if (v == null || v === '' || (typeof v === 'object' && !Object.keys(v).length)) {
      delete obj[k];
    }
  }
}

/** Convenience: prune and return object (or undefined if empty) */
function pruneAndReturn(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  const copy = { ...obj };
  prune(copy);
  return Object.keys(copy).length ? copy : undefined;
}
