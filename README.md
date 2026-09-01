# CAMI — Control y Análisis de Movimientos e Impuestos

CAMI es una plataforma contable y tributaria para organizar, analizar y preparar información fiscal de la República Dominicana. Integra en una sola experiencia el análisis de compras, ventas y tarjetas con **NALA**, su asistente fiscal con inteligencia artificial.

## Módulos integrados

- **Análisis fiscal:** 606, 607, CardNET, Azul, IT-1 e IR-2.
- **NALA · Asistente fiscal IA:** recibe facturas en imagen o PDF, extrae sus datos, permite revisarlos y genera archivos 606/607.
- **Acceso y licencias:** autenticación, empresas, perfiles, vencimientos y administración mediante Supabase.
- **Exportaciones:** archivos XLSX y TXT preparados para revisión antes de cargarlos en la Oficina Virtual de la DGII.

El analizador estable se muestra dentro del espacio autenticado de CAMI. Su URL se configura con `NEXT_PUBLIC_CAMI_ANALYSIS_URL`, lo que permite mantener el sistema actual en producción mientras la plataforma unificada se valida en una vista previa.

## Requisitos

- Node.js compatible con Next.js 16.
- Un proyecto de Supabase con las migraciones incluidas en `supabase/migrations`.
- OpenAI para la extracción inteligente de documentos.
- Vercel Blob para almacenar archivos y reportes.
- Trigger.dev para ejecutar el procesamiento en segundo plano.

Copia `.env.local.example` a `.env.local` y configura las variables indicadas. No publiques ni confirmes secretos en Git.

## Desarrollo local

Instala las dependencias y ejecuta la aplicación:

```bash
npm ci
npm run dev
```

Cuando necesites probar el procesamiento de documentos, inicia Trigger.dev en otra terminal:

```bash
npm run dev:trigger
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000). El análisis fiscal se abre en `/analisis` y el asistente NALA en `/`.

## Verificación

Antes de publicar cambios ejecuta:

```bash
npm test
npm run lint
npm run build
```

Los archivos fiscales generados deben revisarse y validarse con las herramientas oficiales de la DGII antes de presentarlos. CAMI facilita la preparación y conciliación de los datos, pero no sustituye la revisión profesional ni la responsabilidad del contribuyente.

## Despliegue

La aplicación web se despliega en Vercel y el procesamiento asíncrono en Trigger.dev. Las variables de producción deben configurarse en ambos servicios según corresponda. Los cambios de integración se prueban primero en una rama y una vista previa; la producción se promueve únicamente después de verificar autenticación, navegación, análisis, carga de documentos y exportaciones.

## Seguridad

- Las rutas principales requieren una sesión válida.
- Las licencias y empresas se validan en el servidor.
- Los documentos se guardan en almacenamiento privado.
- Nunca se deben exponer `OPENAI_API_KEY`, claves de Supabase con privilegios, tokens de Blob ni claves de Trigger.dev.
