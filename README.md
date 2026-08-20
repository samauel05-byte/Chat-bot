# Chatbot de facturación 606 / 607

Chatbot que recibe facturas (foto/PDF) por chat, extrae los datos con IA, determina si son
compras (Formato 606) o ventas (Formato 607) según el RNC de tu empresa, y genera los archivos
listos para la DGII (Oficina Virtual) por período.

No usa base de datos: todo se guarda en archivos locales dentro de `data/` (gitignored, nunca se
sube al repo porque contiene información fiscal real).

## Requisitos antes de correrlo

1. **Clave de Anthropic**: copia `.env.local.example` a `.env.local` (o edita el `.env.local` que
   ya existe) y agrega tu `ANTHROPIC_API_KEY`. El modelo usado (`claude-sonnet-4-5`) necesita
   soporte de visión para leer las facturas adjuntas.
2. `TRIGGER_SECRET_KEY` ya viene configurada en `.env.local` (proyecto `chat-bot-606-607` en
   Trigger.dev, org Samkill).

## Correr en desarrollo

Se necesitan dos procesos en paralelo:

```bash
npm run dev:trigger
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Lo primero que te va a pedir el bot es el
RNC de tu empresa (se guarda una sola vez en `data/config.json`).

## Cómo funciona

1. Adjuntas una factura (imagen o PDF) en el chat.
2. El modelo la lee directamente, extrae los campos, y compara el RNC emisor/receptor contra el
   RNC de tu empresa para decidir si es 606 (compra) o 607 (venta).
3. Te muestra un resumen y pide confirmación antes de guardar nada.
4. Al confirmar, se agrega una fila a `data/606.csv` o `data/607.csv` con exactamente las mismas
   columnas que usa la herramienta oficial de la DGII.
5. Cuando pides el reporte de un período (ej. "genera el 606 de julio 2025"), se generan en
   `data/exports/`:
   - un `.xlsx` de revisión con las mismas columnas que la plantilla oficial
   - un `.txt` delimitado por `|`, sin encabezado, en el formato que acepta la Oficina Virtual

Los links de descarga los da el propio bot en el chat (`/api/exports/<archivo>`).

## Estructura de datos (fuente: DGII)

Las columnas y catálogos de `lib/dgii/schema606.ts` y `lib/dgii/schema607.ts` se tomaron
directamente de las herramientas oficiales de la DGII que se usaron para construir este proyecto:

- `Herramienta de Envio Formato 606.xls` (Versión 2020.2)
- `Herramienta de Envio Formato 607.xls` (Versión 2023.1.1)

Si la DGII publica una versión más nueva con columnas distintas, esos dos archivos son el único
lugar que hay que actualizar.

## Importante — verificación antes de presentar

El `.txt` generado sigue el formato conocido de envío (pipe-delimited, sin encabezado, sin las
columnas auxiliares "Líneas"/"Estatus" que sólo existen en la herramienta Excel). Aun así,
**antes de subir cualquier archivo a la Oficina Virtual de la DGII**, ábrelo y valídalo con la
herramienta oficial de la DGII (o revísalo con tu contador) — esto automatiza la extracción y el
armado del archivo, pero la responsabilidad de lo que se declara sigue siendo tuya.

## Limitaciones conocidas

- Es una app de un solo usuario/empresa, pensada para correr localmente o en un servidor con
  disco persistente — no en hosting serverless sin filesystem persistente (ej. Vercel), porque
  `data/` no sobreviviría entre despliegues.
- La extracción por IA de fotos puede fallar en dígitos de NCF, RNC o montos — por eso el bot
  siempre pide confirmación antes de guardar.
