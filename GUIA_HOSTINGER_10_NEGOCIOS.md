# 🖥️ Guía Hostinger — Montar 10 negocios paso a paso (clic por clic)

Para personas SIN experiencia técnica. Síguela en orden, de arriba hacia abajo.
Al terminar tendrás 10 bots corriendo 24/7 en UN solo servidor de Hostinger.

> 💡 Idea clave: **1 negocio = 1 carpeta = 1 puerto = 1 número de WhatsApp.**
> Son 10 copias del mismo bot, cada una con su número y sus datos. Nunca se mezclan.

---

## 🛒 FASE 1 — Comprar el VPS en Hostinger

1. Entra a **hostinger.com** → menú **VPS Hosting**.
2. Elige el plan **KVM 2** (lo ideal para 10 negocios):
   - **2 vCPU · 8 GB RAM · 100 GB disco**
   - Si quieres empezar barato con pocos negocios, **KVM 1** (1 vCPU, 4 GB) aguanta ~4-5.
3. En la configuración del servidor:
   - **Sistema operativo:** elige **Ubuntu 22.04** (sin panel).
   - **Ubicación del servidor:** la más cercana (ej. EE. UU. / Brasil).
   - **Contraseña de root:** invéntate una y **GUÁRDALA** (la vas a necesitar). Apúntala en un papel.
4. Paga y espera 2-5 minutos a que diga **"Activo / Running"**.

---

## 🔌 FASE 2 — Entrar al servidor (SIN instalar nada)

Hostinger trae una **Terminal del navegador** — no necesitas programas extra.

1. En el panel de Hostinger → tu VPS → busca el botón **"Terminal del navegador"** (Browser terminal).
2. Se abre una pantalla negra. Si te pide usuario: `root` y tu contraseña de root.
3. Cuando veas algo como `root@srv...:~#` → **ya estás dentro.** 🎉

> (Alternativa desde tu PC: abrir **PowerShell** y escribir `ssh root@LA-IP-DEL-VPS`.)

---

## ⚙️ FASE 3 — Instalar lo necesario (copiar y pegar)

Pega este bloque completo y dale Enter. Instala Node.js, Git y PM2 (el "vigilante" que mantiene los bots vivos):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
apt-get install -y nodejs git && \
npm install -g pm2 && \
node -v && pm2 -v
```

✅ Si al final salen dos números de versión (ej. `v20.x` y `5.x`), todo bien.

---

## 📥 FASE 4 — Descargar el bot la primera vez

```bash
cd /root
git clone https://github.com/bikingocandao/dentaflow.git
```

Esto crea la carpeta base `/root/dentaflow`. **No la toques** — la usaremos de molde.

---

## 🏢 FASE 5 — Crear el NEGOCIO #1

Cada negocio vive en su propia carpeta. Para el negocio 1:

```bash
cd /root
cp -r dentaflow negocio1
cd negocio1
npm install
nano .env
```

Se abre un editor. Pega esto y **cambia los valores** por los del cliente:

```
PORT=3001
GROQ_API_KEY=la-llave-groq-de-ESTE-negocio
PLAN_ACTIVO=completo
AI_MODEL=llama-3.3-70b-versatile
ADMIN_USERNAME=clinica1
ADMIN_PASSWORD=ponleUnaClave1
JWT_SECRET=secreto-unico-negocio1
SUPABASE_URL=https://zajphxjmohccdkkbkmvk.supabase.co
SUPABASE_KEY=tu-llave-supabase
OWNER_PHONE=18290000001
BOT_NAME=negocio1

# (Opcional, anti-baneo oficial) WhatsApp por YCloud:
# YCLOUD_API_KEY=la-llave-ycloud-de-este-negocio
# YCLOUD_FROM=+1829XXXXXXX
```

Guarda con **Ctrl+O → Enter → Ctrl+X**.

Arranca el negocio 1:

```bash
pm2 start server.js --name negocio1
```

---

## 🔁 FASE 6 — Repetir para los 10 (lo mismo, cambiando 3 cosas)

Por cada negocio nuevo cambia SOLO:
- El **número de carpeta** (`negocio2`, `negocio3`, …)
- El **PORT** (3002, 3003, … uno distinto cada uno)
- Su **OWNER_PHONE**, su **GROQ_API_KEY** y su **ADMIN_PASSWORD**

Ejemplo negocio 2:
```bash
cd /root
cp -r dentaflow negocio2
cd negocio2
npm install
nano .env        # PORT=3002, su número, su llave... guardar
pm2 start server.js --name negocio2
```

…y así hasta `negocio10` con `PORT=3010`.

---

## 💾 FASE 7 — Que todo arranque solo si el servidor se reinicia

```bash
pm2 save
pm2 startup
```

El segundo comando imprime **una línea extra** — cópiala, pégala y dale Enter.

---

## 📱 FASE 8 — Conectar el WhatsApp de cada negocio

Cada bot tiene su panel en su puerto:
- Negocio 1 → `http://LA-IP-DEL-VPS:3001`
- Negocio 2 → `http://LA-IP-DEL-VPS:3002`
- … etc.

En cada panel:
- **Si usas YCloud (recomendado):** ya conecta solo; registra el webhook
  `http://LA-IP:PUERTO/webhook/ycloud` en YCloud (evento *inbound message*).
- **Si usas QR (Baileys):** escanea el **QR** con el número de ESE negocio.

---

## 🧰 COMANDOS DEL DÍA A DÍA

```bash
pm2 list            # ver los 10 bots y si están "online"
pm2 logs negocio3   # ver qué pasa en el negocio 3 (Ctrl+C para salir)
pm2 restart negocio3
pm2 stop negocio3
pm2 monit           # monitor en vivo (RAM/CPU de cada uno)
```

### Actualizar un negocio cuando mejore el código:
```bash
cd /root/negocio3
git pull
npm install
pm2 restart negocio3
```

---

## ✅ Checklist antes de cobrarle al cliente
- [ ] El bot responde en su número.
- [ ] Las citas/contactos aparecen en el panel y en Supabase.
- [ ] El reporte diario llega al dueño.
- [ ] El número del cliente está protegido (YCloud) o estable (QR sin baneos).

---

## 💡 Consejos de oro
- **Empieza con 1 negocio de prueba** antes de los 10.
- Da a cada negocio **su propia llave de Groq** (gratis) → así nunca se saturan entre sí.
- Para clientes que pagan en serio → usa **YCloud** (número oficial, no se banea).
- Haz un **respaldo** del VPS (Hostinger lo ofrece) una vez al mes.
