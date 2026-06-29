// ═══════════════════════════════════════════════
//  👥 GESTIÓN DE CLIENTES — Módulo Multi-Tenant
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

/**
 * Copia un directorio recursivamente, excluyendo carpetas innecesarias.
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (['node_modules', 'auth_info', 'auth_info_baileys', 'logs', '.git', 'data'].includes(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Hace una petición HTTP a un cliente local y devuelve JSON.
 */
function fetchLocal(port, apiPath) {
  return new Promise(function (resolve) {
    var req = http.get('http://localhost:' + port + apiPath, { timeout: 3000 }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', function () { resolve(null); });
    req.on('timeout', function () { req.destroy(); resolve(null); });
  });
}

/**
 * Escanea el directorio padre buscando todas las instancias de chatbot.
 * Detecta carpetas que contengan server.js + src/whatsapp.js
 */
function getClientsList(templateDir) {
  var rootDir = path.resolve(templateDir, '..');
  var clients = [];

  try {
    var entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry.isDirectory()) continue;
      var dirPath = path.join(rootDir, entry.name);

      // Verificar que es una instancia de chatbot
      if (!fs.existsSync(path.join(dirPath, 'server.js')) ||
          !fs.existsSync(path.join(dirPath, 'src', 'whatsapp.js'))) {
        continue;
      }

      // Leer .env
      var port = 3000, plan = 'basico', ownerPhone = '';
      try {
        var env = fs.readFileSync(path.join(dirPath, '.env'), 'utf8');
        var m;
        if ((m = env.match(/PORT=(\d+)/))) port = parseInt(m[1]);
        if ((m = env.match(/PLAN_ACTIVO=(\w+)/))) plan = m[1];
        if ((m = env.match(/OWNER_PHONE=(.+)/))) ownerPhone = m[1].trim();
      } catch (e) { /* ignorar */ }

      // Leer config.json
      var businessName = entry.name;
      var botName = 'Asistente';
      var serviciosCount = 0;
      try {
        var config = JSON.parse(fs.readFileSync(path.join(dirPath, 'data', 'config.json'), 'utf8'));
        if (config.negocio && config.negocio.nombre) businessName = config.negocio.nombre;
        if (config.bot && config.bot.nombre) botName = config.bot.nombre;
        if (config.bot && config.bot.plan) plan = config.bot.plan;
        if (config.servicios) serviciosCount = config.servicios.length;
      } catch (e) { /* ignorar */ }

      clients.push({
        folder: entry.name,
        businessName: businessName,
        botName: botName,
        plan: plan,
        port: port,
        ownerPhone: ownerPhone,
        servicios: serviciosCount,
        isMain: (entry.name === path.basename(templateDir))
      });
    }
  } catch (e) {
    console.error('Error escaneando clientes:', e.message);
  }

  // Ordenar: principal primero, luego por nombre
  clients.sort(function (a, b) {
    if (a.isMain) return -1;
    if (b.isMain) return 1;
    return a.businessName.localeCompare(b.businessName);
  });

  return clients;
}

/**
 * Obtiene el estado en vivo de un cliente (status, QR, stats).
 */
async function getClientLiveStatus(port) {
  var results = await Promise.all([
    fetchLocal(port, '/api/status'),
    fetchLocal(port, '/api/stats')
  ]);
  var status = results[0];
  var stats = results[1];

  if (!status) {
    return {
      whatsapp: 'offline', qr: null, plan: '',
      totalMessages: 0, activeConversations: 0, totalAppointments: 0, uptime: 0
    };
  }

  return {
    whatsapp: status.whatsapp || 'offline',
    qr: status.qr || null,
    plan: status.plan || '',
    totalMessages: stats ? (stats.totalMessages || 0) : 0,
    activeConversations: stats ? (stats.activeConversations || 0) : 0,
    totalAppointments: stats ? (stats.totalAppointments || 0) : 0,
    uptime: stats ? (stats.uptime || 0) : 0
  };
}

/**
 * Crea un nuevo cliente clonando la plantilla del proyecto.
 */
function createClient(options) {
  var folderName = options.folderName;
  var businessName = options.businessName;
  var ownerPhone = options.ownerPhone;
  var plan = options.plan;
  var port = options.port;
  var templateDir = options.templateDir;
  var groqApiKey = options.groqApiKey; // 🔑 llave de IA propia de este negocio (opcional)
  var ycloudApiKey = options.ycloudApiKey; // 📲 WhatsApp oficial YCloud (opcional)
  var ycloudFrom = options.ycloudFrom;

  var rootDir = path.resolve(templateDir, '..');
  var clientDir = path.join(rootDir, folderName);

  if (fs.existsSync(clientDir)) {
    throw new Error('La carpeta ' + folderName + ' ya existe. Elige otro nombre.');
  }

  // 1. Copiar directorio (excluye node_modules, auth_info, data, logs)
  copyDirSync(templateDir, clientDir);

  // 2. Crear directorios necesarios
  var dataDir = path.join(clientDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'conversations'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'logs'), { recursive: true });

  // 3. Crear .env COMPLETO (hereda Supabase/admin del sistema si no se pasan)
  var jwtSecret = 'jwt-' + folderName + '-' + Math.random().toString(36).slice(2, 10);
  var adminUser = (options.adminUser || folderName);
  var adminPass = (options.adminPass || ('clave' + Math.floor(1000 + Math.random() * 9000)));
  var envLines = [
    '# ' + businessName.toUpperCase() + ' — CHATBOT IA',
    'GROQ_API_KEY=' + (groqApiKey || process.env.GROQ_API_KEY || ''),
    'PORT=' + port,
    'PLAN_ACTIVO=' + plan,
    'AI_MODEL=llama-3.3-70b-versatile',
    'OWNER_PHONE=' + ownerPhone,
    'BOT_NAME=' + folderName,
    'AUTH_DIR=' + path.join(clientDir, 'auth_info'),
    '',
    '# --- Base de datos en la nube (Supabase) ---',
    'SUPABASE_URL=' + (process.env.SUPABASE_URL || ''),
    'SUPABASE_KEY=' + (process.env.SUPABASE_KEY || ''),
    '',
    '# --- Acceso al panel admin ---',
    'ADMIN_USERNAME=' + adminUser,
    'ADMIN_PASSWORD=' + adminPass,
    'JWT_SECRET=' + jwtSecret
  ];
  // 📲 WhatsApp OFICIAL por YCloud (solo si se proporcionó)
  if (ycloudApiKey && ycloudFrom) {
    var ycFrom = String(ycloudFrom).replace(/[^0-9]/g, '');
    if (ycFrom.length === 10) ycFrom = '1' + ycFrom;
    envLines.push('');
    envLines.push('# --- WhatsApp OFICIAL (YCloud) — anti-baneo ---');
    envLines.push('YCLOUD_API_KEY=' + ycloudApiKey);
    envLines.push('YCLOUD_FROM=+' + ycFrom);
  }
  var envContent = envLines.join('\n') + '\n';
  fs.writeFileSync(path.join(clientDir, '.env'), envContent);
  // Guardar credenciales del panel para mostrarlas a quien crea el bot
  options._adminUser = adminUser;
  options._adminPass = adminPass;

  // 4. Crear config.json limpio
  var config = {
    negocio: {
      nombre: businessName, tipo: '', direccion: '', referencia: '',
      horario: { lunes_viernes: '8:00 AM - 6:00 PM', sabados: '8:00 AM - 2:00 PM', domingos: 'Cerrado' },
      dias_libres: ['Domingos', 'Feriados nacionales'],
      telefono: '', instagram: '', sitio_web: '', politica_cancelacion: ''
    },
    bot: { nombre: 'Asistente', plan: plan },
    servicios: [{ nombre: 'Servicio General', precio: 1000, moneda: 'RD$', duracion: '30 minutos', descripcion: '' }],
    servicio_estrella: '', promocion_actual: '',
    horarios_citas: {
      lunes_viernes: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'],
      sabados: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM']
    },
    formas_pago: ['Efectivo', 'Tarjeta', 'Transferencia'],
    perfil_cliente: '', preguntas_frecuentes: []
  };
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dataDir, 'appointments.json'), '[]');

  // 5. Crear ecosystem.config.js
  var ecoContent = 'module.exports = {\n  apps: [{\n'
    + '    name: "chatbot-' + folderName + '",\n'
    + '    script: "./server.js",\n    cwd: __dirname,\n    watch: false,\n'
    + '    max_memory_restart: "500M",\n    restart_delay: 5000,\n    max_restarts: 20,\n    autorestart: true,\n'
    + '    env: { NODE_ENV: "production" },\n'
    + '    error_file: "./logs/error.log",\n    out_file: "./logs/output.log",\n'
    + '    merge_logs: true,\n    log_date_format: "YYYY-MM-DD HH:mm:ss",\n'
    + '    kill_timeout: 5000,\n    listen_timeout: 10000\n  }]\n};\n';
  fs.writeFileSync(path.join(clientDir, 'ecosystem.config.js'), ecoContent);

  // 6. Symlink node_modules + arrancar PM2
  try {
    var nmSrc = path.join(templateDir, 'node_modules');
    var nmDst = path.join(clientDir, 'node_modules');
    if (fs.existsSync(nmSrc) && !fs.existsSync(nmDst)) {
      try { fs.symlinkSync(nmSrc, nmDst, 'junction'); }
      catch (e) { execSync('npm install --production', { cwd: clientDir, stdio: 'ignore', timeout: 120000 }); }
    }
    execSync('pm2 start ecosystem.config.js', { cwd: clientDir, stdio: 'ignore', timeout: 30000 });
    try { execSync('pm2 save', { stdio: 'ignore', timeout: 10000 }); } catch (e) { /* ok */ }
  } catch (error) {
    console.error('⚠️ Error iniciando PM2:', error.message);
  }

  var ycloudOn = !!(ycloudApiKey && ycloudFrom);
  return {
    success: true,
    url: 'http://localhost:' + port,
    folder: folderName,
    port: port,
    adminUser: options._adminUser,
    adminPass: options._adminPass,
    whatsapp: ycloudOn ? 'ycloud' : 'qr',
    ycloudWebhook: ycloudOn ? ('/webhook/ycloud (regístralo en YCloud apuntando a http://TU-IP:' + port + '/webhook/ycloud)') : null
  };
}

module.exports = { createClient, getClientsList, getClientLiveStatus };
