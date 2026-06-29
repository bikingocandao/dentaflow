# 💰 Costos reales y cuánto cobrar (modelo de negocio para 10 clínicas)

Números aproximados a 2026. La moneda base es USD; al lado pongo RD$ usando
**1 USD ≈ 60 RD$** (ajústalo al cambio del día). Las tarifas exactas de Hostinger
y WhatsApp varían por promociones y país — usa esto como guía realista.

---

## 1) ¿QUÉ TE CUESTA A TI? (gastos fijos mensuales)

| Concepto | Costo mensual (USD) | En RD$ | Notas |
|---|---|---|---|
| **VPS Hostinger KVM 2** (8 GB) | $8 – $14 | RD$480 – 840 | UN servidor para los 10 negocios |
| **Groq (IA)** | $0 | RD$0 | Gratis. Una llave por negocio |
| **OpenRouter (respaldo IA)** | $0 – $5 | RD$0 – 300 | Solo si Groq falla. Opcional |
| **Supabase (base de datos)** | $0 | RD$0 | Plan gratis aguanta varios negocios |
| **Dominio (opcional)** | ~$1 | RD$60 | Solo si quieres URL bonita |
| **WhatsApp** | Ver abajo 👇 | — | Depende de QR o YCloud |

### 💸 El costo de WhatsApp (lo más importante de entender)
- **Opción QR (Baileys):** **$0** en mensajes… pero **riesgo de baneo**. Sirve para empezar/probar.
- **Opción YCloud (oficial, anti-baneo):**
  - **Mensajes que inicia el CLIENTE** (el paciente te escribe primero): desde finales de 2024 Meta los hizo **GRATIS** (ventana de 24h de "servicio"). ✅ **Este es el 90% del uso de tu bot.**
  - **Mensajes que inicia el NEGOCIO** (recordatorios, promociones): se cobran por conversación. En RD ronda **$0.01 – $0.04** cada uno + comisión de la plataforma YCloud.
  - Plataforma YCloud: suele tener un **costo base/recarga** pequeño por número.

> 📌 Conclusión: como tu bot **responde** (no spamea), el gasto de WhatsApp es **muy bajo**.
> Lo único que se cobra son los recordatorios salientes, que son pocos.

### 🧮 Costo total tuyo con 10 negocios (estimado realista)
```
VPS (1 solo)............  $10  → RD$600   (lo dividen los 10)
IA (Groq)..............   $0
Supabase...............   $0
WhatsApp (recordatorios) ~$5-15 entre los 10 según volumen
-----------------------------------------------
TOTAL TUYO / MES.......  ~$15 a $25  → RD$900 – 1,500  por los 10 juntos
```
👉 Eso es **menos de $2.50 (RD$150) por negocio al mes** en costos reales.

---

## 2) ¿CUÁNTO COBRAR? (tu precio de venta)

El valor no es "un bot", es: **secretaria 24/7 que nunca falta, agenda citas,
guarda pacientes, manda recordatorios y reportes.** Eso vale mucho.

### 💵 Precios sugeridos por clínica (mensual)

| Plan | Qué incluye | Precio (USD) | En RD$ |
|---|---|---|---|
| **Básico** | Bot responde + agenda + guarda contactos | $25 – $40 | RD$1,500 – 2,400 |
| **Pro** ⭐ | Lo anterior + recordatorios + reportes al dueño + WhatsApp oficial (YCloud) | $50 – $80 | RD$3,000 – 4,800 |
| **Premium** | Lo anterior + portal de pacientes + adherencia + soporte prioritario | $100 – $150 | RD$6,000 – 9,000 |

> Además puedes cobrar una **instalación única** de $50 – $150 (RD$3,000 – 9,000)
> por configurar el número, el QR/YCloud y personalizar el bot.

---

## 3) TU GANANCIA CON 10 NEGOCIOS

Ejemplo conservador: **10 clínicas en plan Pro a $50 (RD$3,000) c/u.**

```
INGRESOS:  10 × $50  = $500/mes   (RD$30,000/mes)
COSTOS:    ~$20/mes              (RD$1,200/mes)
------------------------------------------------
GANANCIA NETA ≈ $480/mes  →  RD$28,800/mes  🎉
```

Y eso **escala**: el mismo VPS aguanta más negocios, así que el negocio #11, #12…
casi no te suben el costo → **cada cliente nuevo es casi pura ganancia.**

### 📈 Proyección
| Negocios | Ingreso/mes (Pro $50) | Costo/mes | Ganancia/mes |
|---|---|---|---|
| 1 | $50 (RD$3,000) | ~$12 | ~$38 (RD$2,280) |
| 5 | $250 (RD$15,000) | ~$15 | ~$235 (RD$14,100) |
| 10 | $500 (RD$30,000) | ~$20 | ~$480 (RD$28,800) |
| 20 | $1,000 (RD$60,000) | ~$30 (subir a KVM 4) | ~$970 (RD$58,200) |

---

## 4) RECOMENDACIONES DE NEGOCIO
- **Cobra mensual** (suscripción), no una sola vez → ingreso recurrente.
- **Cobra la instalación aparte** → recuperas tiempo de montaje.
- Ofrece **prueba de 7 días gratis** → cierras más fácil.
- Sube al plan **Pro con YCloud** a quien quiera seriedad (sin baneos).
- Empieza con **1-2 clínicas reales**, perfecciona, y luego escala a 10.
- Reinvierte: con la ganancia de 5 clínicas ya pagas un VPS más grande para 30.

---

> ⚠️ Aviso honesto: los precios de Meta/WhatsApp y Hostinger cambian. Antes de
> prometerle tarifas fijas a un cliente, confirma el costo del mes en
> el panel de YCloud y en Hostinger. El modelo de ganancia se mantiene amplio igual.
