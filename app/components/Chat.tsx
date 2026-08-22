"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { invoiceChat } from "@/trigger/chat";
import { mintChatAccessToken, startChatSession } from "@/app/actions/chat";
import { upload } from "@vercel/blob/client";
import Markdown from "react-markdown";
import { useOrganization, useUser, UserButton } from "@clerk/nextjs";

const TOOL_LABELS: Record<string, string> = {
  getCompanyConfig: "🔍 Revisando los datos de tu empresa",
  setCompanyConfig: "🏢 Guardando los datos de tu empresa",
  recordPurchase606: "🧾 Guardando factura de compra (606)",
  recordSale607: "🧾 Guardando factura de venta (607)",
  listRecordedInvoices: "📋 Revisando las facturas guardadas",
  generateDgiiReport: "📊 Generando tu reporte",
};

function toolLabel(toolType: string) {
  const name = toolType.replace("tool-", "");
  return TOOL_LABELS[name] ?? `⚙ ${name}`;
}

export function Chat() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const orgId = organization?.id ?? user?.id ?? "default";

  const transport = useTriggerChatTransport<typeof invoiceChat>({
    task: "invoice-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [mode, setMode] = useState<"606" | "607" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator = isStreaming && lastMessage?.role !== "assistant";

  const MODE_PREFIX: Record<"606" | "607", string> = {
    "606": "Esta factura es una COMPRA: regístrala como formato 606. ",
    "607": "Esta factura es una VENTA: regístrala como formato 607. ",
  };

  function mergeFiles(existing: FileList | undefined, incoming: FileList | File[]): FileList {
    const dt = new DataTransfer();
    if (existing) for (const f of Array.from(existing)) dt.items.add(f);
    for (const f of Array.from(incoming)) dt.items.add(f);
    return dt.files;
  }

  function clearFiles() {
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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

    const baseText = mode ? MODE_PREFIX[mode] + input : input;

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
        const marker = `\n\n[ORG:${orgId}][FACTURAS:${JSON.stringify(uploaded)}]`;
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
      sendMessage({ text: `[ORG:${orgId}] ` + baseText });
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
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-4 border-dashed border-indigo-500 bg-indigo-500/10 backdrop-blur-sm">
          <p className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-lg">
            📥 Suelta tus facturas aquí — puedes soltar varias a la vez
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
            <Image src="/logo.png" alt="NALA" width={56} height={56} priority />
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
        <div className="flex items-center gap-3">
          {organization && (
            <span className="hidden text-xs text-neutral-500 dark:text-neutral-400 sm:block">
              🏢 {organization.name}
            </span>
          )}
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && <WelcomeCard />}

        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {messages.map((message) => (
            <MessageBubble key={message.id} role={message.role}>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  const displayText = part.text.replace(/\s*\[ORG:[^\]]+\]\s*/g, "").replace(/\s*\[FACTURAS:[\s\S]*?\]$/, "").trim();
                  if (message.role === "assistant") {
                    return (
                      <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                        <Markdown
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                className="font-medium text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400"
                                target="_blank"
                                rel="noopener noreferrer"
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
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              ⚠️ {error.message}
            </p>
          )}
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
            {!mode && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                (si no eliges, se asume Compra 606)
              </span>
            )}
          </div>

          {files && files.length > 0 && (
            <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
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
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
              ⚠️ {submitError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <label
              title="Elegir archivo"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-black/15 p-2.5 text-lg transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/20 dark:hover:bg-indigo-950/30"
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
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-black/15 p-2.5 text-lg transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/20 dark:hover:bg-indigo-950/30"
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
              placeholder="Mensaje opcional — o solo adjunta las facturas y da Enviar"
              className="min-w-0 flex-1 rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-indigo-400 focus:bg-white dark:border-white/15 dark:bg-neutral-800 dark:focus:bg-neutral-800"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="shrink-0 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                ■ Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={isUploading}
                className="shrink-0 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
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
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm " +
          (isUser
            ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
            : "bg-indigo-600 text-white")
        }
      >
        {isUser ? "🙂" : "🤖"}
      </div>
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm " +
          (isUser
            ? "rounded-br-sm bg-indigo-600 text-white"
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
    { icon: "1️⃣", text: "Selecciona el tipo: Compra (606) o Venta (607)" },
    { icon: "📎", text: "Adjunta las fotos o PDFs de las facturas — sin texto obligatorio" },
    { icon: "⚡", text: "El sistema las lee y las registra automáticamente — sin preguntas" },
    { icon: "📊", text: "El reporte se genera automáticamente después de procesar las facturas" },
  ];
  return (
    <div className="mx-auto mb-6 max-w-md rounded-2xl border border-black/5 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-2 text-3xl">🤖</div>
      <h2 className="mb-1 text-base font-semibold text-neutral-900 dark:text-neutral-50">
        NALA — Núcleo Automatizado de Listados Administrativos
      </h2>
      <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">
        Automatiza la preparación de información para la DGII:
      </p>
      <ul className="space-y-3 text-left">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-base dark:bg-indigo-950/40">
              {step.icon}
            </span>
            {step.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
