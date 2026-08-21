import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import { invoice606Schema } from "@/lib/dgii/schema606";
import { invoice607Schema } from "@/lib/dgii/schema607";
import {
  appendInvoice606,
  appendInvoice607,
  getCompanyConfig,
  setCompanyConfig,
  listInvoices,
} from "@/lib/dgii/store";
import { generateReport } from "@/lib/dgii/generateReport";

const MODEL = "claude-haiku-4-5-20251001";

const tools = {
  getCompanyConfig: tool({
    description:
      "Obtiene el RNC y nombre de la empresa configurados. Llama esto al inicio de la conversación si no sabes el RNC de la empresa todavía.",
    inputSchema: z.object({}),
    execute: async () => {
      const config = await getCompanyConfig();
      return config ?? { message: "No hay empresa configurada todavía." };
    },
  }),

  setCompanyConfig: tool({
    description:
      "Guarda el RNC y nombre de la empresa del usuario. Solo se necesita una vez; úsalo cuando el usuario te dé su RNC por primera vez.",
    inputSchema: z.object({
      rnc: z.string().regex(/^\d{9}$/, "El RNC debe tener 9 dígitos"),
      nombre: z.string().min(1),
    }),
    execute: async ({ rnc, nombre }) => {
      await setCompanyConfig({ rnc, nombre });
      return { ok: true };
    },
  }),

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

REGLAS PRINCIPALES — síguelas en este orden exacto:

── AL RECIBIR FACTURAS ──
1. El tipo ya viene indicado en el mensaje:
   - "Esta factura es una COMPRA" → 606
   - "Esta factura es una VENTA" → 607
   - Sin indicación → asume 606.
2. Lee TODAS las facturas adjuntas. Extrae de cada una: NCF, RNC emisor y receptor, fecha, monto total, ITBIS y demás campos del formato.
   - Si un campo opcional no aparece: usa 0 o vacío. NO preguntes.
   - Si un dato clave (NCF, monto) es ilegible: anótalo como "ILEGIBLE" en tu tabla.
3. NUNCA llames a recordPurchase606 ni a recordSale607 aquí. Solo extrae y muestra.
4. Muestra los datos en una tabla con columnas: #, NCF, Fecha, Monto, ITBIS, Observaciones. Sin más texto.

── AL GENERAR REPORTE ──
5. Cuando el usuario pida generar el reporte (botón "Generar reporte" o frase similar):
   a. Recorre TODOS los mensajes de esta sesión y recolecta cada factura extraída que aún no haya sido guardada.
   b. Para cada factura 606 pendiente llama a recordPurchase606. Para cada 607 llama a recordSale607. (Puedes hacer muchas llamadas seguidas — es normal.)
   c. Luego llama a generateDgiiReport para el período indicado (si no se indica, usa el mes actual en formato YYYYMM).
   d. Comparte los links /api/exports/... que devuelve la tool para descargar el Excel y el TXT.
6. Si el usuario menciona un período específico (ej. "julio 2025" → 202507), úsalo. Si no, usa el mes actual.

No hagas comentarios ni preámbulos. Solo extrae, muestra la tabla, o guarda y genera — según el paso en que estés.
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
    const config = await getCompanyConfig();
    const system = config
      ? `${SYSTEM_PROMPT_BASE}\n\nEmpresa configurada: RNC ${config.rnc}, ${config.nombre}.`
      : `${SYSTEM_PROMPT_BASE}\n\nTodavía no hay empresa configurada. NO se lo preguntes al usuario directamente — detéctala de la primera factura que suba, como se explica en el paso 3.`;

    return streamText({
      ...chat.toStreamTextOptions({ tools: runTools }),
      model: anthropic(MODEL),
      system,
      messages: preprocessMessages(messages),
      abortSignal: signal,
      stopWhen: stepCountIs(40),
    });
  },
});
