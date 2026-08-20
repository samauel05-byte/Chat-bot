"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react";
import type { invoiceChat } from "@/trigger/chat";
import { mintChatAccessToken, startChatSession } from "@/app/actions/chat";

export function Chat() {
  const transport = useTriggerChatTransport<typeof invoiceChat>({
    task: "invoice-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
  });

  const { messages, sendMessage, stop, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [mode, setMode] = useState<"606" | "607" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStreaming = status === "streaming" || status === "submitted";

  const MODE_PREFIX: Record<"606" | "607", string> = {
    "606": "Esta factura es una COMPRA: regístrala como formato 606. ",
    "607": "Esta factura es una VENTA: regístrala como formato 607. ",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() && (!files || files.length === 0)) return;
    const text = mode ? MODE_PREFIX[mode] + input : input;
    sendMessage({ text, files });
    setInput("");
    setFiles(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-sm font-medium">Chatbot de facturación 606 / 607</h1>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            Cuéntame el RNC de tu empresa para empezar, o adjunta directamente una factura.
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                "inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap " +
                (message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-black/5 dark:bg-white/10")
              }
            >
              {message.parts.map((part, i) => {
                if (part.type === "text") return <span key={i}>{part.text}</span>;
                if (part.type === "file" && part.mediaType?.startsWith("image/")) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={part.url}
                      alt={part.filename ?? "adjunto"}
                      className="mt-2 max-h-48 rounded"
                    />
                  );
                }
                if (part.type === "file") {
                  return (
                    <div key={i} className="mt-2 text-xs opacity-70">
                      📎 {part.filename ?? "archivo adjunto"}
                    </div>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  return (
                    <div key={i} className="mt-2 text-xs opacity-60">
                      ⚙ {part.type.replace("tool-", "")}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-black/10 p-3 dark:border-white/10">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-black/50 dark:text-white/50">Leer factura como:</span>
          <button
            type="button"
            onClick={() => setMode((m) => (m === "606" ? null : "606"))}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (mode === "606"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-black/15 text-black/70 dark:border-white/20 dark:text-white/70")
            }
          >
            Compra (606)
          </button>
          <button
            type="button"
            onClick={() => setMode((m) => (m === "607" ? null : "607"))}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (mode === "607"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-black/15 text-black/70 dark:border-white/20 dark:text-white/70")
            }
          >
            Venta (607)
          </button>
          {!mode && (
            <span className="text-xs text-black/40 dark:text-white/40">
              (sin elegir → el bot lo deduce por el RNC)
            </span>
          )}
        </div>
        {files && files.length > 0 && (
          <div className="mb-2 text-xs text-black/60 dark:text-white/60">
            {files.length} archivo(s) adjunto(s)
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => setFiles(e.target.files ?? undefined)}
            className="text-xs"
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 rounded border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="rounded bg-red-600 px-3 py-2 text-sm text-white"
            >
              Detener
            </button>
          ) : (
            <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
              Enviar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
