import { AsyncLocalStorage } from "node:async_hooks";

/** Propagates the active org (or user) ID through async tool-call chains. */
export const orgContext = new AsyncLocalStorage<string>();

export function getOrgId(): string {
  return orgContext.getStore() ?? "default";
}
