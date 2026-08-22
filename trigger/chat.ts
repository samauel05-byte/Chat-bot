import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { invoice606Schema } from "@/lib/dgii/schema606";
import { invoice607Schema } from "@/lib/dgii/schema607";
import {
  appendInvoice606,
  appendInvoice607,
  listInvoices,
} from "@/lib/dgii/store";
import { generateReport } from "@/lib/dgii/generateReport";

const MODEL = "claude-sonnet-5-20251001";

const tools = {
  recordPurchase606: tool({
    description:
      "Registra una factura de COMPRA (formato 606) ya confirmada por el usuario. Solo llama esto después de mostrarle los datos extraídos y que el usuario los confirme explícitamente.",
    inputSchema: invoice606Schema,
    execute: async (input) => {
      const lineas = await appendInvoice606(input);
      return { ok: true, lineas, tipo: "606" as const };
    },
  }),

  recordSale607: tool({
    description:
      "Registra una factura de VENTA (formato 607) ya confirmada por el usuario. Solo llama esto después de mostrarle los datos extraídos y que el usuario los confirme explícitamente.",
    inputSchema: invoice607Schema,
    execute: async (input) => {
      const lineas = await appendInvoice607(input);
      return { ok: true, lineas, tipo: "607" as const };
    },
  }),

  listRecordedInvoices: tool({
    description:
      "Lista las facturas ya registradas de un tipo (606 o 607), opcionalmente filtradas por período (YYYYMM). Útil para revisar antes de generar el reporte final.",
    inputSchema: z.object({
      tipo: z.enum(["606", "607"]),
      periodo: z
        .string()
        .regex(/^\d{6}$/)
        .optional()
        .describe("YYYYMM, ej. 202507"),
    }),
    execute: async ({ tipo, periodo }) => {
      return listInvoices(tipo, periodo);
    },
  }),

  generateDgiiReport: tool({
    description:
      "Genera el archivo .xlsx de revisión y el .txt delimitado por '|' listo para subir a la DGII, para un tipo (606/607) y período (YYYYMM).",
    inputSchema: z.object({
      tipo: z.enum(["606", "607"]),
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM, ej. 202507"),
    }),
    execute: async ({ tipo, periodo }) => {
      const result = await generateReport(tipo, periodo);
      return {
        ...result,
        xlsxUrl: `/api/exports/${tipo}_${periodo}.xlsx`,
        txtUrl: `/api/exports/${tipo}_${periodo}.txt`,
      };
    },
  }),
};

type FileMeta = { url: string; contentType: string; name: string };

function preprocessMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
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

const SYSTEM_PROMPT_BASE = `Eres un asistente de una empresa contable que procesa facturas DGII 606 (Compras) y 607 (Ventas) de República Dominicana.

REGLAS PRINCIPALES — síguelas en este orden exacto cada vez que recibes facturas:

1. TIPO: viene en el mensaje del usuario:
   - "Esta factura es una COMPRA" → 606
   - "Esta factura es una VENTA" → 607
   - Sin indicación → asume 606.

2. ESCANEA el documento completo de principio a fin y LISTA internamente cada factura que ves (por su NCF o número de página). Anota el total: N facturas.

3. EXTRAE y REGISTRA cada factura de la lista, en orden, sin saltarte ninguna:
   - Por cada factura llama a recordPurchase606 (606) o recordSale607 (607) con:
     · proveedor: nombre del emisor/proveedor
     · rncCedula: RNC del emisor (9 dígitos) — tipoId "1"
     · tipoBienesServicios: código 01-11 según el tipo de gasto
     · ncf: número de comprobante fiscal
     · fechaComprobante: SOLO año+mes en formato YYYYMM (ej: "14/04/26" → "202604")
     · diaComprobante: SOLO el día en formato DD (ej: "14/04/26" → "14")
     · totalMontoFacturado: monto total
     · itbisFacturado: ITBIS (si aparece dos números, el menor suele ser el ITBIS)
     · formaPago: código 01=efectivo, 02=cheque/transferencia, 03=tarjeta, 04=crédito
     · Si un campo no aparece: usa 0 o vacío. NO preguntes. Si ilegible: usa "ILEGIBLE".
   - Si el documento tiene N facturas, debes hacer exactamente N llamadas. Nunca pares antes.

4. VERIFICA: llama a listRecordedInvoices para el tipo y período actual. Compara el total registrado con N.
   - Si registradas < N: vuelve al paso 3 y procesa las que faltan (relée el documento).
   - Si registradas = N: continúa.

5. Llama a generateDgiiReport con el tipo y el período del mes actual (YYYYMM).

6. Muestra un resumen breve en tabla: #, Proveedor, NCF, Fecha (AAAAMM+DD), Monto, ITBIS.

7. Comparte los links de descarga como markdown:
   [📥 Descargar Excel](/api/exports/606_YYYYMM.xlsx) | [📄 Descargar TXT](/api/exports/606_YYYYMM.txt)
   (reemplaza 606 y YYYYMM con los valores reales).

── CUANDO EL USUARIO PIDE "GENERAR REPORTE" MANUALMENTE ──
- Llama a generateDgiiReport para el tipo y período indicado (si no indica, mes actual).
- Comparte los links de descarga.

── REGLAS GENERALES ──
- Nunca pares a mitad de un lote. Si el documento tiene 30 facturas, las 30 deben quedar registradas.
- No hagas preguntas. Extrae, registra, verifica, genera y comparte links.

No hagas preámbulos. Extrae, registra, genera y comparte links.
Responde siempre en español.`;

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
    const system = SYSTEM_PROMPT_BASE;

    return streamText({
      ...chat.toStreamTextOptions({ tools: runTools }),
      model: anthropic(MODEL),
      system,
      messages: preprocessMessages(messages),
      abortSignal: signal,
      stopWhen: stepCountIs(2000),
    });
  },
});
