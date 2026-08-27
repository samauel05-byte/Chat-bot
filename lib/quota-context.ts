import { createHmac, timingSafeEqual } from "node:crypto";

export type QuotaContext = {
  companyId: string | null;
  signature: string;
};

function signatureFor(companyId: string | null) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Falta la configuración segura del límite de facturas.");
  return createHmac("sha256", secret).update(`nala-quota:${companyId ?? "owner"}`).digest("hex");
}

export function createQuotaContext(companyId: string | null): QuotaContext {
  return { companyId, signature: signatureFor(companyId) };
}

export function verifyQuotaContext(context: QuotaContext | undefined): string | null {
  if (!context || typeof context.signature !== "string") {
    throw new Error("No se pudo validar el acceso de esta empresa. Vuelve a iniciar sesión.");
  }
  const expected = signatureFor(context.companyId);
  const supplied = Buffer.from(context.signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) {
    throw new Error("No se pudo validar el acceso de esta empresa. Vuelve a iniciar sesión.");
  }
  return context.companyId;
}
