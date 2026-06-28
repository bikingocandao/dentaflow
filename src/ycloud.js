// ═══════════════════════════════════════════════
// YCLOUD — WhatsApp Business API OFICIAL (anti-baneo)
// Enviar mensajes por la API oficial de WhatsApp vía YCloud.
// ═══════════════════════════════════════════════

const API_BASE = 'https://api.ycloud.com/v2';

function isEnabled() {
  return !!(process.env.YCLOUD_API_KEY && process.env.YCLOUD_FROM);
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

module.exports = { isEnabled, sendMessage, normalizeNumber };
