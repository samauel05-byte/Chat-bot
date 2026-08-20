import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool } from "ai";
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
      const config = getCompanyConfig();
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
      setCompanyConfig({ rnc, nombre });
      return { ok: true };
    },
  }),

  recordPurchase606: tool({
    description:
      "Registra una factura de COMPRA (formato 606) ya confirmada por el usuario. Solo llama esto después de mostrarle los datos extraídos y que el usuario los confirme explícitamente.",
    inputSchema: invoice606Schema,
    execute: async (input) => {
      const lineas = appendInvoice606(input);
      return { ok: true, lineas, tipo: "606" as const };
    },
  }),

  recordSale607: tool({
    description:
      "Registra una factura de VENTA (formato 607) ya confirmada por el usuario. Solo llama esto después de mostrarle los datos extraídos y que el usuario los confirme explícitamente.",
    inputSchema: invoice607Schema,
    execute: async (input) => {
      const lineas = appendInvoice607(input);
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

const SYSTEM_PROMPT_BASE = `Eres un asistente que ayuda a preparar los formatos 606 (Compras de Bienes y Servicios) y 607 (Ventas de Bienes y Servicios) para la DGII (República Dominicana), a partir de facturas que el usuario adjunta como imagen o PDF en el chat.

Flujo de trabajo:
1. Si no conoces el RNC de la empresa del usuario, llama a getCompanyConfig. Si no existe, pídeselo y guárdalo con setCompanyConfig antes de procesar facturas.
2. Cuando el usuario adjunte una factura, léela directamente (tienes visión) y extrae: RNC/Cédula de la contraparte, NCF, NCF modificado si aplica, fecha del comprobante, montos, ITBIS, y cualquier retención visible.
3. Determina la dirección (606 compra vs 607 venta):
   - Si el mensaje del usuario ya indica explícitamente que es una COMPRA o una VENTA (por ejemplo, eligió un botón "Compra (606)" o "Venta (607)" en la interfaz, o lo escribió), usa esa dirección directamente — es una elección explícita del usuario, no la reemplaces por tu propia inferencia. Si el RNC de la factura no calza con lo esperado para esa dirección, avísale como advertencia pero registra la factura con la dirección que el usuario indicó.
   - Si NO hay una dirección explícita, compara el RNC de la empresa contra el RNC emisor y receptor de la factura: si el RNC de la empresa es el RECEPTOR → COMPRA → 606; si es el EMISOR → VENTA → 607.
   - Si aun así no puedes determinarlo con certeza, pregunta al usuario en vez de adivinar.
4. Muestra al usuario un resumen claro de los datos extraídos (en texto, no como JSON crudo) ANTES de guardar nada, y pide confirmación explícita.
5. Solo después de la confirmación, llama a recordPurchase606 o recordSale607 con los datos ya confirmados/corregidos.
6. Si faltan datos obligatorios (RNC, NCF, fecha, monto), pregúntalos — no inventes valores.
7. Cuando el usuario pida el reporte de un período (ej. "genera el 606 de julio 2025" → periodo 202507), usa listRecordedInvoices para mostrar un resumen si es útil, y generateDgiiReport para producir los archivos. Comparte los links /api/exports/... que te devuelve la tool.

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
    const config = getCompanyConfig();
    const system = config
      ? `${SYSTEM_PROMPT_BASE}\n\nEmpresa configurada: RNC ${config.rnc}, ${config.nombre}.`
      : `${SYSTEM_PROMPT_BASE}\n\nTodavía no hay empresa configurada — pide el RNC antes de procesar facturas.`;

    return streamText({
      ...chat.toStreamTextOptions({ tools: runTools }),
      model: anthropic(MODEL),
      system,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(15),
    });
  },
});
