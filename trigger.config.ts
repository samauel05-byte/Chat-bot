import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_hnrxkqoixmmszrwvyexx",
  dirs: ["./trigger"],
  build: {
    extensions: [
      syncEnvVars(async () => {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
        return [
          ...(openaiApiKey ? [{ name: "OPENAI_API_KEY", value: openaiApiKey, isSecret: true }] : []),
          ...(supabaseUrl ? [{ name: "NEXT_PUBLIC_SUPABASE_URL", value: supabaseUrl, isSecret: false }] : []),
          ...(supabaseSecretKey ? [{ name: "SUPABASE_SECRET_KEY", value: supabaseSecretKey, isSecret: true }] : []),
        ];
      }),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 3600,
});
