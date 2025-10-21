import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config as dotenv } from 'dotenv';
import { sendLeadToMeta } from './src/metaCapi.js';
import { normalizeEmail, normalizePhone, normalizeText, hashIf } from './src/hash.js';

dotenv();

const {
  META_ACCESS_TOKEN,
  META_PIXEL_ID,
  META_TEST_EVENT_CODE,
  APP_PORT = 3000,
  ALLOWED_ORIGINS = ''
} = process.env;

if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
  console.warn('[WARN] META_ACCESS_TOKEN and META_PIXEL_ID must be set in .env');
}

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// CORS
const allowed = ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow mobile apps / curl
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true
}));

// rate limit
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use('/api/', limiter);

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/lead', async (req, res) => {
  try {
    const {
      email,
      phone,
      first_name,
      last_name,
      city,
      state,
      country = 'ZA',
      zip,
      fbp,
      fbc,
      event_id,
      external_id, 
      value = 0,
      currency = 'ZAR',
    } = req.body || {};

    // Pull client hints from request if not provided
    const userAgent = req.get('User-Agent');
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const referer = req.get('Referer');

    // Build user_data with hashed fields
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
      fbc: fbc || undefined,
      external_id: external_id || undefined
    };

    // Remove null/undefined
    Object.keys(userData).forEach(k => (userData[k] == null) && delete userData[k]);

    const customData = {
      value,
      currency
    };

    const resp = await sendLeadToMeta({
      accessToken: META_ACCESS_TOKEN,
      pixelId: META_PIXEL_ID,
      testEventCode: META_TEST_EVENT_CODE,
      eventName: 'Lead',
      eventTime: Math.floor(Date.now() / 1000),
      eventId: event_id, // optional but recommended for dedup
      actionSource: 'website',
      eventSourceUrl: referer, 
      userData,
      customData
    });

     req.log.info({
     event_id,
     fbp_present: Boolean(userData.fbp),
     fbc_present: Boolean(userData.fbc),
      external_id_present: Boolean(userData.external_id)
    }, 'CAPI lead incoming');

    res.json({ ok: true, meta: resp });
  } catch (err) {
    req.log?.error({ err }, 'Lead forwarding failed');
    res.status(err.status || 500).json({
      ok: false,
      error: err.message,
      details: err.details || null
    });
  }
});

app.listen(APP_PORT, () => {
  logger.info(`Server listening on http://localhost:${APP_PORT}`);
});
