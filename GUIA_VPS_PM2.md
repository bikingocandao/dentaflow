# 🖥️ Guía: Montar los bots en un VPS con PM2 (para varios negocios)

Esta guía monta tu sistema en un servidor (VPS) para correr varios bots 24/7.
Hecha para seguir paso a paso, sin experiencia previa.

---

## FASE 1 — Rentar el VPS (servidor)
1. Entra a un proveedor de VPS (cualquiera):
   - **Contabo** (el más barato), **Hetzner**, **DigitalOcean** (el más fácil), **Vultr**.
2. Crea un servidor con:
   - Sistema: **Ubuntu 22.04 LTS**
   - RAM: **4 GB** (suficiente para ~10 negocios)
3. Anota: la **IP del servidor** y la **contraseña de root** (te llegan por correo/panel).

---

## FASE 2 — Conectarte al servidor (SSH)
Desde tu PC con Windows, abre **PowerShell** o **CMD** y escribe (cambia la IP):
```
ssh root@LA_IP_DE_TU_SERVIDOR
```
- La primera vez te pregunta `yes/no` → escribe **yes**.
- Pega/escribe la **contraseña** (no se ve mientras escribes, es normal) y Enter.

✅ Si ves algo como `root@...:~#`, ya estás dentro.

---

## FASE 3 — Instalar Node.js, Git y PM2
Copia y pega estos comandos (uno por uno o todos):
```
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2
```
Verifica que quedó:
```
node -v
pm2 -v
```
✅ Deben mostrar números de versión.

---

## FASE 4 — Descargar tu proyecto
```
git clone https://github.com/bikingocandao/dentaflow.git
cd dentaflow
npm install
```

---

## FASE 5 — Configurar el "panel maestro" (.env)
Crea el archivo de configuración:
```
nano .env
```
Pega esto (cambia los valores por los tuyos) y guarda con **Ctrl+O, Enter, Ctrl+X**:
```
GROQ_API_KEY=tu-llave-de-groq
PORT=3000
PLAN_ACTIVO=completo
AI_MODEL=llama-3.3-70b-versatile
ADMIN_USERNAME=carlos luis
ADMIN_PASSWORD=1213686
JWT_SECRET=dentaflow-secret-key-9988
SUPABASE_URL=https://zajphxjmohccdkkbkmvk.supabase.co
SUPABASE_KEY=tu-llave-de-supabase
OWNER_PHONE=18299931049
```

Arranca el panel maestro:
```
pm2 start server.js --name panel-maestro
```
Ábrelo en el navegador: `http://LA_IP_DE_TU_SERVIDOR:3000`

---

## FASE 6 — Crear cada negocio
Por cada negocio nuevo, desde el panel (o con el script `nuevo-cliente`):
- Le pones: **nombre del negocio**, **su número de WhatsApp (OWNER_PHONE)**,
  **su puerto** (3001, 3002, 3003… uno distinto cada uno) y **su llave de Groq**.
- Esto genera una carpeta con su `.env` y su `ecosystem.config.js`.

Arranca ese negocio:
```
cd /root/NOMBRE_DE_LA_CARPETA_DEL_NEGOCIO
pm2 start ecosystem.config.js
cd /root/dentaflow
```

Repite para cada negocio (cambiando el puerto).

---

## FASE 7 — Que todo arranque solo si el servidor se reinicia
```
pm2 save
pm2 startup
```
(El segundo comando te da una línea extra para copiar y pegar — hazlo.)

---

## FASE 8 — Conectar WhatsApp de cada negocio
- Abre el panel de cada negocio: `http://LA_IP:PUERTO` (ej. 3001).
- Escanea el **QR de WhatsApp** con el número de ESE negocio.

---

## COMANDOS ÚTILES (del día a día)
```
pm2 list            # ver todos los bots y su estado
pm2 logs            # ver lo que está pasando (Ctrl+C para salir)
pm2 restart all     # reiniciar todos
pm2 stop nombre     # detener uno
pm2 delete nombre   # quitar uno
```

---

## 💡 Recomendaciones
- Empieza con **1 negocio de prueba** antes de los 10.
- Usa **puertos distintos** por negocio (3001, 3002, …).
- Cada negocio: **su número** y **su llave de Groq**.
- El **anti-baneo** ya está activo (recordatorios espaciados).
