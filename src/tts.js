// ═══════════════════════════════════════════════
// SERVICIO DE TEXT-TO-SPEECH (TTS)
// Convierte texto a audio temporal usando Google, OpenAI o ElevenLabs
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const googleTTS = require('google-tts-api');

const TEMP_DIR = path.join(__dirname, '..', 'data', 'temp_audio');

// Asegurar que exista el directorio temporal
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Convierte un texto a archivo de audio temporal (.mp3)
 * @param {string} text - El texto a convertir
 * @returns {Promise<string|null>} Ruta absoluta al archivo generado o null si falla
 */
async function generateSpeech(text) {
  const engine = process.env.TTS_ENGINE || 'google';
  console.log(`🎤 Generando voz utilizando el motor: ${engine}...`);

  // Cortar texto largo si el motor tiene limitaciones
  const cleanText = text.replace(/\[CITA_CONFIRMADA\][\s\S]*?\[\/CITA_CONFIRMADA\]/g, '').trim();
  if (!cleanText) return null;

  try {
    const filename = `response_${Date.now()}.mp3`;
    const tempFile = path.join(TEMP_DIR, filename);

    if (engine === 'google') {
      return await generateGoogleSpeech(cleanText, tempFile);
    } else if (engine === 'openai') {
      return await generateOpenAISpeech(cleanText, tempFile);
    } else if (engine === 'elevenlabs') {
      return await generateElevenLabsSpeech(cleanText, tempFile);
    } else {
      console.warn(`⚠️ Motor TTS no reconocido (${engine}), usando Google por defecto.`);
      return await generateGoogleSpeech(cleanText, tempFile);
    }
  } catch (error) {
    console.error('❌ Error en generación TTS general:', error.message);
    return null;
  }
}

/**
 * Genera voz usando Google Translate TTS
 */
async function generateGoogleSpeech(text, destPath) {
  try {
    const lang = process.env.TTS_VOICE_ID || 'es';
    // google-tts-api@0.0.6 devuelve una URL para el audio
    const audioUrl = await googleTTS(text, lang, 1);
    
    // Descargar el audio desde la URL
    const https = require('https');
    const http = require('http');
    const url = new URL(audioUrl);
    const client = url.protocol === 'https:' ? https : http;

    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      client.get(audioUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => { fileStream.close(); resolve(); });
      }).on('error', reject);
    });

    console.log(`✅ Voz de Google generada con éxito: ${destPath}`);
    return destPath;
  } catch (err) {
    console.error('❌ Error en Google TTS:', err.message);
    throw err;
  }
}


/**
 * Genera voz usando OpenAI TTS API
 */
async function generateOpenAISpeech(text, destPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('tu-api-key')) {
    throw new Error('OPENAI_API_KEY no configurada en el archivo .env');
  }

  try {
    const voice = process.env.TTS_OPENAI_VOICE || 'alloy';
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
    console.log(`✅ Voz de OpenAI generada con éxito (${voice}): ${destPath}`);
    return destPath;
  } catch (err) {
    console.error('❌ Error en OpenAI TTS:', err.message);
    throw err;
  }
}

/**
 * Genera voz usando ElevenLabs API
 */
async function generateElevenLabsSpeech(text, destPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey.startsWith('tu-api-key')) {
    throw new Error('ELEVENLABS_API_KEY no configurada en el archivo .env');
  }

  try {
    const voiceId = process.env.TTS_ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buffer);
    console.log(`✅ Voz de ElevenLabs generada con éxito (Voice ID: ${voiceId}): ${destPath}`);
    return destPath;
  } catch (err) {
    console.error('❌ Error en ElevenLabs TTS:', err.message);
    throw err;
  }
}

/**
 * Limpia un archivo de audio del servidor
 * @param {string} filePath 
 */
function cleanAudio(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
    } catch (e) {
      console.error(`❌ Error al limpiar archivo de audio: ${filePath}`, e.message);
    }
  }
}

module.exports = {
  generateSpeech,
  cleanAudio
};
