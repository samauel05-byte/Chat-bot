"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";

// Crea la Session + primer run, devuelve un PAT de sesión. Idempotente por (env, chatId).
export const startChatSession = chat.createStartSessionAction("invoice-chat");

// Mint puro. El transport lo llama en 401/403 para refrescar un token vencido.
export async function mintChatAccessToken(chatId: string) {
  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  });
}
