"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import type { invoiceChat } from "@/trigger/chat";
import { createClient } from "@/lib/supabase/server";
import { createQuotaContext } from "@/lib/quota-context";

const startSession = chat.createStartSessionAction<typeof invoiceChat>("invoice-chat");

async function getCurrentCompanyId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Inicia sesión para usar NALA.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.company_id ?? null;
}

// El identificador de empresa se resuelve en el servidor, no en el navegador.
// Así nadie puede cambiar el límite de otra empresa desde el cliente.
export async function startChatSession({ chatId }: { chatId: string }) {
  const companyId = await getCurrentCompanyId();
  return startSession({ chatId, clientData: createQuotaContext(companyId) });
}

// Mint puro. El transport lo llama en 401/403 para refrescar un token vencido.
export async function mintChatAccessToken(chatId: string) {
  await getCurrentCompanyId();
  return auth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  });
}
