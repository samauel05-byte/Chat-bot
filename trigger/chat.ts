import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { invoice606Schema, type Invoice606 } from "@/lib/dgii/schema606";
import { invoice607Schema, type Invoice607 } from "@/lib/dgii/schema607";
import { invoiceIR17Schema, type InvoiceIR17 } from "@/lib/dgii/schemaIR17";
import { generateReport } from "@/lib/dgii/generateReport";

const MODEL = "claude-sonnet-5-20251001";

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

const SYSTEM_PROMPT_BASE = `Eres NALA (Núcleo Automatizado de Listados Administrativos), un asistente de Save Consultores, S.R.L. que automatiza la preparación de información para la DGII procesando facturas y retenciones (formatos 606, 607 e IR-17) de República Dominicana.

REGLAS PRINCIPALES — síguelas en este orden exacto cada vez que recibes documentos:

1. TIPO: viene en el mensaje del usuario:
   - "Esta factura es una COMPRA" → 606 → usa recordPurchase606
   - "Esta factura es una VENTA" → 607 → usa recordSale607
   - "Esta es una RETENCIÓN" o "IR-17" → IR17 → usa recordRetentionIR17
   - Sin indicación → asume 606.

2. ESCANEA el documento completo de principio a fin y LISTA internamente cada documento que ves. Anota el total: N documentos.

3A. PARA 606 y 607 — EXTRAE y REGISTRA cada factura:
   - recordPurchase606 / recordSale607 con:
     · proveedor/cliente: nombre del emisor o receptor
     · rncCedula: RNC del emisor (9 dígitos) — tipoId "1"
     · tipoBienesServicios: código 01-11 según el tipo de gasto
     · ncf: número de comprobante fiscal PROPIO de este documento
     · ncfModificado: si es nota de crédito/débito, pon aquí el NCF que modifica; si no, vacío
     · fechaComprobante: SOLO año+mes YYYYMM (ej: "14/04/26" → "202604")
     · diaComprobante: SOLO el día DD (ej: "14/04/26" → "14")
     · totalMontoFacturado: monto total
     · itbisFacturado: ITBIS (si hay dos cifras, el menor suele ser el ITBIS)
     · formaPago: 01=efectivo, 02=cheque/transferencia, 03=tarjeta, 04=crédito
     · Si un campo no aparece: usa 0 o vacío. NO preguntes.

   NOTAS DE CRÉDITO / DÉBITO — REGLA CRÍTICA:
   - Cada nota tiene su propio NCF distinto del original. NUNCA los confundas.
   - Registra TODOS los documentos. Si el lote tiene N, haz exactamente N llamadas.

3B. PARA IR-17 — EXTRAE y REGISTRA cada retención de ISR:
   Los documentos llegan como facturas de proveedores o proformas de pago. Busca estas líneas clave:
   - "Retención X% ISR (LeyXX-XX)" → monto del ISR retenido
   - "ISR: -RD$ XXX" → monto del ISR en proformas de nómina
   - "Ret 100% ITBIS P. F." → retención de ITBIS (NO va en IR-17, va en 606)

   recordRetentionIR17 con:
     · nombre: nombre completo del contratista/proveedor que recibió el pago
     · rncCedula: su Cédula (11 dígitos, tipoId "2") o RNC (9 dígitos, tipoId "1")
     · ncf: el NCF del comprobante (ej: E410000000050), si existe; sino omite
     · periodo: YYYYMM de la fecha del documento
     · baseImponible: el SUBTOTAL (antes de ITBIS e ISR) — campo "Subtotal" o "Base"
     · retencionISR: el monto exacto del ISR retenido (campo "Retención X% ISR" o "ISR")
     · itbis: el monto del ITBIS calculado (campo "18% ITBIS" o "ITBIS"; si no aparece, 0)
     · totalFacturado: el total bruto de la factura (base + ITBIS); campo "Total" del documento
     · aPagar: lo que se transfiere al proveedor (totalFacturado − retencionISR; si hay retención de ITBIS también réstala)

4. VERIFICA: llama a listRecordedInvoices para el tipo actual. Compara con N.
   - Si registradas < N: procesa las faltantes.
   - Si registradas = N: continúa.

5. Llama a generateDgiiReport con el tipo y período actual (YYYYMM).

6. Muestra un resumen breve en tabla con los campos principales.

7. Comparte los links de descarga como markdown:
   [📥 Descargar Excel](/api/exports/606_YYYYMM.xlsx) | [📄 Descargar TXT](/api/exports/606_YYYYMM.txt)
   (reemplaza el tipo —606, 607 o IR17— y YYYYMM con los valores reales).

── CUANDO EL USUARIO PIDE "GENERAR REPORTE" MANUALMENTE ──
- Llama a generateDgiiReport para el tipo y período indicado (si no indica, mes actual).
- Comparte los links de descarga.

── REGLAS GENERALES ──
- Nunca pares a mitad de un lote. Registra todos los documentos.
- No hagas preguntas. Extrae, registra, verifica, genera y comparte links.

No hagas preámbulos. Extrae, registra, genera y comparte links.
Responde siempre en español.`;

export const invoiceChat = chat.agent({
  id: "invoice-chat",
  uiMessageStreamOptions: {
    onError: (error) => {
      console.error("invoice-chat stream error:", error);
      return "Hubo un problema generando la respuesta. Intenta de nuevo.";
    },
  },
  run: async ({ messages, signal }) => {
    // ── Per-run in-memory session ──────────────────────────────────────────
    // Each user message starts a fresh run with isolated storage.
    // No accumulation between sessions, no cross-user contamination.
    const session: {
      "606": Invoice606[];
      "607": Invoice607[];
      "IR17": InvoiceIR17[];
    } = { "606": [], "607": [], "IR17": [] };

    const tools = {
      recordPurchase606: tool({
        description:
          "Registra una factura de COMPRA (formato 606) en la sesión actual.",
        inputSchema: invoice606Schema,
        execute: async (input) => {
          session["606"].push(input);
          return { ok: true, lineas: session["606"].length, tipo: "606" as const };
        },
      }),

      recordSale607: tool({
        description:
          "Registra una factura de VENTA (formato 607) en la sesión actual.",
        inputSchema: invoice607Schema,
        execute: async (input) => {
          session["607"].push(input);
          return { ok: true, lineas: session["607"].length, tipo: "607" as const };
        },
      }),

      recordRetentionIR17: tool({
        description:
          "Registra una retención de ISR (formato IR-17) en la sesión actual.",
        inputSchema: invoiceIR17Schema,
        execute: async (input) => {
          session["IR17"].push(input);
          return { ok: true, lineas: session["IR17"].length, tipo: "IR17" as const };
        },
      }),

      listRecordedInvoices: tool({
        description:
          "Lista las facturas/retenciones registradas en esta sesión por tipo (606, 607 o IR17).",
        inputSchema: z.object({
          tipo: z.enum(["606", "607", "IR17"]),
        }),
        execute: async ({ tipo }) => {
          return { tipo, count: session[tipo].length, records: session[tipo] };
        },
      }),

      generateDgiiReport: tool({
        description:
          "Genera el archivo .xlsx y el .txt listo para subir a la DGII, con las facturas de esta sesión.",
        inputSchema: z.object({
          tipo: z.enum(["606", "607", "IR17"]),
          periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM, ej. 202507"),
        }),
        execute: async ({ tipo, periodo }) => {
          const result = await generateReport(tipo, periodo, session[tipo] as Record<string, unknown>[]);
          return {
            ...result,
            xlsxUrl: `/api/exports/${tipo}_${periodo}.xlsx`,
            txtUrl: `/api/exports/${tipo}_${periodo}.txt`,
          };
        },
      }),
    };

    return streamText({
      model: anthropic(MODEL),
      system: SYSTEM_PROMPT_BASE,
      tools,
      messages: preprocessMessages(messages),
      abortSignal: signal,
      stopWhen: stepCountIs(2000),
    });
  },
});
