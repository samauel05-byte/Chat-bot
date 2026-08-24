# Chatbot de facturación 606 / 607

Chatbot que recibe facturas (foto/PDF) por chat, extrae los datos con IA, determina si son
compras (Formato 606) o ventas (Formato 607) según el RNC de tu empresa, y genera los archivos
listos para la DGII (Oficina Virtual) por período.

No usa base de datos relacional: todo se guarda como archivos (CSV/JSON/XLSX) en **Vercel Blob**,
como blobs privados (requieren el token para leerse, no son URLs públicas adivinables).

## Requisitos antes de correrlo

1. **Clave de OpenAI**: copia `.env.local.example` a `.env.local` (o edita el que ya existe) y
   agrega tu `OPENAI_API_KEY`. El modelo (`gpt-5.6-terra`) necesita soporte de visión para
   leer las facturas adjuntas.
2. `TRIGGER_SECRET_KEY` (dev) ya viene configurada en `.env.local` (proyecto `chat-bot-606-607`
   en Trigger.dev, org Samkill).
3. **`BLOB_READ_WRITE_TOKEN`**: crea un Blob store en Vercel (Dashboard → proyecto `chat-bot` →
   pestaña Storage → Create → Blob → Connect Project) y copia el token a `.env.local`. El mismo
   token sirve para desarrollo local y para producción.

## Correr en desarrollo

Se necesitan dos procesos en paralelo:

```bash
npm run dev:trigger
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Lo primero que te va a pedir el bot es el
RNC de tu empresa (se guarda una sola vez como blob `config.json`).

## Desplegar en producción

Dos sistemas se despliegan por separado:

- **Vercel** (la app web/chat): el proyecto `chat-bot` ya está enlazado al repo de GitHub —
  cada push a `main` dispara un deploy automático. Hace falta configurar en Vercel (Settings →
  Environment Variables, Production):
  - `TRIGGER_SECRET_KEY` — la clave **prod** (no la de dev), desde el dashboard de Trigger.dev →
    proyecto → API Keys.
  - `BLOB_READ_WRITE_TOKEN` — se agrega solo al crear el Blob store desde la pestaña Storage.
- **Trigger.dev** (el agente de chat, corre en la infraestructura de Trigger.dev, no en Vercel):
  hay que configurar, en el dashboard del proyecto → Environment Variables → **Prod**:
  - `OPENAI_API_KEY`
  - `BLOB_READ_WRITE_TOKEN` (el mismo valor que en Vercel)

  y luego desplegar con `npx trigger.dev@latest deploy` (o pedírmelo).

## Cómo funciona

1. Adjuntas una factura (imagen o PDF) en el chat, y opcionalmente marcas si es "Compra (606)" o
   "Venta (607)" con los botones de la interfaz.
2. El modelo la lee directamente y extrae los campos. Si no elegiste el tipo explícitamente,
   decide comparando el RNC emisor/receptor contra el RNC de tu empresa.
3. Te muestra un resumen y pide confirmación antes de guardar nada.
4. Al confirmar, se agrega una fila al blob `606.csv` o `607.csv` con exactamente las mismas
   columnas que usa la herramienta oficial de la DGII.
5. Cuando pides el reporte de un período (ej. "genera el 606 de julio 2025"), se generan:
   - un `.xlsx` de revisión con las mismas columnas que la plantilla oficial
   - un `.txt` delimitado por `|`, sin encabezado, en el formato que acepta la Oficina Virtual

   Ambos quedan como blobs privados; el bot te da un link `/api/exports/<archivo>` que los sirve
   a través de la app (no son URLs públicas de Vercel Blob).

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

- Es una app de un solo usuario/empresa — no hay multi-tenant ni login. La ruta de descarga
  (`/api/exports/...`) no está protegida por autenticación propia; si te preocupa que alguien
  adivine la URL exacta de un export, activa Vercel Authentication / protección de deployment en
  el proyecto (Settings → Deployment Protection).
- La extracción por IA de fotos puede fallar en dígitos de NCF, RNC o montos — por eso el bot
  siempre pide confirmación antes de guardar.
