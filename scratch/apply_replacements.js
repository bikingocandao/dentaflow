const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf-8');

const replacements = [
  { from: 'Ã°Å¸Â¦·', to: '🦷' },
  { from: 'Ã°Å¸â€œÂ±', to: '📱' },
  { from: 'Ã°Å¸â€ â€™', to: '🔑' },
  { from: 'Ã°Å¸Â Â¢', to: '🏢' },
  { from: 'Ã°Å¸â€™Â¼', to: '💼' },
  { from: 'Ã°Å¸â€ Â ', to: '🔒' },
  { from: 'Ã¢Å’Â«', to: '⌫' },
  { from: 'Ã¢Å“â€œ', to: '✓' },
  { from: 'Ã°Å¸â€œÂ©', to: '✉️' },
  { from: 'Ã°Å¸â€œâ€¦', to: '📅' },
  { from: 'Ã°Å¸â€™Â¬', to: '💬' },
  { from: 'Ã¢Â Å’', to: '❌' },
  { from: 'Ã°Å¸Å’Â ', to: '🌐' },
  { from: 'Ã¢â€”Â ', to: '●' },
  
  // Accents and punctuation
  { from: 'Ã‚Â¿', to: '¿' },
  { from: 'Ãƒâ€œ', to: 'Ó' },
  { from: 'ÃƒÂ³', to: 'ó' },
  { from: 'ÃƒÂ¡', to: 'á' },
  { from: 'ÃƒÂ©', to: 'é' },
  { from: 'ÃƒÂad', to: 'íd' }, // e.g. Cédula de Identidad
  { from: 'ÃƒÂ', to: 'í' },
  { from: 'ÃƒÂº', to: 'ú' },
  { from: 'ÃƒÂ±', to: 'ñ' },
  { from: 'Ã‚Â', to: '' },
  
  // Specific words
  { from: 'AUTENTICACIÃƒâ€œN', to: 'AUTENTICACIÓN' },
  { from: 'CONFIGURACIÃƒâ€œN', to: 'CONFIGURACIÓN' },
  { from: 'ACTUALIZACIÃƒâ€œN', to: 'ACTUALIZACIÓN' },
  { from: 'MÃƒâ€œVIL', to: 'MÓVIL' },
  
  // Characters and symbols
  { from: 'Ã¢â‚¬Â¢', to: '•' },
  { from: 'Ã¢â€ â‚¬', to: '─' },
  { from: 'Ã¢â€¢Â ', to: '═' }
];

replacements.forEach(r => {
  // Use split/join to replace all occurrences globally
  content = content.split(r.from).join(r.to);
});

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully applied all replacements to index.html');
