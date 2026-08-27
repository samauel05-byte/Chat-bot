import { ai, chat } from "@trigger.dev/sdk/ai";
import { metadata } from "@trigger.dev/sdk";
import { generateText, Output, streamText, stepCountIs, tool, type ModelMessage, type UserModelMessage, type TextPart } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { invoice606Schema } from "@/lib/dgii/schema606";
import { invoice607Schema } from "@/lib/dgii/schema607";
import { invoiceIR17Schema } from "@/lib/dgii/schemaIR17";
import { generateReport } from "@/lib/dgii/generateReport";
import { verifyQuotaContext, type QuotaContext } from "@/lib/quota-context";

const MODEL = "gpt-5.6-terra";

type FileMeta = { url: string; contentType: string; name: string };

type BatchRequest = {
  files: FileMeta[];
  instruction: string;
};

type BatchProgress = {
  status: "preparando" | "procesando" | "validando" | "generando" | "completado" | "error";
  current: number;
  total: number;
  fileName?: string;
  recordsDetected?: number;
  message?: string;
};

const BATCH_TOOL_NAMES = ["generateReport606", "generateReport607", "generateReportIR17"];

type QuotaResult = {
  allowed: boolean;
  monthly_limit: number | null;
  used_before: number;
  used_after: number;
};

function getCompanyIdFromChatContext(): string | null {
  const context = ai.chatContext();
  return verifyQuotaContext(context?.clientData as QuotaContext | undefined);
}

async function consumeInvoiceQuota(companyId: string | null, periodo: string, invoiceCount: number) {
  // La cuenta propietaria no pertenece a una empresa cliente y no consume cupo.
  if (!companyId) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("No se pudo validar el límite de facturas. Comunícate con el administrador.");
  }

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("consume_company_invoice_quota", {
    p_company_id: companyId,
    p_periodo: periodo,
    p_invoice_count: invoiceCount,
  });
  if (error) {
    console.error("[invoice-chat] quota validation failed", error.message);
    throw new Error("No se pudo validar el límite de facturas. Intenta nuevamente.");
  }

  const quota = (Array.isArray(data) ? data[0] : data) as QuotaResult | null;
  if (!quota) {
    throw new Error("No se pudo validar el límite de facturas. Intenta nuevamente.");
  }
  if (!quota.allowed) {
    const limit = quota.monthly_limit?.toLocaleString("es-DO") ?? "0";
    const used = quota.used_before.toLocaleString("es-DO");
    throw new Error(
      `Este lote tiene ${invoiceCount.toLocaleString("es-DO")} facturas y supera el límite mensual de ${limit}. ` +
      `La empresa ya procesó ${used}. Comunícate con el administrador para ampliar tu plan.`
    );
  }
}

async function generateLimitedReport(
  tipo: "606" | "607" | "IR17",
  periodo: string,
  rows: Record<string, unknown>[],
  companyId = getCompanyIdFromChatContext()
) {
  await consumeInvoiceQuota(companyId, periodo, rows.length);
  return generateReport(tipo, periodo, rows);
}

function getTextContent(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  const textPart = message.content.find(
    (part: TextPart | unknown) => (part as TextPart).type === "text"
  ) as TextPart | undefined;
  return textPart?.text ?? "";
}

function getCurrentBatch(messages: ModelMessage[]): BatchRequest | null {
  const current = [...messages].reverse().find((message) => message.role === "user");
  if (!current) return null;

  const rawText = getTextContent(current);
  const markerMatch = rawText.match(/\[FACTURAS:([\s\S]*?)\]$/m);
  if (!markerMatch) return null;

  try {
    const files = JSON.parse(markerMatch[1]) as FileMeta[];
    if (!Array.isArray(files) || files.length < 2) return null;
    return {
      files,
      instruction: rawText.replace(/\s*\[FACTURAS:[\s\S]*?\]$/, "").trim(),
    };
  } catch {
    return null;
  }
}

function requestedType(instruction: string): "606" | "607" | "IR17" {
  if (/RETENCIÓN|IR-?17/i.test(instruction)) return "IR17";
  if (/VENTA|607/i.test(instruction)) return "607";
  return "606";
}

function safeProcessingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // El mensaje se muestra al usuario para diagnosticar el lote, pero se limita
  // para no revelar trazas, URLs completas ni datos de autenticación.
  return message
    .replace(/https?:\/\/\S+/g, "[URL ocultada]")
    .replace(/(?:sk|tr)_[A-Za-z0-9_-]+/g, "[credencial ocultada]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

function publishBatchProgress(progress: BatchProgress) {
  const event = { ...progress, updatedAt: new Date().toISOString() };
  // Queda guardado con el run de Trigger para revisar cualquier lote fallido.
  metadata.set("invoiceBatch", event);
  // El mismo estado se transmite al chat para que la persona vea el avance.
  chat.response.write({ type: "data-batch-progress", id: "batch-progress", data: event });
}

async function loadAttachmentBytes(file: FileMeta): Promise<Uint8Array> {
  const response = await fetch(file.url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo adjunto (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("El archivo adjunto está vacío.");
  }
  return bytes;
}

function expectedCount(instruction: string): number | undefined {
  const match = instruction.match(/(?:esper(?:o|adas?)|contiene|son|total(?: de)?)\s+(\d+)\s+(?:facturas?|retenciones?)/i)
    ?? instruction.match(/(\d+)\s+(?:facturas?|retenciones?)/i);
  return match ? Number(match[1]) : undefined;
}

const BATCH_EXTRACTION_PROMPT = `Extrae todos los registros del archivo adjunto para un reporte de la DGII de República Dominicana.

Reglas obligatorias:
- Recorre todas las páginas de principio a fin y devuelve un registro por cada factura o retención. No resumas, no omitas y no reutilices datos de otros archivos.
- Respeta cualquier filtro indicado por el usuario.
- RNC de 9 dígitos: tipoId "1". Cédula de 11 dígitos: tipoId "2".
- fechaComprobante contiene YYYYMM y diaComprobante contiene DD.
- Si un campo no aparece usa 0 o una cadena vacía, según su tipo. Si es ilegible usa "ILEGIBLE" cuando el esquema permita texto.
- Para 606, fechaPago/diaPago solo se incluyen si existe retención de ITBIS o ISR.
- Para 607, fechaRetencion/diaRetencion solo se incluyen si existe retención de ITBIS o ISR por terceros.
- Una nota de crédito o débito y la factura original son registros separados cuando ambas aparecen. El NCF propio va en ncf y el NCF afectado va en ncfModificado.
- No inventes registros para alcanzar una cantidad. La validación global se hace después de consolidar todas las partes.`;

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

    for (const [index, f] of files.entries()) {
      content.push({
        type: "text",
        text: `Archivo ${index + 1} de ${files.length}: ${f.name}. Procesa este archivo en orden con los demás adjuntos del mismo lote.`,
      });
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
      cantidadEsperada: z.number().int().positive().optional().describe("Cantidad de facturas indicada explícitamente por el usuario, si la proporcionó"),
      facturas: z.array(invoice606Schema).min(1).describe("Array con TODAS las facturas de compra del documento"),
    }),
    execute: async ({ periodo, cantidadEsperada, facturas }) => {
      if (cantidadEsperada !== undefined && facturas.length !== cantidadEsperada) {
        throw new Error(`Control de completitud: se esperaban ${cantidadEsperada} facturas y se extrajeron ${facturas.length}. No se generó un reporte parcial.`);
      }
      const result = await generateLimitedReport("606", periodo, facturas as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/${result.xlsxPathname.split("/").at(-1)}`,
        txtUrl: `/api/exports/${result.txtPathname.split("/").at(-1)}`,
      };
    },
  }),

  generateReport607: tool({
    description:
      "Recibe el array COMPLETO de todas las facturas de VENTA extraídas del documento y genera el reporte 607 de una sola vez. Incluye TODAS las facturas en un único llamado.",
    inputSchema: z.object({
      periodo: z.string().regex(/^\d{6}$/).describe("YYYYMM del período, ej. 202607"),
      cantidadEsperada: z.number().int().positive().optional().describe("Cantidad de facturas indicada explícitamente por el usuario, si la proporcionó"),
      facturas: z.array(invoice607Schema).min(1).describe("Array con TODAS las facturas de venta del documento"),
    }),
    execute: async ({ periodo, cantidadEsperada, facturas }) => {
      if (cantidadEsperada !== undefined && facturas.length !== cantidadEsperada) {
        throw new Error(`Control de completitud: se esperaban ${cantidadEsperada} facturas y se extrajeron ${facturas.length}. No se generó un reporte parcial.`);
      }
      const result = await generateLimitedReport("607", periodo, facturas as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/${result.xlsxPathname.split("/").at(-1)}`,
        txtUrl: `/api/exports/${result.txtPathname.split("/").at(-1)}`,
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
      const result = await generateLimitedReport("IR17", periodo, retenciones as Record<string, unknown>[]);
      return {
        ...result,
        xlsxUrl: `/api/exports/${result.xlsxPathname.split("/").at(-1)}`,
        txtUrl: `/api/exports/${result.txtPathname.split("/").at(-1)}`,
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
   - Si hay varios adjuntos llamados "parte-X-de-Y", forman un único expediente: procesa TODAS las partes en orden y no omitas ninguna página.
   - Si el usuario indicó una cantidad (por ejemplo, "77 facturas"), incluye cantidadEsperada: 77. Antes de llamar el tool, cuenta que el array tenga exactamente esa cantidad. Si no coincide, vuelve a revisar las partes faltantes; NUNCA entregues un reporte parcial.

   CAMPOS POR FACTURA (606/607):
   · proveedor/cliente: nombre del emisor o receptor
   · rncCedula y tipoId: RNC de 9 dígitos → tipoId "1"; cédula de 11 dígitos → tipoId "2". Si el usuario eligió el filtro de tipo de identificación, úsalo exactamente.
   · tipoBienesServicios (solo 606): usa el filtro elegido por el usuario si aparece en su mensaje. Si no eligió filtro, clasifica según la factura usando exclusivamente este catálogo: 01=Gastos de personal; 02=Trabajos, suministros y servicios; 03=Arrendamientos; 04=Activos fijos; 05=Representación; 06=Otras deducciones admitidas; 07=Gastos financieros; 08=Gastos extraordinarios; 09=Costos de venta; 10=Adquisiciones de activos; 11=Seguros.
   · ncf: número de comprobante fiscal PROPIO de este documento
   · ncfModificado: si es nota de crédito/débito, NCF original que modifica; si no, vacío
   · fechaComprobante: SOLO año+mes YYYYMM (ej: "14/04/26" → "202604")
   · diaComprobante: SOLO el día DD (ej: "14/04/26" → "14")
   · totalMontoFacturado: monto total
   · itbisFacturado: ITBIS (si hay dos cifras, el menor suele ser el ITBIS)
   · formaPago (solo 606): usa el filtro elegido por el usuario si aparece en su mensaje. Si no eligió filtro, lee la factura y usa: 01=Efectivo, 02=Cheques/Transferencias/Depósito, 03=Tarjeta crédito/débito, 04=Compra a crédito, 05=Permuta, 06=Nota de crédito, 07=Mixto.
   · tipoRetencionIsr (solo 606): usa el filtro elegido por el usuario si aparece en su mensaje. Si no eligió filtro, lee la factura y usa: 00=Ninguna, 01=Alquileres, 02=Honorarios por servicios, 03=Otras rentas, 04=Otras rentas presuntas, 05=Intereses a personas jurídicas, 06=Intereses a personas físicas, 07=Proveedores del Estado, 08=Juegos telefónicos, 09=Retenciones subsector de ganadería de carne bovina.
   · Si un campo no aparece: usa 0 o vacío. Si es ilegible: "ILEGIBLE". NO preguntes jamás.

   FECHAS DE RETENCIÓN — REGLA OBLIGATORIA:
   · La fechaComprobante y el diaComprobante siempre corresponden a la fecha de la factura.
   · 606: SOLO agrega fechaPago y diaPago cuando esta factura tenga retención de ITBIS o ISR. Si no hay retención, OMITE ambos campos para que queden vacíos.
   · 607: SOLO agrega fechaRetencion y diaRetencion cuando exista retención de ITBIS o ISR por terceros. Si no hay retención, OMITE ambos campos para que queden vacíos.
   · Cuando hay retención, usa la fecha real en que se practicó la retención; no copies la fecha de comprobante salvo que el documento indique que ambas coinciden.

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

async function extractFilePart(
  file: FileMeta,
  instruction: string,
  tipo: "606" | "607" | "IR17",
  partNumber: number,
  totalParts: number
): Promise<Record<string, unknown>[]> {
  const schema = tipo === "606"
    ? invoice606Schema
    : tipo === "607"
      ? invoice607Schema
      : invoiceIR17Schema;
  const noun = tipo === "IR17" ? "retenciones" : "facturas";
  let fileBytes: Uint8Array;
  try {
    // El worker descarga el adjunto y envía sus bytes al modelo. Así evitamos
    // que la lectura dependa de que OpenAI pueda acceder a una URL privada.
    fileBytes = await loadAttachmentBytes(file);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo preparar la parte ${partNumber} de ${totalParts}: ${reason}`);
  }
  const attachment: UserModelMessage["content"][number] = file.contentType.startsWith("image/")
    ? { type: "image", image: fileBytes }
    : { type: "file", data: fileBytes, mediaType: file.contentType as `application/${string}` };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await generateText({
        model: openai(MODEL),
        system: BATCH_EXTRACTION_PROMPT + (attempt === 2
          ? "\nReintento: revisa estrictamente que cada registro cumpla el formato solicitado antes de responder."
          : ""),
        output: Output.object({
          schema: z.object({
            registros: z.array(schema).describe(`Todos los registros ${tipo} encontrados en esta parte`),
          }),
        }),
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Tipo de reporte: ${tipo}. Parte ${partNumber} de ${totalParts}: ${file.name}.\nInstrucción original: ${instruction}\nExtrae todos los ${noun} visibles en esta parte.`,
            },
            attachment,
          ],
        }],
      });

      return result.output.registros as Record<string, unknown>[];
    } catch (error) {
      lastError = error;
      console.error("[invoice-chat] extraction attempt failed", {
        partNumber,
        totalParts,
        fileName: file.name,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.error("[invoice-chat] extraction failed after retry", {
    partNumber,
    totalParts,
    fileName: file.name,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw new Error(
    `No se pudo leer la parte ${partNumber} de ${totalParts} ("${file.name}") después de tres intentos. ` +
    `Motivo: ${safeProcessingError(lastError)}. No se generó ningún archivo parcial.`
  );
}

async function extractLargeBatch(
  batch: BatchRequest,
  tipo: "606" | "607" | "IR17"
): Promise<Record<string, unknown>[]> {
  // Ejecutar en orden conserva la trazabilidad de cada archivo y evita los
  // límites de la API. No se usa la señal del navegador: un lote fiscal debe
  // terminar aunque la persona cierre la pestaña o pierda conexión.
  const rows: Record<string, unknown>[] = [];
  for (const [index, file] of batch.files.entries()) {
    publishBatchProgress({
      status: "procesando",
      current: index + 1,
      total: batch.files.length,
      fileName: file.name,
      recordsDetected: rows.length,
    });
    const extracted = await extractFilePart(
      file,
      batch.instruction,
      tipo,
      index + 1,
      batch.files.length
    );
    rows.push(...extracted);
  }
  return rows;
}

function reportPeriod(instruction: string, rows: Record<string, unknown>[]): string {
  const explicit = instruction.match(/\b(20\d{4})\b/)?.[1];
  if (explicit) return explicit;

  const frequencies = new Map<string, number>();
  for (const row of rows) {
    const value = String(row.fechaComprobante ?? row.periodo ?? "");
    if (/^20\d{4}$/.test(value)) {
      frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
    }
  }
  const period = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!period) throw new Error("No se pudo determinar el período YYYYMM del lote.");
  return period;
}

export const invoiceChat = chat.agent({
  id: "invoice-chat",
  clientDataSchema: z.object({ companyId: z.string().uuid().nullable(), signature: z.string().regex(/^[a-f0-9]{64}$/) }),
  tools,
  uiMessageStreamOptions: {
    onError: (error) => {
      console.error("invoice-chat stream error:", error);
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Control de completitud:") ||
        message.includes("No se pudo leer la parte") ||
        message.includes("No se encontraron facturas") ||
        message.includes("No se pudo determinar el período") ||
        message.includes("El período debe tener formato")
      ) {
        return `No se generó ningún archivo: ${message}`;
      }
      return "Hubo un problema generando la respuesta. Intenta de nuevo.";
    },
  },
  run: async ({ messages, tools: runTools, signal, clientData }) => {
    const batch = getCurrentBatch(messages);
    if (batch) {
      const tipo = requestedType(batch.instruction);
      try {
        publishBatchProgress({ status: "preparando", current: 0, total: batch.files.length });
        const rows = await extractLargeBatch(batch, tipo);
        const expected = expectedCount(batch.instruction);

        publishBatchProgress({
          status: "validando",
          current: batch.files.length,
          total: batch.files.length,
          recordsDetected: rows.length,
        });
        if (expected !== undefined && rows.length !== expected) {
          throw new Error(
            `Control de completitud: se esperaban ${expected} registros y se extrajeron ${rows.length} ` +
            `después de revisar las ${batch.files.length} partes. No se generó un reporte parcial.`
          );
        }
        if (rows.length === 0) {
          throw new Error("No se encontraron facturas o retenciones legibles en los archivos adjuntos.");
        }

        const periodo = reportPeriod(batch.instruction, rows);
        chat.response.write({
          type: "data-batch-summary",
          data: { tipo, periodo, recordsDetected: rows.length, expectedRecords: expected ?? null },
        });
        publishBatchProgress({
          status: "generando",
          current: batch.files.length,
          total: batch.files.length,
          recordsDetected: rows.length,
        });
        const report = await generateLimitedReport(tipo, periodo, rows, verifyQuotaContext(clientData));
        const xlsxUrl = `/api/exports/${report.xlsxPathname.split("/").at(-1)}`;
        const txtUrl = `/api/exports/${report.txtPathname.split("/").at(-1)}`;

        publishBatchProgress({
          status: "completado",
          current: batch.files.length,
          total: batch.files.length,
          recordsDetected: rows.length,
        });
        // Los enlaces ya existen: no dependas de otra llamada a la IA solo para
        // redactar el mensaje, porque podía fallar después de crear los archivos.
        const { waitUntilComplete } = chat.stream.writer({
          execute: ({ write }) => {
            const id = "reporte-listo";
            write({ type: "text-start", id });
            write({
              type: "text-delta",
              id,
              delta:
                `Reporte ${tipo} del período ${periodo} generado con ${rows.length} registros.\n\n` +
                `[📥 Descargar Excel](${xlsxUrl}) | [📄 Descargar TXT](${txtUrl})`,
            });
            write({ type: "text-end", id });
          },
        });
        await waitUntilComplete();
        return;
      } catch (error) {
        publishBatchProgress({
          status: "error",
          current: 0,
          total: batch.files.length,
          message: safeProcessingError(error),
        });
        throw error;
      }
    }

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
