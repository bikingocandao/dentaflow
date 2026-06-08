const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const target = `  socket.on('newAppointment', apt => {
    showToast(\`📅 Nueva cita: \${apt.nombre} —  \${apt.servicio}\`);
    fetchAppointments();
  });
}
  socket.on('complianceUpdate', ({ patientId, date, pct, done, total }) => {
    if (patientId === selectedPatientId) {
      updateComplianceGauge(done, total);
      showToast(\`📱 Paciente actualizó su plan: \${pct}% cumplido\`);
    }
  });`;

const replacement = `  socket.on('newAppointment', apt => {
    showToast(\`📅 Nueva cita: \${apt.nombre} —  \${apt.servicio}\`);
    fetchAppointments();
  });
  socket.on('complianceUpdate', ({ patientId, date, pct, done, total }) => {
    if (patientId === selectedPatientId) {
      updateComplianceGauge(done, total);
      showToast(\`📱 Paciente actualizó su plan: \${pct}% cumplido\`);
    }
  });
}`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Successfully moved complianceUpdate inside connectSocket!');
} else {
  console.error('❌ Target block not found. Let us try regex.');
  const regex = /socket\.on\(\s*['"]newAppointment['"][\s\S]*?\}\s*\);\s*\}\s*socket\.on\(\s*['"]complianceUpdate['"][\s\S]*?\}\s*\);/;
  const match = content.match(regex);
  if (match) {
    console.log('Found regex match:', JSON.stringify(match[0]));
    const fixedReplacement = `  socket.on('newAppointment', apt => {
    showToast(\`📅 Nueva cita: \${apt.nombre} —  \${apt.servicio}\`);
    fetchAppointments();
  });
  socket.on('complianceUpdate', ({ patientId, date, pct, done, total }) => {
    if (patientId === selectedPatientId) {
      updateComplianceGauge(done, total);
      showToast(\`📱 Paciente actualizó su plan: \${pct}% cumplido\`);
    }
  });
}`;
    content = content.replace(regex, fixedReplacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Successfully moved complianceUpdate inside connectSocket using regex!');
  } else {
    console.error('❌ Regex also failed.');
  }
}
