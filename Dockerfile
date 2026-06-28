# ─────────────────────────────────────────────
# Dockerfile — Clinic Full (bot de WhatsApp con IA)
# Empaqueta el bot en un contenedor para correrlo en cualquier servidor.
# ─────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Instalar dependencias primero (aprovecha la caché de Docker)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copiar el resto del proyecto
COPY . .

# Puerto del panel/servidor (se puede cambiar con la variable PORT)
EXPOSE 3000

# Arrancar el bot
CMD ["node", "server.js"]
