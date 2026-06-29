// ═══════════════════════════════════════════════
// YCLOUD — WhatsApp Business API OFICIAL (anti-baneo)
// Enviar mensajes por la API oficial de WhatsApp vía YCloud.
// ═══════════════════════════════════════════════

const crypto = require('crypto');
const API_BASE = 'https://api.ycloud.com/v2';

function isEnabled() {
  return !!(process.env.YCLOUD_API_KEY && process.env.YCLOUD_FROM);
}

/**
 * Verifica la firma del webhook de YCloud (que el POST venga de YCloud).
 * Header "YCloud-Signature" con formato:  t=<timestamp>,s=<hmac_sha256_hex>
 * Se firma el texto  `${timestamp}.${rawBody}`  con el secreto del webhook.
 * @param {string} rawBody  cuerpo crudo (string) tal cual llegó
 * @param {string} signatureHeader  valor del header YCloud-Signature
 * @param {string} secret  secreto de firma del webhook (de YCloud)
 * @returns {boolean} true si la firma es válida (o si no hay secreto configurado)
 */
function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return true; // sin secreto configurado → no se exige (best-effort)
  if (!signatureHeader) return false;
  try {
    const parts = {};
    String(signatureHeader).split(',').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    const t = parts.t;
    const sig = parts.s || parts.v1; // s (YCloud); v1 por compatibilidad
    if (!t || !sig) return false;
    const signed = t + '.' + (rawBody || '');
    const expected = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    console.error('❌ [YCloud] Error verificando firma:', e.message);
    return false;
  }
}

// Normaliza un número a formato internacional con + (ej: 18095551234 -> +18095551234)
function normalizeNumber(n) {
  if (!n) return n;
  let s = String(n).replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
  if (s.length === 10) s = '1' + s; // RD/US sin código de país
  return '+' + s;
}

/**
 * Envía un mensaje de texto por WhatsApp usando la API oficial (YCloud).
 * @param {string} to  número del destinatario
 * @param {string} text texto a enviar
 */
async function sendMessage(to, text) {
  const key = process.env.YCLOUD_API_KEY;
  const from = process.env.YCLOUD_FROM;
  if (!key || !from) { console.error('❌ [YCloud] No configurado (YCLOUD_API_KEY/YCLOUD_FROM).'); return false; }

  try {
    const resp = await fetch(`${API_BASE}/whatsapp/messages`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: normalizeNumber(from),
        to: normalizeNumber(to),
        type: 'text',
        text: { body: String(text || '') }
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log(`📤 [YCloud] Mensaje enviado a ${normalizeNumber(to)} ✓`);
      return true;
    }
    console.error(`❌ [YCloud] Error ${resp.status}:`, JSON.stringify(data).slice(0, 300));
    return false;
  } catch (e) {
    console.error('❌ [YCloud] Excepción al enviar:', e.message);
    return false;
  }
}

/**
 * Envía un mensaje de PLANTILLA (template) aprobada — necesario para escribirle
 * a alguien fuera de la ventana de 24h (recordatorios, retornos, etc.).
 * @param {string} to  destinatario
 * @param {string} templateName  nombre EXACTO de la plantilla aprobada en YCloud
 * @param {string} languageCode  idioma de la plantilla (ej 'es', 'es_DO', 'en')
 * @param {string[]} [bodyParams]  valores para los {{1}}, {{2}}... del cuerpo, en orden
 */
async function sendTemplate(to, templateName, languageCode, bodyParams) {
  const key = process.env.YCLOUD_API_KEY;
  const from = process.env.YCLOUD_FROM;
  if (!key || !from) { console.error('❌ [YCloud] No configurado (template).'); return false; }
  if (!templateName) { console.error('❌ [YCloud] Falta el nombre de la plantilla.'); return false; }

  const template = { name: templateName, language: { code: languageCode || 'es' } };
  if (bodyParams && bodyParams.length) {
    template.components = [{
      type: 'body',
      parameters: bodyParams.map(function (v) { return { type: 'text', text: String(v == null ? '' : v) }; })
    }];
  }

  try {
    const resp = await fetch(`${API_BASE}/whatsapp/messages`, {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: normalizeNumber(from), to: normalizeNumber(to), type: 'template', template })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) { console.log(`📤 [YCloud] Plantilla "${templateName}" enviada a ${normalizeNumber(to)} ✓`); return true; }
    console.error(`❌ [YCloud] Error plantilla ${resp.status}:`, JSON.stringify(data).slice(0, 300));
    return false;
  } catch (e) {
    console.error('❌ [YCloud] Excepción al enviar plantilla:', e.message);
    return false;
  }
}

/**
 * Descarga un archivo de medios (imagen/audio/video) de un mensaje entrante.
 * @param {string} url  el "link" del medio que trae el webhook
 * @returns {Promise<Buffer|null>}
 */
async function downloadMedia(url) {
  if (!url) return null;
  const key = process.env.YCLOUD_API_KEY;
  try {
    const resp = await fetch(url, { headers: key ? { 'X-API-Key': key } : {} });
    if (!resp.ok) { console.error('❌ [YCloud] No se pudo descargar medio:', resp.status); return null; }
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length ? buf : null;
  } catch (e) {
    console.error('❌ [YCloud] Excepción al descargar medio:', e.message);
    return null;
  }
}

/**
 * Registra (da de alta) un webhook en YCloud para recibir mensajes entrantes.
 * Así no hay que entrar al panel de YCloud a mano.
 * @param {string} apiKey  llave de YCloud del cliente
 * @param {string} url     URL pública del webhook (ej http://IP:PUERTO/webhook/ycloud)
 * @param {string[]} [events] eventos a suscribir
 * @returns {Promise<{ok:boolean, id?:string, error?:string}>}
 */
async function registerWebhook(apiKey, url, events) {
  if (!apiKey || !url) return { ok: false, error: 'Falta apiKey o url' };
  const evs = events && events.length ? events : ['whatsapp.inbound_message.received'];
  try {
    const resp = await fetch(`${API_BASE}/webhookEndpoints`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, events: evs, enabled: true })
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log(`🔗 [YCloud] Webhook registrado: ${url}`);
      return { ok: true, id: data && data.id };
    }
    const errMsg = (data && (data.message || (data.error && data.error.message))) || ('HTTP ' + resp.status);
    console.error(`❌ [YCloud] No se pudo registrar webhook (${resp.status}):`, JSON.stringify(data).slice(0, 300));
    return { ok: false, error: errMsg };
  } catch (e) {
    console.error('❌ [YCloud] Excepción al registrar webhook:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { isEnabled, sendMessage, sendTemplate, downloadMedia, normalizeNumber, registerWebhook, verifySignature };
