// ═══════════════════════════════════════════════
// TRANSCRIPCIÓN DE NOTAS DE VOZ — GROQ WHISPER
// Convierte audios de WhatsApp a texto (GRATIS)
// ═══════════════════════════════════════════════

const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

let client = null;
const TEMP_DIR = path.join(__dirname, '..', 'data', 'temp_audio');

function initVoice() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return false;

  try {
    client = new Groq({ apiKey });
    // Crear directorio temporal para audios
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    console.log('🎤 Transcripción de voz activada (Groq Whisper)');
    return true;
  } catch (e) {
    console.error('❌ Error inicializando Whisper:', e.message);
    return false;
  }
}

/**
 * Descarga el audio de WhatsApp y lo transcribe a texto.
 * @param {object} msg - Mensaje de WhatsApp con audioMessage
 * @param {object} sock - Socket de WhatsApp (Baileys)
 * @returns {Promise<string|null>} Texto transcrito o null si falla
 */
async function transcribeVoiceNote(msg, sock) {
  if (!client) {
    console.log('⚠️ Whisper no inicializado');
    return null;
  }

  try {
    // 1. Descargar el audio desde WhatsApp como Buffer
    const audioBuffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: sock.logger,
        reuploadRequest: sock.updateMediaMessage
      }
    );
    
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error('❌ Audio vacío o no se pudo descargar');
      return null;
    }

    // 3. Guardar temporalmente como archivo .ogg
    const tempFile = path.join(TEMP_DIR, `voice_${Date.now()}.ogg`);
    fs.writeFileSync(tempFile, audioBuffer);

    console.log(`🎤 Audio descargado (${(audioBuffer.length / 1024).toFixed(1)} KB) — Transcribiendo...`);

    // 4. Enviar a Groq Whisper para transcripción
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-large-v3',
      language: 'es',  // Español
      response_format: 'text'
    });

    // 5. Limpiar archivo temporal
    try {
      fs.unlinkSync(tempFile);
    } catch (e) { /* ignorar */ }

    const text = typeof transcription === 'string' 
      ? transcription.trim() 
      : (transcription.text || '').trim();

    if (text) {
      console.log(`✅ Voz transcrita: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    }

    return text || null;

  } catch (error) {
    console.error('❌ Error transcribiendo audio:', error.message);
    
    // Limpiar archivos temporales en caso de error
    try {
      const files = fs.readdirSync(TEMP_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(TEMP_DIR, f));
      }
    } catch (e) { /* ignorar */ }

    return null;
  }
}

/**
 * Verifica si un mensaje contiene una nota de voz.
 */
function isVoiceMessage(msg) {
  return !!(msg.message?.audioMessage);
}

module.exports = { initVoice, transcribeVoiceNote, isVoiceMessage };
