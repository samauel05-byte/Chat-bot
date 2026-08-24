"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { invoiceChat } from "@/trigger/chat";
import { mintChatAccessToken, startChatSession } from "@/app/actions/chat";
import { upload } from "@vercel/blob/client";
import Markdown from "react-markdown";

const TOOL_LABELS: Record<string, string> = {
  generateReport606: "📊 Generando reporte 606 (compras)…",
  generateReport607: "📊 Generando reporte 607 (ventas)…",
  generateReportIR17: "📊 Generando reporte IR-17 (retenciones)…",
};

const MAX_FILES = 25;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function toolLabel(toolType: string) {
  const name = toolType.replace("tool-", "");
  return TOOL_LABELS[name] ?? `⚙ ${name}`;
}

export function Chat() {
  const transport = useTriggerChatTransport<typeof invoiceChat>({
    task: "invoice-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [mode, setMode] = useState<"606" | "607" | "IR17" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isStreaming = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator = isStreaming && lastMessage?.role !== "assistant";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showTypingIndicator]);

  const MODE_PREFIX: Record<"606" | "607" | "IR17", string> = {
    "606": "Esta factura es una COMPRA: regístrala como formato 606. ",
    "607": "Esta factura es una VENTA: regístrala como formato 607. ",
    "IR17": "Esta es una RETENCIÓN: regístrala como formato IR-17. ",
  };

  function mergeFiles(existing: FileList | undefined, incoming: FileList | File[]): FileList {
    const candidates = [...Array.from(existing ?? []), ...Array.from(incoming)];
    const invalidType = candidates.find((file) => !ACCEPTED_TYPES.has(file.type));
    if (invalidType) {
      setSubmitError(`“${invalidType.name}” no es una imagen o un PDF compatible.`);
      return existing ?? new DataTransfer().files;
    }
    const oversized = candidates.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setSubmitError(`“${oversized.name}” supera el máximo de 20 MB.`);
      return existing ?? new DataTransfer().files;
    }
    if (candidates.length > MAX_FILES) {
      setSubmitError(`Puedes procesar hasta ${MAX_FILES} archivos por lote.`);
      return existing ?? new DataTransfer().files;
    }

    const dt = new DataTransfer();
    const seen = new Set<string>();
    for (const file of candidates) {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        dt.items.add(file);
      }
    }
    setSubmitError(null);
    return dt.files;
  }

  function clearFiles() {
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function resetAfterExcelDownload(href: string | undefined) {
    if (!href || !/\/api\/exports\/[^?#]+\.xlsx(?:[?#]|$)/i.test(href)) return;

    // The link opens separately; keep this page alive briefly so the browser
    // can start the download before clearing the current batch and chat.
    window.setTimeout(() => window.location.reload(), 1200);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles((prev) => mergeFiles(prev, e.dataTransfer.files));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (isUploading || isStreaming) return;

    const hasFiles = files && files.length > 0;
    const hasText = !!input.trim();

    if (!hasText && !hasFiles) {
      setSubmitError("Adjunta al menos una factura antes de enviar.");
      return;
    }

    const baseText = (mode ? MODE_PREFIX[mode] : "") + input;

    if (hasFiles) {
      setIsUploading(true);
      try {
        const uploaded = await Promise.all(
          Array.from(files).map(async (file) => {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            // Upload directly from browser to Vercel Blob CDN (bypasses 4.5 MB serverless limit)
            const blob = await upload(`uploads/${safeName}`, file, {
              access: "private",
              handleUploadUrl: "/api/upload",
            });
            const proxyUrl = `${window.location.origin}/api/invoice/${blob.pathname}`;
            return { url: proxyUrl, contentType: file.type, name: file.name };
          })
        );
        const marker = `\n\n[FACTURAS:${JSON.stringify(uploaded)}]`;
        sendMessage({ text: baseText + marker });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error subiendo el archivo";
        setSubmitError(msg);
        console.error("Upload error:", err);
        return;
      } finally {
        setIsUploading(false);
      }
    } else {
      sendMessage({ text: baseText });
    }

    setInput("");
    clearFiles();
  }

  return (
    <div
      className="relative flex h-dvh flex-col bg-slate-50 dark:bg-neutral-950"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-4 border-dashed border-violet-500 bg-violet-500/10 backdrop-blur-sm">
          <p className="rounded-xl bg-violet-600 px-6 py-3 text-base font-medium text-white shadow-lg">
            📥 Suelta tus facturas aquí — puedes soltar varias a la vez
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
            <Image src="/logo.svg" alt="NALA" width={56} height={56} priority />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              NALA — Núcleo Automatizado de Listados Administrativos
            </h1>
            <p className="hidden text-xs text-neutral-500 dark:text-neutral-400 sm:block">
              🤖 Automatiza la preparación de información para la DGII
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && <WelcomeCard />}

        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.map((message) => (
            <MessageBubble key={message.id} role={message.role}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  const displayText = part.text.replace(/\s*\[FACTURAS:[\s\S]*?\]$/, "").trim();
                  if (message.role === "assistant") {
                    return (
                      <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                        <Markdown
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                className="font-medium text-violet-600 underline hover:text-violet-800 dark:text-violet-400"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => resetAfterExcelDownload(href)}
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {displayText}
                        </Markdown>
                      </div>
                    );
                  }
                  return (
                    <span key={i} className="whitespace-pre-wrap">
                      {displayText}
                    </span>
                  );
                }
                if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={part.url}
                      alt={part.filename ?? "adjunto"}
                      className="mt-2 max-h-56 rounded-lg border border-black/10 object-cover dark:border-white/10"
                    />
                  );
                }
                if (part.type === "file") {
                  return (
                    <div
                      key={i}
                      className="mt-2 flex items-center gap-1.5 text-xs opacity-80"
                    >
                      📎 {part.filename ?? "archivo adjunto"}
                    </div>
                  );
                }
                if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                  const done =
                    "state" in part && (part as { state?: string }).state === "output-available";
                  return (
                    <div
                      key={i}
                      className="mt-2 flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
                    >
                      {done ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="animate-pulse">⏳</span>
                      )}
                      {toolLabel(part.type)}
                    </div>
                  );
                }
                return null;
              })}
            </MessageBubble>
          ))}

          {showTypingIndicator && (
            <MessageBubble role="assistant">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </MessageBubble>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              ⚠️ No pudimos completar el procesamiento. Intenta nuevamente.
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-black/5 bg-white px-4 py-3 shadow-[0_-1px_8px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-neutral-900 sm:px-8"
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Leer factura como:
            </span>
            <button
              type="button"
              aria-pressed={mode === "606"}
              onClick={() => setMode((m) => (m === "606" ? null : "606"))}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (mode === "606"
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-black/10 text-neutral-600 hover:border-sky-300 dark:border-white/15 dark:text-neutral-300")
              }
            >
              🛒 Compra (606)
            </button>
            <button
              type="button"
              aria-pressed={mode === "607"}
              onClick={() => setMode((m) => (m === "607" ? null : "607"))}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (mode === "607"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-black/10 text-neutral-600 hover:border-emerald-300 dark:border-white/15 dark:text-neutral-300")
              }
            >
              💰 Venta (607)
            </button>
            <button
              type="button"
              aria-pressed={mode === "IR17"}
              onClick={() => setMode((m) => (m === "IR17" ? null : "IR17"))}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (mode === "IR17"
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-black/10 text-neutral-600 hover:border-amber-300 dark:border-white/15 dark:text-neutral-300")
              }
            >
              🏦 Retención (IR-17)
            </button>
            {!mode && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                (si no eliges, se asume Compra 606)
              </span>
            )}
          </div>

          {files && files.length > 0 && (
            <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
              <span className="shrink-0">📎</span>
              <span className="shrink-0 font-medium">{files.length} archivo(s):</span>
              <span className="truncate">
                {Array.from(files)
                  .slice(0, 4)
                  .map((f) => f.name)
                  .join(", ")}
                {files.length > 4 ? ` +${files.length - 4} más` : ""}
              </span>
              <button
                type="button"
                onClick={clearFiles}
                className="ml-auto shrink-0 font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Quitar todos
              </button>
            </div>
          )}

          {submitError && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
              ⚠️ {submitError}
            </p>
          )}

          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-2 sm:flex">
            <label
              title="Elegir archivo"
              aria-label="Elegir archivos"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-black/15 p-2.5 text-lg transition-colors hover:border-violet-400 hover:bg-violet-50 dark:border-white/20 dark:hover:bg-violet-950/30"
            >
              📎
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) =>
                  setFiles((prev) => (e.target.files ? mergeFiles(prev, e.target.files) : prev))
                }
                className="hidden"
              />
            </label>
            <label
              title="Tomar foto con la cámara"
              aria-label="Tomar foto con la cámara"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-black/15 p-2.5 text-lg transition-colors hover:border-violet-400 hover:bg-violet-50 dark:border-white/20 dark:hover:bg-violet-950/30"
            >
              📷
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  setFiles((prev) => (e.target.files ? mergeFiles(prev, e.target.files) : prev))
                }
                className="hidden"
              />
            </label>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Mensaje opcional"
              placeholder="Mensaje opcional — o solo adjunta las facturas y da Enviar"
              className="min-w-0 rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-violet-400 focus:bg-white dark:border-white/15 dark:bg-neutral-800 dark:focus:bg-neutral-800 sm:flex-1"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="col-span-3 shrink-0 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:col-span-1"
              >
                ■ Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={isUploading}
                className="col-span-3 shrink-0 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1"
              >
                {isUploading ? "⏳ Subiendo…" : "Enviar ➤"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  role,
  children,
}: {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={"flex items-end gap-2 " + (isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm overflow-hidden " +
          (isUser
            ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
            : "")
        }
      >
        {isUser ? "🙂" : (
          <Image src="/logo.svg" alt="NALA" width={28} height={28} className="h-7 w-7 rounded-full" />
        )}
      </div>
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm " +
          (isUser
            ? "rounded-br-sm bg-violet-600 text-white"
            : "rounded-bl-sm bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100")
        }
      >
        {children}
      </div>
    </div>
  );
}

function WelcomeCard() {
  const steps = [
    { icon: "🛒", text: "Compras (606), Ventas (607) o Retenciones ISR (IR-17)" },
    { icon: "📎", text: "Adjunta fotos o PDFs de las facturas — sin texto obligatorio" },
    { icon: "⚡", text: "NALA las lee y registra automáticamente, sin preguntas" },
    { icon: "📊", text: "El reporte .xlsx y .txt se genera listo para la DGII" },
  ];
  return (
    <div className="mx-auto mb-6 max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-md dark:border-white/10 dark:bg-neutral-900">
      {/* Animated hero */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-violet-600 to-purple-800 px-6 pb-8 pt-10">
        {/* Background orbs */}
        <div className="nala-orb-1 absolute -left-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="nala-orb-2 absolute -bottom-6 -right-6 h-28 w-28 rounded-full bg-violet-300/20 blur-2xl" />
        {/* Floating logo */}
        <div className="nala-float relative z-10 mb-4">
          <Image src="/logo.svg" alt="NALA" width={72} height={72} priority className="rounded-2xl shadow-xl" />
        </div>
        <h2 className="relative z-10 text-center text-base font-bold text-white drop-shadow-sm">
          NALA
        </h2>
        <p className="relative z-10 mt-0.5 text-center text-xs text-violet-200">
          Núcleo Automatizado de Listados Administrativos
        </p>
      </div>
      {/* Steps */}
      <div className="p-5">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          Cómo funciona
        </p>
        <ul className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-base dark:bg-violet-950/40">
                {step.icon}
              </span>
              {step.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
