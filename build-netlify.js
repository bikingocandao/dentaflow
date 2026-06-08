const fs = require('fs');
const path = require('path');

const backendUrl = process.env.BACKEND_URL || '';

console.log('--- Iniciando compilación para Netlify ---');
console.log('BACKEND_URL detectado:', backendUrl || '(vacío - se usará la URL local)');

// 1. Generar public/config.js
const configContent = `// Archivo generado automáticamente durante el build de Netlify
window.BACKEND_URL = "${backendUrl}";
`;
const configPath = path.join(__dirname, 'public', 'config.js');
fs.writeFileSync(configPath, configContent);
console.log('✅ Archivo public/config.js generado.');

// 2. Generar public/_redirects para proxying de APIs y enrutamiento SPA
if (backendUrl) {
  const redirectsContent = `/api/*  ${backendUrl}/api/:splat  200!
/*      /index.html               200
`;
  const redirectsPath = path.join(__dirname, 'public', '_redirects');
  fs.writeFileSync(redirectsPath, redirectsContent);
  console.log('✅ Archivo public/_redirects generado con proxy del backend.');
} else {
  const redirectsContent = `/*      /index.html               200\n`;
  const redirectsPath = path.join(__dirname, 'public', '_redirects');
  fs.writeFileSync(redirectsPath, redirectsContent);
  console.log('⚠️ Sin BACKEND_URL. Generada redirección SPA estándar.');
}

console.log('--- Compilación completada con éxito ---');
