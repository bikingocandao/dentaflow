#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  crear-negocio.sh — Crea un negocio nuevo en segundos
#  Uso (dentro del VPS, en /root):   bash dentaflow/crear-negocio.sh
#  Te pregunta los datos, arma la carpeta, el .env y lo arranca con PM2.
# ═══════════════════════════════════════════════════════════════
set -e

VERDE='\033[0;32m'; AZUL='\033[0;34m'; ROJO='\033[0;31m'; AMA='\033[1;33m'; NC='\033[0m'
BASE_DIR="/root"
MOLDE="$BASE_DIR/dentaflow"   # carpeta base (la que clonaste de GitHub)

echo -e "${AZUL}═══════════════════════════════════════════${NC}"
echo -e "${AZUL}   🏢  CREAR NEGOCIO NUEVO (bot WhatsApp)   ${NC}"
echo -e "${AZUL}═══════════════════════════════════════════${NC}"

# --- Verificar que existe el molde ---
if [ ! -d "$MOLDE" ]; then
  echo -e "${ROJO}❌ No encuentro la carpeta base en $MOLDE${NC}"
  echo -e "   Primero clónala:  cd /root && git clone https://github.com/bikingocandao/dentaflow.git"
  exit 1
fi

# --- Sugerir el próximo puerto libre (3001, 3002, ...) ---
SUG_PORT=3001
while ss -ltn 2>/dev/null | grep -q ":$SUG_PORT " || [ -d "$BASE_DIR/negocio_$SUG_PORT" ]; do
  SUG_PORT=$((SUG_PORT+1))
done

# --- Preguntas ---
read -rp "👉 Nombre corto del negocio (sin espacios, ej: clinicasol): " NEG
NEG=$(echo "$NEG" | tr ' ' '_' | tr -cd '[:alnum:]_')
[ -z "$NEG" ] && { echo -e "${ROJO}Nombre vacío. Cancelado.${NC}"; exit 1; }

read -rp "👉 Puerto [$SUG_PORT]: " PORT
PORT=${PORT:-$SUG_PORT}

read -rp "👉 Número del DUEÑO con código país (ej: 18290000001): " OWNER
OWNER=$(echo "$OWNER" | tr -cd '0-9')

read -rp "👉 Llave de Groq (GROQ_API_KEY) de este negocio: " GROQ

read -rp "👉 Usuario admin del panel [$NEG]: " ADMUSER
ADMUSER=${ADMUSER:-$NEG}

read -rp "👉 Contraseña admin del panel: " ADMPASS
[ -z "$ADMPASS" ] && ADMPASS="cambiar_$RANDOM"

# Supabase: por defecto el compartido (puedes cambiarlo)
DEF_SB_URL="https://zajphxjmohccdkkbkmvk.supabase.co"
read -rp "👉 SUPABASE_URL [$DEF_SB_URL]: " SBURL
SBURL=${SBURL:-$DEF_SB_URL}
read -rp "👉 SUPABASE_KEY (anon) de este negocio: " SBKEY

# YCloud (opcional, anti-baneo)
echo -e "${AMA}— WhatsApp OFICIAL por YCloud (opcional; Enter para saltar) —${NC}"
read -rp "👉 YCLOUD_API_KEY (opcional): " YCK
read -rp "👉 YCLOUD_FROM, ej +1829XXXXXXX (opcional): " YCF

DEST="$BASE_DIR/negocio_$PORT"
if [ -d "$DEST" ]; then
  echo -e "${ROJO}❌ Ya existe $DEST. Usa otro puerto.${NC}"; exit 1
fi

# --- Crear carpeta a partir del molde (sin copiar sesión ni datos) ---
echo -e "${AZUL}📁 Creando $DEST ...${NC}"
cp -r "$MOLDE" "$DEST"
rm -rf "$DEST/auth_info" "$DEST/.git" "$DEST/data" 2>/dev/null || true

# --- Escribir el .env ---
cat > "$DEST/.env" <<EOF
PORT=$PORT
GROQ_API_KEY=$GROQ
PLAN_ACTIVO=completo
AI_MODEL=llama-3.3-70b-versatile
ADMIN_USERNAME=$ADMUSER
ADMIN_PASSWORD=$ADMPASS
JWT_SECRET=secreto-$NEG-$RANDOM
SUPABASE_URL=$SBURL
SUPABASE_KEY=$SBKEY
OWNER_PHONE=$OWNER
BOT_NAME=$NEG
AUTH_DIR=$DEST/auth_info
EOF

# YCloud solo si lo dieron
if [ -n "$YCK" ] && [ -n "$YCF" ]; then
  echo "YCLOUD_API_KEY=$YCK" >> "$DEST/.env"
  echo "YCLOUD_FROM=$YCF"   >> "$DEST/.env"
fi

# --- Instalar dependencias y arrancar ---
echo -e "${AZUL}📦 Instalando dependencias...${NC}"
( cd "$DEST" && npm install --omit=dev >/dev/null 2>&1 || npm install >/dev/null 2>&1 )

echo -e "${AZUL}🚀 Arrancando con PM2...${NC}"
( cd "$DEST" && pm2 start server.js --name "$NEG" )
pm2 save >/dev/null 2>&1 || true

IP=$(hostname -I | awk '{print $1}')
echo -e "${VERDE}"
echo "═══════════════════════════════════════════"
echo "  ✅ NEGOCIO CREADO: $NEG"
echo "═══════════════════════════════════════════"
echo -e "${NC}"
echo "  Panel:    http://$IP:$PORT"
echo "  Usuario:  $ADMUSER"
echo "  Clave:    $ADMPASS"
echo "  Dueño:    $OWNER"
if [ -n "$YCK" ] && [ -n "$YCF" ]; then
  echo "  WhatsApp: OFICIAL (YCloud) → registra el webhook:"
  echo "            http://$IP:$PORT/webhook/ycloud"
else
  echo "  WhatsApp: por QR → abre el panel y escanéalo con el número del negocio"
fi
echo ""
echo "  Ver estado:  pm2 list"
echo "  Ver logs:    pm2 logs $NEG"
echo ""
