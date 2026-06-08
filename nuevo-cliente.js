#!/usr/bin/env node
// ═══════════════════════════════════════════════
// 🆕 SCRIPT PARA AGREGAR UN NUEVO CLIENTE
// Ejecutar: node nuevo-cliente.js
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🆕 AGREGAR NUEVO CLIENTE — ChatBot IA');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // 1. Datos del cliente
  const nombreNegocio = await ask('📋 Nombre del negocio: ');
  const tipoNegocio = await ask('🏢 Tipo (Barbería, Clínica, Salón, etc.): ');
  const direccion = await ask('📍 Dirección: ');
  const telefono = await ask('📞 Teléfono del negocio: ');
  const instagram = await ask('📸 Instagram (dejar vacío si no tiene): ');
  const ownerPhone = await ask('👤 WhatsApp del dueño (ej: 18095551234): ');
  const nombreBot = await ask('🤖 Nombre del bot (ej: Luna, Sofía, Alex): ');
  const plan = await ask('💰 Plan (basico/estandar/completo): ');

  // Servicios
  console.log('');
  console.log('💼 Ahora agrega los servicios (escribe "listo" para terminar):');
  const servicios = [];
  let addingServices = true;
  while (addingServices) {
    const servNombre = await ask(`  Servicio ${servicios.length + 1} nombre (o "listo"): `);
    if (servNombre.toLowerCase() === 'listo') {
      addingServices = false;
      break;
    }
    const servPrecio = await ask(`  Precio en RD$: `);
    const servDuracion = await ask(`  Duración (ej: 30 minutos): `);
    servicios.push({
      nombre: servNombre,
      precio: parseInt(servPrecio) || 0,
      moneda: 'RD$',
      duracion: servDuracion,
      descripcion: ''
    });
  }

  if (servicios.length === 0) {
    servicios.push({ nombre: 'Servicio General', precio: 1000, moneda: 'RD$', duracion: '30 minutos', descripcion: '' });
  }

  // 2. Crear nombre de carpeta
  const folderName = 'chatbotIA-' + nombreNegocio
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const clientDir = path.join(__dirname, '..', folderName);

  // Encontrar puerto libre
  const basePort = 3000;
  let port = basePort;
  const existingDirs = fs.readdirSync(path.join(__dirname, '..')).filter(d => d.startsWith('chatbotIA'));
  port = basePort + existingDirs.length;

  console.log('');
  console.log(`📁 Carpeta: ${folderName}`);
  console.log(`🌐 Puerto: ${port}`);
  console.log('');

  const confirmar = await ask('¿Todo correcto? (s/n): ');
  if (confirmar.toLowerCase() !== 's') {
    console.log('❌ Cancelado.');
    rl.close();
    return;
  }

  // 3. Copiar archivos del proyecto
  console.log('');
  console.log('⏳ Creando proyecto del cliente...');

  // Crear directorio
  fs.mkdirSync(clientDir, { recursive: true });

  // Copiar archivos esenciales
  const filesToCopy = [
    'server.js',
    'package.json',
    'package-lock.json',
    'ecosystem.config.js'
  ];
  const dirsToCopy = ['src', 'public'];

  for (const file of filesToCopy) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(clientDir, file));
    }
  }

  for (const dir of dirsToCopy) {
    copyDirSync(path.join(__dirname, dir), path.join(clientDir, dir));
  }

  // Copiar node_modules (symlink para ahorrar espacio)
  const nmSrc = path.join(__dirname, 'node_modules');
  const nmDst = path.join(clientDir, 'node_modules');
  if (!fs.existsSync(nmDst)) {
    try {
      // Intentar symlink (ahorra espacio en disco)
      fs.symlinkSync(nmSrc, nmDst, 'junction');
      console.log('  ✅ node_modules vinculado (symlink)');
    } catch (e) {
      // Si falla, copiar
      console.log('  ⏳ Copiando node_modules (puede tomar un momento)...');
      copyDirSync(nmSrc, nmDst);
    }
  }

  // 4. Crear data/config.json
  const dataDir = path.join(clientDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'conversations'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'logs'), { recursive: true });

  const config = {
    negocio: {
      nombre: nombreNegocio,
      tipo: tipoNegocio,
      direccion: direccion,
      referencia: '',
      horario: {
        lunes_viernes: '8:00 AM - 6:00 PM',
        sabados: '8:00 AM - 2:00 PM',
        domingos: 'Cerrado'
      },
      dias_libres: ['Domingos', 'Feriados nacionales'],
      telefono: telefono,
      instagram: instagram || '',
      sitio_web: '',
      politica_cancelacion: 'Cancelaciones con menos de 24h de anticipación pueden incurrir en cargos.'
    },
    bot: {
      nombre: nombreBot || 'Asistente',
      plan: plan || 'completo'
    },
    servicios: servicios,
    servicio_estrella: servicios[0]?.nombre || '',
    promocion_actual: '',
    horarios_citas: {
      lunes_viernes: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'],
      sabados: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM']
    },
    formas_pago: ['Efectivo', 'Tarjeta', 'Transferencia'],
    perfil_cliente: '',
    preguntas_frecuentes: []
  };

  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dataDir, 'appointments.json'), '[]');

  // 5. Crear .env
  const envContent = `# ═══════════════════════════════════════════════
# ${nombreNegocio.toUpperCase()} — CHATBOT IA
# ═══════════════════════════════════════════════

# API Key de Groq (gratis)
GROQ_API_KEY=${process.env.GROQ_API_KEY || 'PEGA-TU-API-KEY-DE-GROQ-AQUI'}

# Puerto (cada cliente usa un puerto diferente)
PORT=${port}

# Plan activo
PLAN_ACTIVO=${plan || 'completo'}

# Modelo de IA
AI_MODEL=llama-3.3-70b-versatile

# WhatsApp del dueño (notificaciones de citas)
OWNER_PHONE=${ownerPhone}
`;

  fs.writeFileSync(path.join(clientDir, '.env'), envContent);

  // 6. Actualizar ecosystem.config.js con nombre correcto
  const ecoContent = `module.exports = {
  apps: [{
    name: '${folderName}',
    script: 'server.js',
    cwd: __dirname,
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 20,
    autorestart: true,
    env: { NODE_ENV: 'production' },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
`;
  fs.writeFileSync(path.join(clientDir, 'ecosystem.config.js'), ecoContent);

  // 7. Resumen final
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  ✅ ¡CLIENTE CREADO EXITOSAMENTE!');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log(`  📋 Negocio: ${nombreNegocio}`);
  console.log(`  📁 Carpeta: ${folderName}`);
  console.log(`  🌐 Dashboard: http://localhost:${port}`);
  console.log(`  👤 Dueño: ${ownerPhone}`);
  console.log(`  💰 Plan: ${plan}`);
  console.log(`  💼 Servicios: ${servicios.length}`);
  console.log('');
  console.log('  📌 PASOS SIGUIENTES:');
  console.log('');
  console.log(`  1. Abre una terminal en la carpeta: ${folderName}`);
  console.log(`  2. Ejecuta: pm2 start ecosystem.config.js`);
  console.log(`  3. Abre: http://localhost:${port}`);
  console.log(`  4. Escanea el QR con el WhatsApp del cliente`);
  console.log('');
  console.log('  ¡Listo! El bot del cliente estará funcionando. 🚀');
  console.log('');

  rl.close();
}

// Utilidad: copiar directorio recursivamente
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'auth_info' || entry.name === '.git') continue;
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  rl.close();
});
