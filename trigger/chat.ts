import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

import { invoice606Schema } from "@/lib/dgii/schema606";
import { invoice607Schema } from "@/lib/dgii/schema607";
import { invoiceIR17Schema } from "@/lib/dgii/schemaIR17";
import { generateReport } from "@/lib/dgii/generateReport";

const MODEL = "gpt-5.6-terra";

type FileMeta = { url: string; contentType: string; name: string };

const BATCH_TOOL_NAMES = ["generateReport606", "generateReport607", "generateReportIR17"];

function preprocessMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    // Strip batch-tool args from assistant history so old invoice arrays never
    // pollute the next extraction — the model must only use the current attachment.
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const cleaned = (msg.content as unknown[]).map((part) => {
        const p = part as Record<string, unknown>;
        if (p.type === "tool-call" && BATCH_TOOL_NAMES.includes(p.toolName as string)) {
          const args = p.args as Record<string, unknown>;
          const count =
            Array.isArray(args.facturas) ? args.facturas.length :
            Array.isArray(args.retenciones) ? args.retenciones.length : 0;
          return {
            ...p,
            args: {
              periodo: args.periodo,
              _historial: `Lote anterior: ${count} registros ya procesados. NO reutilizar estos datos.`,
            },
          };
        }
        return part;
      });
      return { ...msg, content: cleaned } as ModelMessage;
    }

    if (msg.role !== "user") return msg;

    const rawText =
      typeof msg.content === "string"
        ? msg.content
        : (msg.content.find((p: TextPart | unknown) => (p as TextPart).type === "text") as TextPart | undefined)?.text ?? "";

    const markerMatch = rawText.match(/\[FACTURAS:([\s\S]*?)\]$/m);
    if (!markerMatch) return msg;

    let files: FileMeta[] = [];
    try {
      files = JSON.parse(markerMatch[1]);
    } catch {
      return msg;
    }

    const cleanText = rawText.replace(/\s*\[FACTURAS:[\s\S]*?\]$/, "").trim();

    const content: UserModelMessage["content"] = [];
    if (cleanText) content.push({ type: "text", text: cleanText });

    for (const f of files) {
      if (f.contentType.startsWith("image/")) {
        content.push({ type: "image", image: new URL(f.url) });
      } else {
        content.push({ type: "file", data: new URL(f.url), mediaType: f.contentType as `application/${string}` });
      }
    }

    return { ...msg, content } as UserModelMessage;
  });
}

// Herramientas: una sola llamada con el array completo → sin acumulación posible.
const tools = {
  generateReport606: tool({
    description:
      "Recibe el array COMPLETO de todas las facturas de COMPRA extraídas del documento y genera el reporte 606 de una sola vez. Incluye TODAS las facturas en un único llamado — no llames este tool varias veces.",
    inputSchema: z.object({
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM del período, ej. 202607"),
      facturas: z.array(invoice606Schema).min(1).describe("Array con TODAS las facturas de compra del documento"),
    }),
    execute: async ({ periodo, facturas }) => {
      const result = await generateReport("606", periodo, facturas as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/606_${periodo}.xlsx`,
        txtUrl: `/api/exports/606_${periodo}.txt`,
      };
    },
  }),

  generateReport607: tool({
    description:
      "Recibe el array COMPLETO de todas las facturas de VENTA extraídas del documento y genera el reporte 607 de una sola vez. Incluye TODAS las facturas en un único llamado.",
    inputSchema: z.object({
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM del período, ej. 202607"),
      facturas: z.array(invoice607Schema).min(1).describe("Array con TODAS las facturas de venta del documento"),
    }),
    execute: async ({ periodo, facturas }) => {
      const result = await generateReport("607", periodo, facturas as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/607_${periodo}.xlsx`,
        txtUrl: `/api/exports/607_${periodo}.txt`,
      };
    },
  }),

  generateReportIR17: tool({
    description:
      "Recibe el array COMPLETO de todas las retenciones IR-17 extraídas del documento y genera el reporte de una sola vez. Incluye TODAS las retenciones en un único llamado.",
    inputSchema: z.object({
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM del período, ej. 202607"),
      retenciones: z.array(invoiceIR17Schema).min(1).describe("Array con TODAS las retenciones del documento"),
    }),
    execute: async ({ periodo, retenciones }) => {
      const result = await generateReport("IR17", periodo, retenciones as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/IR17_${periodo}.xlsx`,
        txtUrl: `/api/exports/IR17_${periodo}.txt`,
      };
    },
  }),
};

const SYSTEM_PROMPT_BASE = `Eres NALA (Núcleo Automatizado de Listados Administrativos), un asistente de Save Consultores, S.R.L. que automatiza la preparación de información para la DGII procesando facturas y retenciones (formatos 606, 607 e IR-17) de República Dominicana.

INSTRUCCIÓN PRINCIPAL — una sola llamada de tool con todo el lote:

1. TIPO: viene en el mensaje del usuario:
   - "Esta factura es una COMPRA" o sin indicación → 606 → usa generateReport606
   - "Esta factura es una VENTA" → 607 → usa generateReport607
   - "Esta es una RETENCIÓN" o "IR-17" → IR17 → usa generateReportIR17

2. LEE el documento adjunto en el MENSAJE ACTUAL, página por página, de principio a fin. Extrae los datos de CADA factura/retención que ves.
   ⚠️ SOLO usa los documentos del mensaje actual. NUNCA incluyas datos de mensajes anteriores ni de lotes previos.

3. Llama al tool UNA SOLA VEZ con el array completo de todas las facturas extraídas.
   - generateReport606 / generateReport607 reciben "facturas": [ {...}, {...}, ... ]
   - generateReportIR17 recibe "retenciones": [ {...}, {...}, ... ]
   - Si el PDF tiene 31 páginas con una factura cada una → el array tiene 31 elementos.
   - NUNCA llames el tool más de una vez para el mismo documento.

   CAMPOS POR FACTURA (606/607):
   · proveedor/cliente: nombre del emisor o receptor
   · rncCedula: RNC del emisor (9 dígitos) — tipoId "1"
   · tipoBienesServicios: código 01-11 según el tipo de gasto
   · ncf: número de comprobante fiscal PROPIO de este documento
   · ncfModificado: si es nota de crédito/débito, NCF original que modifica; si no, vacío
   · fechaComprobante: SOLO año+mes YYYYMM (ej: "14/04/26" → "202604")
   · diaComprobante: SOLO el día DD (ej: "14/04/26" → "14")
   · totalMontoFacturado: monto total
   · itbisFacturado: ITBIS (si hay dos cifras, el menor suele ser el ITBIS)
   · formaPago: 01=efectivo, 02=cheque/transferencia, 03=tarjeta, 04=crédito
   · Si un campo no aparece: usa 0 o vacío. Si es ilegible: "ILEGIBLE". NO preguntes jamás.

   NOTAS DE CRÉDITO / DÉBITO:
   - Tienen su propio NCF (B04...). El ncfModificado es el NCF de la factura original (B01...).
   - Registra nota y factura original como elementos separados en el array.

4. Una vez el tool responda con xlsxUrl y txtUrl, muestra un resumen en tabla:
   #, Proveedor, NCF, Fecha, Monto, ITBIS

5. Comparte los links de descarga:
   [📥 Descargar Excel](xlsxUrl) | [📄 Descargar TXT](txtUrl)
   (usa exactamente los valores xlsxUrl y txtUrl que devolvió el tool)

── CUANDO EL USUARIO PIDE "GENERAR REPORTE" MANUALMENTE ──
- Pídele que suba el documento, o si ya lo subió, extrae y llama el tool con todos los datos.

── REGLAS GENERALES ──
- Una sola llamada al tool por documento. El array contiene todo.
- NUNCA preguntes al usuario qué falta. NUNCA hagas múltiples llamadas al mismo tool.
- Responde siempre en español.`;

export const invoiceChat = chat.agent({
  id: "invoice-chat",
  tools,
  uiMessageStreamOptions: {
    onError: (error) => {
      console.error("invoice-chat stream error:", error);
      return "Hubo un problema generando la respuesta. Intenta de nuevo.";
    },
  },
  run: async ({ messages, tools: runTools, signal }) => {
    return streamText({
      ...chat.toStreamTextOptions({ tools: runTools }),
      model: openai(MODEL),
      system: SYSTEM_PROMPT_BASE,
      messages: preprocessMessages(messages),
      abortSignal: signal,
      stopWhen: stepCountIs(2000),
    });
  },
});
