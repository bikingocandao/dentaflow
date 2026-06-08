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
async function getAIResponse(conversationHistory, plan) {
  if (!client) {
    return '⚠️ El servicio de IA no está disponible en este momento. Un agente humano le atenderá pronto.';
  }

  const systemPrompt = generarPrompt(plan);
  const modelName = process.env.AI_MODEL || 'llama-3.3-70b-versatile';

  try {
    // Groq usa el mismo formato que OpenAI: system, user, assistant
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory
    ];

    const response = await client.chat.completions.create({
      model: modelName,
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || 'Disculpe, no pude generar una respuesta. ¿Puede repetir su consulta?';

  } catch (error) {
    console.error('❌ Error de IA:', error.message);

    if (error.status === 401) {
      return '⚠️ Error de autenticación con el servicio de IA. Verifica tu GROQ_API_KEY.';
    }
    if (error.status === 429) {
      return '⏳ Estamos recibiendo muchos mensajes. Por favor, intente de nuevo en unos segundos.';
    }

    return '😊 Disculpe, estoy teniendo dificultades técnicas. Un miembro del equipo le atenderá pronto.';
  }
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
