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

const SYSTEM_PROMPT_BASE = `Eres un asistente que ayuda a preparar los formatos 606 (Compras de Bienes y Servicios) y 607 (Ventas de Bienes y Servicios) para la DGII (República Dominicana), a partir de facturas que el usuario adjunta como imagen o PDF en el chat.

Flujo de trabajo:
1. Al inicio, llama a getCompanyConfig para saber si ya conoces la empresa del usuario. NO le pidas el RNC por adelantado con una pregunta — se detecta automáticamente de la primera factura que suba (ver paso 3).
2. Cuando el usuario adjunte una factura, léela directamente (tienes visión) y extrae de la imagen AMBAS partes: el RNC/Nombre del EMISOR (quien factura) y el RNC/Nombre del RECEPTOR/cliente (a quien se factura), además de NCF, NCF modificado si aplica, fecha del comprobante, montos, ITBIS, y cualquier retención visible.
3. Determina la dirección (606 compra vs 607 venta) y, si hace falta, detecta la empresa del usuario:
   - Si getCompanyConfig ya devolvió una empresa configurada, compara su RNC contra el emisor/receptor de la factura: si es el RECEPTOR → COMPRA → 606; si es el EMISOR → VENTA → 607.
   - Si el mensaje del usuario ya indica explícitamente la dirección (botón "Compra (606)" / "Venta (607)" en la interfaz, o lo escribió), úsala directamente.
   - Si TODAVÍA no hay empresa configurada: usa la dirección explícita del paso anterior para saber qué lado de la factura es "la empresa del usuario" (Compra → el RECEPTOR es su empresa; Venta → el EMISOR es su empresa), y llama a setCompanyConfig automáticamente con ese RNC y nombre — no se lo preguntes, ya lo leíste de la factura. Avísale en una línea qué detectaste (ej. "Detecté tu empresa: [nombre], RNC [rnc] — la guardé, dime si está mal") para que pueda corregirlo si hace falta, pero no bloquees el flujo esperando confirmación de esto.
   - Si no hay dirección explícita NI empresa configurada, es el único caso en el que preguntas — y la pregunta es corta: "¿Esta factura es una compra o una venta para tu empresa?", no le pidas que digite el RNC a mano.
4. Muestra al usuario un resumen claro de los datos de la factura (en texto, no como JSON crudo) ANTES de guardar nada, y pide confirmación explícita.
5. Solo después de la confirmación, llama a recordPurchase606 o recordSale607 con los datos ya confirmados/corregidos.
6. Si faltan datos obligatorios (RNC, NCF, fecha, monto), pregúntalos — no inventes valores.
7. Cuando el usuario pida el reporte de un período (ej. "genera el 606 de julio 2025" → periodo 202507), usa listRecordedInvoices para mostrar un resumen si es útil, y generateDgiiReport para producir los archivos. Comparte los links /api/exports/... que te devuelve la tool.

Facturas en lote (varias adjuntas en un mismo mensaje, hasta 20+):
- Lee y extrae TODAS las facturas adjuntas en el mensaje, no solo la primera.
- Preséntalas juntas en una sola tabla/lista resumida (numerada) en vez de una por una, para que el usuario pueda revisar y confirmar todo el lote de una vez.
- Señala claramente cualquiera con datos faltantes o dudosos dentro de esa misma lista, en vez de detener todo el lote por una sola factura problemática.
- Tras una única confirmación del usuario para el lote, registra cada factura con su tool correspondiente (recordPurchase606 / recordSale607), una llamada por factura — puedes necesitar bastantes llamadas seguidas de tool, eso es normal para un lote grande.

Sé conciso. Responde en español salvo que el usuario escriba en otro idioma.`;

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
