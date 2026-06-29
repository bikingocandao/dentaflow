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

## 🧩 Estado de las mejoras

- [x] ~~**HTTPS con dominio** para los webhooks~~ ✅ GUÍA LISTA → ver
      [GUIA_HTTPS_DOMINIO.md](GUIA_HTTPS_DOMINIO.md) (Nginx + Certbot, candado gratis).
- [x] ~~**Verificación de firma del webhook**~~ ✅ HECHO. Pon el secreto del webhook
      en `YCLOUD_WEBHOOK_SECRET` (lo da YCloud al crear el webhook). Si está, el bot
      rechaza cualquier POST con firma inválida (header `YCloud-Signature`).
- [x] ~~**Plantillas (templates) de YCloud** para recordatorios fuera de 24h~~ ✅ HECHO.
      Crea la plantilla en YCloud y configúrala (ver abajo).
- [x] ~~**Imágenes/audio entrantes por YCloud**~~ ✅ HECHO. El webhook ahora entiende
      texto, imagen (usa el caption), nota de voz/audio (la **transcribe** con Whisper),
      y video/documento (responde pidiendo texto).
- [x] ~~**Auto-registro del webhook** vía API de YCloud al crear el bot~~ ✅ HECHO
      (usa `PUBLIC_HOST`/`PUBLIC_PROTO` del panel maestro para armar la URL).
- [ ] **Editar YCloud de un bot ya creado** desde el panel (hoy se pone al crear;
      para cambiarlo se edita el `.env` del bot y se reinicia con `pm2 restart`).

---

## 🔐 Verificación de firma (anti-falsificación)
1. En YCloud, al crear/ver el webhook, copia su **Signing secret**.
2. Ponlo en el `.env` del bot:
   ```
   YCLOUD_WEBHOOK_SECRET=el-secreto-del-webhook
   ```
3. Reinicia el bot. Desde ahora, todo POST al webhook se valida; los falsos se rechazan (401).
   Si dejas la variable vacía, NO se exige firma (modo abierto, como antes).

## 📨 Plantillas para recordatorios (fuera de las 24h)
WhatsApp NO permite texto libre si pasaron +24h sin que el cliente escriba: hay que
usar una **plantilla aprobada**. Pasos:
1. En YCloud → WhatsApp → Templates, crea una plantilla de recordatorio. Ej. cuerpo:
   `Hola {{1}}, le recordamos su cita el {{2}} a las {{3}} para {{4}}.`
2. Espera a que Meta la **apruebe**.
3. En el `.env` del bot pon el nombre EXACTO y el idioma:
   ```
   YCLOUD_REMINDER_TEMPLATE=recordatorio_cita
   YCLOUD_TEMPLATE_LANG=es
   # (opcional) plantilla para recordatorios de retorno:
   YCLOUD_RETURN_TEMPLATE=recordatorio_retorno
   ```
   - Orden de variables del recordatorio de cita: **{{1}}=nombre, {{2}}=fecha, {{3}}=hora, {{4}}=servicio**.
   - Orden del de retorno: **{{1}}=nombre, {{2}}=motivo, {{3}}=negocio**.
4. Si no configuras plantilla, los recordatorios se mandan como texto (solo funcionan dentro de las 24h o por QR).

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
