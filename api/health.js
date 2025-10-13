import { applyCors, handleOptions } from './_cors.js';
export default function handler(req, res) {
  if (handleOptions(req, res)) return;
  applyCors(req, res);
  res.status(200).json({ ok: true });
}
