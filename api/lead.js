import { sendLeadToMeta } from '../src/metaCapi.js';
import { normalizeEmail, normalizePhone, normalizeText, hashIf } from '../src/hash.js';
import { applyCors, handleOptions } from './_cors.js';

const { META_ACCESS_TOKEN, META_PIXEL_ID, META_TEST_EVENT_CODE } = process.env;

export default async function handler(req, res) {
  if (handleOptions(req, res)) return; // reply to preflight
  applyCors(req, res);                  // add CORS to the actual response too

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const {
      email, phone, first_name, last_name,
      city, state, country = 'ZA', zip,
      fbp, fbc, event_id, value = 0, currency = 'ZAR',
    } = req.body || {};

    const userAgent = req.headers['user-agent'];
    const clientIp =
      (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
      req.socket?.remoteAddress;

    const userData = {
      em: hashIf(email, normalizeEmail),
      ph: hashIf(phone, normalizePhone),
      fn: hashIf(first_name, normalizeText),
      ln: hashIf(last_name, normalizeText),
      ct: hashIf(city, normalizeText),
      st: hashIf(state, normalizeText),
      country: hashIf(country, normalizeText),
      zp: hashIf(zip, normalizeText),
      client_user_agent: userAgent,
      client_ip_address: clientIp,
      fbp: fbp || undefined,
      fbc: fbc || undefined
    };
    Object.keys(userData).forEach(k => (userData[k] == null) && delete userData[k]);

    const customData = { value, currency };

    const resp = await sendLeadToMeta({
      accessToken: META_ACCESS_TOKEN,
      pixelId: META_PIXEL_ID,
      testEventCode: META_TEST_EVENT_CODE,   // needed to see “Server” in Test Events
      eventName: 'Lead',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: event_id,                     // dedup with pixel
      actionSource: 'website',
      userData,
      customData
    });

    res.status(200).json({ ok: true, meta: resp });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message,
      details: err.details || null
    });
  }
}
