import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { invoice606Schema } from "@/lib/dgii/schema606";
import { invoice607Schema } from "@/lib/dgii/schema607";
import { appendInvoice606, appendInvoice607, listInvoices } from "@/lib/dgii/store";
import { generateReport } from "@/lib/dgii/generateReport";
import { orgContext } from "@/lib/orgContext";

const MODEL = "claude-sonnet-5-20251001";

const tools = {
  recordPurchase606: tool({
    description:
      "Registra una factura de COMPRA (formato 606). Extrae los datos del documento y llama esta herramienta directamente, sin confirmar con el usuario.",
    inputSchema: invoice606Schema,
    execute: async (input) => {
      const lineas = await appendInvoice606(input);
      return { ok: true, lineas, tipo: "606" as const };
    },
  }),

  recordSale607: tool({
    description:
      "Registra una factura de VENTA (formato 607). Extrae los datos del documento y llama esta herramienta directamente.",
    inputSchema: invoice607Schema,
    execute: async (input) => {
      const lineas = await appendInvoice607(input);
      return { ok: true, lineas, tipo: "607" as const };
    },
  }),

  listRecordedInvoices: tool({
    description:
      "Lista las facturas ya registradas de un tipo (606 o 607), opcionalmente filtradas por período (YYYYMM).",
    inputSchema: z.object({
      tipo: z.enum(["606", "607"]),
      periodo: z.string().regex(/^\d{6}$/).optional().describe("YYYYMM, ej. 202507"),
    }),
    execute: async ({ tipo, periodo }) => {
      return listInvoices(tipo, periodo);
    },
  }),

  generateDgiiReport: tool({
    description:
      "Genera el archivo .xlsx de revisión y el .txt delimitado por '|' listo para subir a la DGII.",
    inputSchema: z.object({
      tipo: z.enum(["606", "607"]),
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM, ej. 202507"),
    }),
    execute: async ({ tipo, periodo }) => {
      const result = await generateReport(tipo, periodo);
      const orgId = orgContext.getStore() ?? "default";
      return {
        ...result,
        xlsxUrl: `/api/exports/${orgId}/${tipo}_${periodo}.xlsx`,
        txtUrl: `/api/exports/${orgId}/${tipo}_${periodo}.txt`,
      };
    },
  }),
};

type FileMeta = { url: string; contentType: string; name: string };

/** Extracts the [ORG:id] marker from messages (last occurrence wins). */
function extractOrgId(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const raw =
      typeof msg.content === "string"
        ? msg.content
        : (msg.content.find((p) => (p as TextPart).type === "text") as TextPart | undefined)?.text ?? "";
    const m = raw.match(/\[ORG:([^\]]+)\]/);
    if (m) return m[1];
  }
  return "default";
}

function preprocessMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user") return msg;

    const rawText =
      typeof msg.content === "string"
        ? msg.content
        : (msg.content.find((p: TextPart | unknown) => (p as TextPart).type === "text") as TextPart | undefined)?.text ?? "";

    // Strip both [ORG:...] and [FACTURAS:...] markers
    const cleanBase = rawText.replace(/\s*\[ORG:[^\]]+\]/g, "").replace(/\s*\[FACTURAS:[\s\S]*?\]$/, "").trim();

    const markerMatch = rawText.match(/\[FACTURAS:([\s\S]*?)\]$/m);
    if (!markerMatch) {
      if (cleanBase === rawText) return msg;
      return { ...msg, content: cleanBase } as UserModelMessage;
    }

    let files: FileMeta[] = [];
    try { files = JSON.parse(markerMatch[1]); } catch { return msg; }

    const content: UserModelMessage["content"] = [];
    if (cleanBase) content.push({ type: "text", text: cleanBase });

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

function buildSystemPrompt(orgId: string) {
  return `Eres NALA (Núcleo Automatizado de Listados Administrativos), un asistente de Save Consultores, S.R.L. que automatiza la preparación de información para la DGII procesando facturas en formato 606 (Compras) y 607 (Ventas) de República Dominicana.

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
     · ncf: número de comprobante fiscal PROPIO de este documento
     · ncfModificado: si es nota de crédito/débito, pon aquí el NCF original que modifica; si no, deja vacío
     · fechaComprobante: SOLO año+mes en formato YYYYMM (ej: "14/04/26" → "202604")
     · diaComprobante: SOLO el día en formato DD (ej: "14/04/26" → "14")
     · totalMontoFacturado: monto total
     · itbisFacturado: ITBIS (si aparece dos números, el menor suele ser el ITBIS)
     · formaPago: código 01=efectivo, 02=cheque/transferencia, 03=tarjeta, 04=crédito
     · Si un campo no aparece: usa 0 o vacío. NO preguntes. Si ilegible: usa "ILEGIBLE".

   NOTAS DE CRÉDITO / DÉBITO — REGLA CRÍTICA:
   - Una nota de crédito (B04...) y la factura original (B01...) son DOCUMENTOS SEPARADOS.
   - Cada uno tiene su propio NCF distinto — nunca son el mismo número.
   - NUNCA saltes un documento porque creas que ya lo registraste. Registra TODOS.
   - Si el documento tiene N facturas/notas, debes hacer exactamente N llamadas.

4. VERIFICA: llama a listRecordedInvoices para el tipo y período actual. Compara el total registrado con N.
   - Si registradas < N: vuelve al paso 3 y procesa las que faltan.
   - Si registradas = N: continúa.

5. Llama a generateDgiiReport con el tipo y el período del mes actual (YYYYMM).

6. Muestra un resumen breve en tabla: #, Proveedor, NCF, Fecha (AAAAMM+DD), Monto, ITBIS.

7. Comparte los links de descarga como markdown:
   [📥 Descargar Excel](/api/exports/${orgId}/606_YYYYMM.xlsx) | [📄 Descargar TXT](/api/exports/${orgId}/606_YYYYMM.txt)
   (reemplaza 606 y YYYYMM con los valores reales del reporte que acabas de generar).

── CUANDO EL USUARIO PIDE "GENERAR REPORTE" MANUALMENTE ──
- Llama a generateDgiiReport para el tipo y período indicado (si no indica, mes actual).
- Comparte los links de descarga con el orgId correcto.

── REGLAS GENERALES ──
- Nunca pares a mitad de un lote. Si el documento tiene 30 facturas, las 30 deben quedar registradas.
- No hagas preguntas. Extrae, registra, verifica, genera y comparte links.

No hagas preámbulos. Extrae, registra, genera y comparte links.
Responde siempre en español.`;
}

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
    const orgId = extractOrgId(messages);
    const system = buildSystemPrompt(orgId);

    return orgContext.run(orgId, () =>
      streamText({
        ...chat.toStreamTextOptions({ tools: runTools }),
        model: anthropic(MODEL),
        system,
        messages: preprocessMessages(messages),
        abortSignal: signal,
        stopWhen: stepCountIs(2000),
      })
    );
  },
});
