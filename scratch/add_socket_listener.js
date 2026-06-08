const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Use a regular expression that is lenient on whitespace, carriage returns, and character encoding/symbols
const regex = /socket\.on\(\s*['"]newAppointment['"]\s*,\s*apt\s*=>\s*\{[\s\S]*?fetchAppointments\(\);[\s\S]*?\}\s*\);[\s\S]*?\}/;

const match = content.match(regex);
if (match) {
  console.log('Found match:', JSON.stringify(match[0]));
  
  const replacement = `${match[0]}
  socket.on('complianceUpdate', ({ patientId, date, pct, done, total }) => {
    if (patientId === selectedPatientId) {
      updateComplianceGauge(done, total);
      showToast(\`📱 Paciente actualizó su plan: \${pct}% cumplido\`);
    }
  });`;
  
  content = content.replace(regex, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Successfully added complianceUpdate listener using regex!');
} else {
  console.error('❌ Regex did not match any socket.on("newAppointment") block in index.html');
  // Print lines 1765-1775 to see what is actually there
  const lines = content.split('\n');
  console.log('Lines 1765 to 1775:');
  for (let i = 1764; i < Math.min(lines.length, 1775); i++) {
    console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
  }
}
