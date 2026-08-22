@AGENTS.md

# Nala — DGII Invoice Processing Chatbot

A Spanish-language AI chatbot that reads invoice images/PDFs and automatically generates DGII tax reports (Formats 606 and 607) for the Dominican Republic. Built for Save Consultores, S.R.L.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3.1 (App Router) |
| Runtime | React 19, TypeScript 5 |
| Styling | Tailwind CSS v4 |
| AI runtime | Trigger.dev v4 chat agent |
| AI model | `claude-sonnet-5-20251001` via `@ai-sdk/anthropic` |
| AI SDK | Vercel AI SDK v7 (`ai` package) |
| File storage | Vercel Blob (private access) |
| Validation | Zod v4 |
| Excel output | ExcelJS |

## Project Structure

```
app/
  page.tsx                        # Entry: renders <Chat />
  layout.tsx                      # Root layout, Geist fonts, metadata
  globals.css                     # Tailwind base styles
  components/Chat.tsx             # Full chat UI (client component)
  actions/chat.ts                 # Server actions: session start + token mint
  api/
    upload/route.ts               # POST — Vercel Blob client-upload handler
    exports/[filename]/route.ts   # GET — proxy for private export files (.xlsx/.txt)
    invoice/[...path]/route.ts    # GET — proxy for private invoice uploads

trigger/
  chat.ts                         # Trigger.dev chat agent: AI tools + system prompt

lib/dgii/
  schema606.ts                    # Zod schema + column definitions for Format 606 (purchases)
  schema607.ts                    # Zod schema + column definitions for Format 607 (sales)
  store.ts                        # Vercel Blob CRUD: CSV read/write with per-type write locks
  generateReport.ts               # Generates .xlsx (review) and .txt (DGII submission)
  catalogs.ts                     # DGII lookup catalogs
  classifyDirection.ts            # Helper to classify invoice direction

trigger.config.ts                 # Trigger.dev project config (project ID, retry policy)
next.config.ts                    # Next.js config (currently default)
```

## Architecture

### Data Flow

1. **User** attaches invoice files (images/PDFs) and optionally types a message.
2. **Client** uploads files directly to Vercel Blob CDN via `@vercel/blob/client` (bypasses the 4.5 MB Next.js serverless limit). Upload is validated by `/api/upload`.
3. **Client** embeds blob URLs as a `[FACTURAS:…]` JSON marker appended to the message text, then calls `sendMessage`.
4. **Trigger.dev** receives the message through a real-time session (minted via `mintChatAccessToken` / `startChatSession` server actions).
5. **`trigger/chat.ts`** pre-processes messages: strips the marker and converts URLs to AI SDK `image` / `file` content parts, then calls `streamText` with `anthropic(MODEL)`.
6. **Claude** (vision-capable) reads each invoice and calls tools (`recordPurchase606`, `recordSale607`, `listRecordedInvoices`, `generateDgiiReport`) in a step loop (up to 2000 steps).
7. **Tools** read/write CSV data in Vercel Blob (private) and generate `.xlsx`/`.txt` export files.
8. **Client** renders streamed response parts: text (via `react-markdown`), tool-call badges, and file attachments.

### Storage Layout (Vercel Blob, private)

| Pathname | Contents |
|---|---|
| `606.csv` | All recorded Format 606 purchase invoices |
| `607.csv` | All recorded Format 607 sale invoices |
| `config.json` | Company config: `{ rnc, nombre }` |
| `exports/606_YYYYMM.xlsx` | Review Excel for period |
| `exports/606_YYYYMM.txt` | Pipe-delimited DGII submission for period |
| `exports/607_YYYYMM.xlsx` | (same for sales) |
| `exports/607_YYYYMM.txt` | (same for sales) |
| `uploads/<safeName>` | Uploaded invoice files (temp) |

### Write Locking

`lib/dgii/store.ts` chains a per-type (`"606"` / `"607"`) promise lock around every CSV append. This prevents lost rows when the AI calls multiple `recordPurchase606` / `recordSale607` tool calls concurrently in the same batch.

## Key Conventions

### Date Fields (DGII format)
DGII requires month and day as separate fields:
- `fechaComprobante` / `fechaPago`: `YYYYMM` (year + month only, 6 digits)
- `diaComprobante` / `diaPago`: `DD` (day only, 2 digits)

### Invoice Format Types
- **606** — Compras (purchases): supplier pays DGII on our behalf
- **607** — Ventas (sales): we collect ITBIS from customers

### UI Mode Toggle
The `mode` state (`"606" | "607" | null`) in `Chat.tsx` prepends a Spanish prefix to the message so the AI knows which schema to use. If null, the system prompt defaults to 606.

### File Upload Pattern
Files are uploaded client-side with `@vercel/blob/client` `upload()` to avoid the 4.5 MB Next.js serverless body limit. The resulting blob URL uses `access: "private"` and is served back to the AI through the proxy at `/api/invoice/[...path]`.

### Tool Labels (Spanish)
`TOOL_LABELS` in `Chat.tsx` maps internal tool names to user-visible Spanish status messages shown while a tool call is pending.

### Markdown Rendering
Assistant messages use `react-markdown` with custom `<a>` rendering (opens in new tab, indigo styling). Download links for reports are formatted as `[📥 Descargar Excel](/api/exports/606_YYYYMM.xlsx)`.

### Export Proxy Security
`/api/exports/[filename]` validates that `filename` contains no path separators or `..` before fetching from Blob — prevents path traversal. `/api/invoice/[...path]` enforces the `uploads/` prefix.

## Environment Variables

```bash
TRIGGER_SECRET_KEY=        # Trigger.dev dev secret key (from project API Keys page)
ANTHROPIC_API_KEY=         # Anthropic API key (must support vision / claude-sonnet-5)
BLOB_READ_WRITE_TOKEN=     # Vercel Blob token (auto-set by `vercel env pull`)
```

Copy `.env.local.example` to `.env.local` and fill in these three values.

## Development Commands

```bash
npm run dev           # Start Next.js dev server (localhost:3000)
npm run dev:trigger   # Start Trigger.dev dev worker (runs trigger/chat.ts locally)
npm run build         # Production build
npm run lint          # ESLint
```

Both `npm run dev` and `npm run dev:trigger` must run simultaneously in development for the chat to work end-to-end.

## Adding or Changing AI Tools

All tools are defined in `trigger/chat.ts`. Each tool has:
- `description` — used by the LLM to decide when to call it
- `inputSchema` — Zod schema validated before `execute` runs
- `execute` — runs server-side inside the Trigger.dev worker

Tool call status is shown in the UI via `TOOL_LABELS` in `Chat.tsx`. Add a new label entry when adding a new tool.

## Adding Invoice Fields

1. Update the Zod schema in `lib/dgii/schema606.ts` or `lib/dgii/schema607.ts`.
2. Add the new column to `COLUMNS_606` / `COLUMNS_607` in the same file (maintains official DGII column order).
3. Update the system prompt in `trigger/chat.ts` if the field needs extraction guidance.

## Trigger.dev Configuration

`trigger.config.ts` sets:
- `project: "proj_hnrxkqoixmmszrwvyexx"` — the Trigger.dev project ID
- `dirs: ["./trigger"]` — agent entry points
- `maxDuration: 3600` — 1-hour max run (supports large invoice batches)
- Default retry: up to 3 attempts with exponential backoff

## Deployment

This app is deployed on Vercel. Key notes:
- The Vercel Blob token is set via `BLOB_READ_WRITE_TOKEN` in Vercel environment settings
- The Trigger.dev worker is deployed separately via `trigger deploy`
- Both the Next.js app and the Trigger.dev worker need `ANTHROPIC_API_KEY`

## UI Language

All user-facing text is in **Spanish** (Dominican Republic context). Keep new UI strings in Spanish. Error messages, button labels, and placeholder text must all remain in Spanish.
