# 🔒 Guía: HTTPS con dominio para los webhooks (Nginx + Certbot)

Para que tus bots tengan URLs **profesionales y seguras** (https://) en vez de
`http://IP:PUERTO`. Esto es lo ideal para los webhooks de YCloud.

> Resultado final: cada bot accesible en `https://cliente1.tudominio.com`,
> con candado 🔒 y certificado gratis (Let's Encrypt) que se renueva solo.

---

## 🧩 ¿Cómo funciona? (en simple)
Nginx actúa de **portero**: recibe todo en el puerto seguro 443 (HTTPS) y reparte
cada dominio al puerto interno del bot que corresponde:

```
https://cliente1.tudominio.com  →  Nginx  →  http://localhost:3001  (bot 1)
https://cliente2.tudominio.com  →  Nginx  →  http://localhost:3002  (bot 2)
```

---

## FASE 1 — Tener un dominio y apuntarlo al VPS
1. Compra un dominio (Hostinger, Namecheap, etc.), ej: `tudominio.com`.
2. En el DNS del dominio crea registros **A** apuntando a la **IP de tu VPS**:
   - `cliente1.tudominio.com` → IP del VPS
   - `cliente2.tudominio.com` → IP del VPS
   - (o un comodín `*.tudominio.com` → IP del VPS para no crear uno por uno)
3. Espera unos minutos a que propague.

---

## FASE 2 — Instalar Nginx y Certbot (en el VPS)
```bash
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx
```

---

## FASE 3 — Crear la configuración de un cliente
Crea el archivo (cambia el nombre del cliente y el puerto):
```bash
nano /etc/nginx/sites-available/cliente1
```
Pega esto (cambia `cliente1.tudominio.com` y el puerto `3001`):
```nginx
server {
    server_name cliente1.tudominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Guarda (**Ctrl+O, Enter, Ctrl+X**) y actívalo:
```bash
ln -s /etc/nginx/sites-available/cliente1 /etc/nginx/sites-enabled/
nginx -t        # comprueba que no haya errores
systemctl reload nginx
```

> 💡 El bloque `Upgrade/Connection` es para que funcione el panel en vivo
> (WebSocket/Socket.IO) a través de HTTPS.

---

## FASE 4 — Activar el candado HTTPS (certificado gratis)
```bash
certbot --nginx -d cliente1.tudominio.com
```
- Te pide un correo y aceptar términos.
- Elige la opción de **redirigir todo a HTTPS** cuando pregunte.
- ✅ Certbot edita Nginx solo y deja el `https://` funcionando.

El certificado **se renueva automáticamente**. Para comprobarlo:
```bash
certbot renew --dry-run
```

---

## FASE 5 — Repetir por cada cliente
Repite FASE 3 y 4 cambiando el subdominio y el puerto (`cliente2` → 3002, etc.).

---

## FASE 6 — Decirle al sistema que use HTTPS
En el `.env` del **panel maestro** (el que crea los bots), pon:
```
PUBLIC_PROTO=https
PUBLIC_HOST=tudominio.com
```
> Nota: con subdominios por cliente, lo más cómodo es registrar el webhook a mano
> en YCloud con la URL exacta del cliente, ej:
> `https://cliente1.tudominio.com/webhook/ycloud`
> (el auto-registro sirve para el caso IP:PUERTO; con subdominios revisa que la URL final sea la del cliente.)

---

## ✅ Resultado
- `https://cliente1.tudominio.com` → panel del bot 1, con candado 🔒.
- Webhook de YCloud del cliente 1: `https://cliente1.tudominio.com/webhook/ycloud`.
- Más seguro, más profesional, y sin avisos de "sitio no seguro".

---

## 🆘 Problemas comunes
- **"connection refused"**: el bot (PM2) no está corriendo en ese puerto → `pm2 list`.
- **Certbot falla**: el dominio aún no apunta al VPS (DNS sin propagar) → espera y reintenta.
- **502 Bad Gateway**: Nginx está bien pero el bot está caído → `pm2 restart <nombre>`.
- **El panel en vivo no carga**: revisa que pusiste el bloque `Upgrade/Connection`.
