# 📲 Integración YCloud por cliente (multi-bot) — Lo que falta / checklist

Aquí queda anotado cómo registrar cada cliente con su **WhatsApp oficial (YCloud)**
desde el **Panel Multi-Bots**, y lo que falta por hacer de tu lado (manual) para
que quede 100% funcionando.

---

## ✅ Lo que YA quedó hecho en el sistema
- En el formulario **"Nuevo Bot"** (panel Multi-Bots) ahora hay campos para:
  - **Llave de Groq** (IA) del cliente — opcional.
  - **YCloud API Key** del cliente — opcional.
  - **Número YCloud (From)** — opcional.
- Al crear el bot, el `.env` se genera **completo**: Groq, Supabase, login admin,
  JWT y, si los llenaste, **YCLOUD_API_KEY + YCLOUD_FROM**.
- El bot ya trae el **webhook** `POST /webhook/ycloud` para recibir mensajes.
- Si das llave + número de YCloud → el bot responde por la **API oficial** (no se banea).
  Si los dejas vacíos → el cliente conecta por **QR**.

---

## 🔧 Lo que FALTA hacer de tu lado por cada cliente (manual)

### 1) Tener la cuenta YCloud del cliente
- Cada cliente necesita su **número en YCloud** (WhatsApp Business API) y su **API Key**.
- Estado del número en YCloud debe ser **CONNECTED**.

### 2) Crear el bot en el Panel Multi-Bots
- Llena: Carpeta, Nombre, Teléfono dueño, Plan, Puerto.
- Pega la **YCloud API Key** y el **Número YCloud (From)** (ej. `+18290000000`).
- Clic en **Crear y Levantar**.
- Anota el **usuario y clave del panel** que te muestra al terminar.

### 3) Registrar el WEBHOOK en YCloud — ¡AHORA ES AUTOMÁTICO! ✅
Al crear el bot con YCloud, el sistema **registra el webhook solo** en YCloud
(evento `whatsapp.inbound_message.received`). Te avisa en pantalla si quedó
registrado ✓ o si hay que hacerlo a mano.

**Para que la URL sea correcta**, dile al sistema cuál es tu IP/dominio público
poniendo esta variable en el `.env` del **panel maestro** (el que crea los bots):
```
PUBLIC_HOST=TU-IP-O-DOMINIO     (solo la IP o dominio, SIN http y SIN puerto)
PUBLIC_PROTO=http               (o https si usas dominio con certificado)
```
Si no la pones, intenta adivinar la IP desde la conexión (suele funcionar en VPS).

**Si por alguna razón no se registró solo**, hazlo a mano en YCloud → Webhooks:
```
http://TU-IP-DEL-VPS:PUERTO/webhook/ycloud
```
- Cambia `PUERTO` por el del bot (3001, 3002, …).
- Evento: **whatsapp.inbound_message.received**.

> ⚠️ YCloud necesita una URL pública. En el VPS funciona con `http://IP:PUERTO`.
> Para más seguridad/profesionalismo, usa un **dominio con HTTPS** (pendientes abajo).

### 4) Probar
- Desde otro celular, escribe al número del cliente.
- El bot debe responder por la API oficial.
- Revisa que la cita/contacto aparezca en el panel y en Supabase.

### 5) Seguridad
- Después de probar, **rota (cambia) la API Key** si la pegaste en algún chat.

---

## 🧩 Pendientes recomendados (mejoras, no obligatorias para arrancar)

- [ ] **HTTPS con dominio** para los webhooks (ej. `cliente1.tudominio.com`).
      Hoy funciona con `http://IP:PUERTO`, pero HTTPS es más profesional y seguro.
      Se logra con Nginx + Certbot (Let's Encrypt) como "proxy" delante de los puertos.
- [ ] **Verificación de firma del webhook de YCloud** (validar que el POST viene
      de YCloud y no de un tercero). Hoy aceptamos cualquier POST al endpoint.
- [ ] **Plantillas (templates) de YCloud** para mensajes que inicia el negocio
      (recordatorios fuera de la ventana de 24h). Meta exige plantilla aprobada.
- [ ] **Soporte de imágenes/audio entrantes por YCloud** (hoy el webhook solo
      procesa `type === 'text'`).
- [x] ~~**Auto-registro del webhook** vía API de YCloud al crear el bot~~ ✅ HECHO
      (usa `PUBLIC_HOST`/`PUBLIC_PROTO` del panel maestro para armar la URL).
- [ ] **Editar YCloud de un bot ya creado** desde el panel (hoy se pone al crear;
      para cambiarlo se edita el `.env` del bot y se reinicia con `pm2 restart`).

---

## 📌 Resumen de variables en el `.env` de cada bot
```
GROQ_API_KEY=...           (IA del cliente o la del sistema)
PORT=3001                  (único por bot)
OWNER_PHONE=1829...        (dueño, para reportes/avisos)
SUPABASE_URL=...           (heredado del sistema)
SUPABASE_KEY=...           (heredado del sistema)
ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET  (login del panel)
YCLOUD_API_KEY=...         (si usa WhatsApp oficial)
YCLOUD_FROM=+1829...       (número oficial del cliente)
```
Si `YCLOUD_API_KEY` y `YCLOUD_FROM` están → usa API oficial. Si no → usa QR.
