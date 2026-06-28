// ═══════════════════════════════════════════════
// INTEGRACIÓN CON GROQ (LLAMA 3 — 100% GRATIS)
// ═══════════════════════════════════════════════

const Groq = require('groq-sdk');
const { generarPrompt } = require('./prompts');

let client = null;

function initAI() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'PEGA-TU-API-KEY-DE-GROQ-AQUI') {
    console.log('⚠️  GROQ_API_KEY no configurada. La IA no responderá.');
    console.log('   Obtén tu key gratis en: https://console.groq.com/keys');
    return false;
  }

  try {
    client = new Groq({ apiKey });
    const modelName = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
    console.log(`✅ Groq IA conectado (modelo: ${modelName})`);
    return true;
  } catch (error) {
    console.error('❌ Error inicializando Groq:', error.message);
    return false;
  }
}

/**
 * Envía un mensaje al modelo de IA y obtiene la respuesta.
 * @param {Array} conversationHistory - Historial de mensajes [{role, content}]
 * @param {string} plan - Plan activo (basico, estandar, completo)
 * @returns {Promise<string>} Respuesta del bot
 */
// Respaldo: llama a OpenRouter (API compatible con OpenAI) por fetch
async function callOpenRouter(messages) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Clinic Full'
      },
      body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.7 })
    });
    const data = await resp.json();
    const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (txt) { console.log(`🔁 Respondido por OpenRouter (respaldo) · modelo ${model}`); return txt; }
    console.error('❌ OpenRouter sin respuesta:', JSON.stringify(data).slice(0, 200));
    return null;
  } catch (e) {
    console.error('❌ OpenRouter falló:', e.message);
    return null;
  }
}

async function getAIResponse(conversationHistory, plan) {
  const systemPrompt = generarPrompt(plan);
  const modelName = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  // 📅 Contexto de fecha/hora actual: así el bot entiende "hoy", "mañana",
  // "el lunes", etc. y agenda en la fecha correcta (formato YYYY-MM-DD).
  const tz = process.env.GOOGLE_TIMEZONE || 'America/Santo_Domingo';
  const ahora = new Date();
  const fechaLegible = ahora.toLocaleDateString('es-DO', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const horaLegible = ahora.toLocaleTimeString('es-DO', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const isoHoy = ahora.toLocaleDateString('en-CA', { timeZone: tz });
  const contextoFecha = `=== FECHA Y HORA ACTUAL (referencia) ===
Hoy es ${fechaLegible}. Son las ${horaLegible}. La fecha de hoy en formato ISO es ${isoHoy}.
Usa SIEMPRE esta fecha como referencia para entender "hoy", "mañana", "pasado mañana", "el lunes", "este sábado", "la próxima semana", etc.
En el bloque [CITA_CONFIRMADA] la fecha DEBE ir en formato YYYY-MM-DD calculado a partir de hoy.
Nunca agendes una cita en una fecha que ya pasó: si la fecha pedida ya pasó, ofrece amablemente la próxima disponible.`;

  // Mismo formato OpenAI para ambos proveedores: system, user, assistant
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: contextoFecha },
    ...conversationHistory
  ];

  // 1) PRINCIPAL: Groq (rápido y gratis)
  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: modelName, messages, max_tokens: 500, temperature: 0.7,
      });
      const txt = response.choices[0]?.message?.content;
      if (txt) return txt;
    } catch (error) {
      console.error(`❌ Groq falló (${error.status || '?'}): ${error.message}. Probando respaldo...`);
      // No respondemos aún: intentamos OpenRouter abajo.
    }
  }

  // 2) RESPALDO: OpenRouter (si está configurado)
  const orResp = await callOpenRouter(messages);
  if (orResp) return orResp;

  // 3) Si ambos fallan
  return '😊 Disculpe, estoy teniendo dificultades técnicas. Un miembro del equipo le atenderá pronto.';
}

/**
 * Extrae datos de cita confirmada de la respuesta del bot.
 * Busca el bloque [CITA_CONFIRMADA]...[/CITA_CONFIRMADA]
 */
function extractAppointmentData(response) {
  const match = response.match(/\[CITA_CONFIRMADA\]([\s\S]*?)\[\/CITA_CONFIRMADA\]/);
  if (!match) return null;

  const data = {};
  const lines = match[1].trim().split('\n');
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      data[key.trim()] = valueParts.join(':').trim();
    }
  }
  return data;
}

/**
 * Limpia la respuesta del bot removiendo bloques internos del sistema.
 */
function cleanBotResponse(response) {
  return response
    .replace(/\[CITA_CONFIRMADA\][\s\S]*?\[\/CITA_CONFIRMADA\]/g, '')
    .trim();
}

module.exports = { initAI, getAIResponse, extractAppointmentData, cleanBotResponse };
