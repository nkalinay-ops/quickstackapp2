import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Trigger = "primary" | "retry" | "manual";
type SyncStatus = "running" | "success" | "partial" | "error" | "skipped";

interface PullListRow {
  source: "lunar" | "prh";
  sku: string;
  title: string;
  publisher: string | null;
  format: string | null;
  variant_label: string | null;
  price: number | null;
  foc_date: string | null;
  on_sale_date: string | null;
  writer: string | null;
  artist: string | null;
  upc_isbn: string | null;
  cover_image_url: string | null;
  raw: Record<string, unknown>;
  last_seen_at: string;
}

// Minimal DOM interface for the elements we actually use —
// avoids importing deno-dom's Element type directly, which conflicts with the Deno global
interface DomEl {
  querySelector(sel: string): DomEl | null;
  querySelectorAll(sel: string): DomEl[];
  getAttribute(name: string): string | null;
  textContent: string | null;
  childNodes: Array<{ nodeType: number; textContent: string | null }>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 100;
const MAX_PRH_PAGES = 25;
const FETCH_TIMEOUT_MS = 15_000;
const LUNAR_TIMEOUT_MS = 60_000;
const LUNAR_DATA_BASE = "https://www.lunardistribution.com/home/productdatafile";
const PRH_AJAX_URL = "https://prhcomics.com/wp/wp-admin/admin-ajax.php";
const PRH_POST_ID = "16805";

// ── Fetch helpers ──────────────────────────────────────────────────────────────

// Browser-like headers to avoid bot detection / 403s from distributor sites
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      headers: {
        ...BROWSER_HEADERS,
        ...((opts.headers ?? {}) as Record<string, string>),
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}


// ── Date parsers ───────────────────────────────────────────────────────────────

function parseLunarDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const p = raw.split("/");
  if (p.length !== 3) return null;
  return `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
}

function parsePRHDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(?:On sale|FOC)\s+(\w{3})\s+(\d{1,2}),\s+(\d{4})/i);
  if (!m) return null;
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
}

// ── Lunar ──────────────────────────────────────────────────────────────────────

// FOC dates are always on Mondays. Fetch 4 weeks back through 2 weeks forward
// so the window covers comics on shelves NOW as well as upcoming releases.
// (FOC → on_sale is ~3-4 weeks, so last Monday's FOC = releases ~3 weeks out;
//  we need to go back 4 Mondays to capture the current release week.)
function computeLunarFocDates(): string[] {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon…6=Sat
  const daysToLastMonday = dow === 0 ? 6 : dow - 1;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysToLastMonday);

  const dates: string[] = [];
  for (let i = -4; i <= 2; i++) {  // 4 back, current, 2 forward = 7 FOC dates
    const d = new Date(lastMonday);
    d.setDate(lastMonday.getDate() + i * 7);
    // Lunar expects "M/D/YYYY 12:00:00 AM" (no zero-padding on M or D)
    dates.push(`${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} 12:00:00 AM`);
  }
  return dates;
}

// deno-lint-ignore no-explicit-any
function normalizeLunarRow(row: Record<string, any>, now: string): PullListRow | null {
  const sku = String(row.ProductCode ?? "").trim();
  const title = String(row.Title ?? "").trim();
  if (!sku || !title) return null;

  const rawPrice = row.RetailCost;
  const price = typeof rawPrice === "number"
    ? rawPrice
    : typeof rawPrice === "string" ? parseFloat(rawPrice) || null
    : null;

  return {
    source: "lunar",
    sku,
    title,
    publisher: String(row.Publisher ?? "").trim() || null,
    format: String(row.CoverType ?? "").trim() || null,
    variant_label: null,
    price,
    foc_date: parseLunarDate(String(row.FinalOrderCutoff ?? "")),
    on_sale_date: parseLunarDate(String(row.InstoreDate ?? "")),
    writer: String(row.Writer ?? "").trim() || null,
    artist: String(row.Artist ?? "").trim() || null,
    upc_isbn: String(row.UPC ?? row.ISBN ?? "").trim() || null,
    cover_image_url: `https://media.lunardistribution.com/images/covers/${sku}.jpg`,
    raw: row,
    last_seen_at: now,
  };
}

async function fetchLunarForDate(focDate: string, now: string): Promise<PullListRow[]> {
  const url = `${LUNAR_DATA_BASE}?foc=${encodeURIComponent(focDate)}`;
  // Use a longer timeout for the binary download; omit Accept-Encoding so the
  // server can't send a compressed response that might stall the stream
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LUNAR_TIMEOUT_MS);
  const resp = await fetch(url, {
    signal: ctrl.signal,
    headers: {
      ...BROWSER_HEADERS,
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
      "Accept-Encoding": "identity",
    },
  }).finally(() => clearTimeout(timer));
  if (!resp.ok) throw new Error(`Lunar xlsx fetch failed for "${focDate}": ${resp.status}`);

  const ct = resp.headers.get("content-type") ?? "";
  const buf = await resp.arrayBuffer();

  // Guard against receiving an HTML error page instead of binary xlsx
  if (buf.byteLength < 100 || (!ct.includes("spreadsheet") && !ct.includes("octet") && !ct.includes("excel") && !ct.includes("zip"))) {
    const preview = new TextDecoder().decode(buf.slice(0, 200));
    throw new Error(`Lunar xlsx for "${focDate}" looks wrong. Content-Type: ${ct}. Preview: ${preview}`);
  }

  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  // deno-lint-ignore no-explicit-any
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  return rows.flatMap((r) => {
    const n = normalizeLunarRow(r, now);
    return n ? [n] : [];
  });
}

async function fetchAllLunar(_parser: DOMParser, now: string): Promise<PullListRow[]> {
  const focDates = computeLunarFocDates();
  console.log(`Lunar: ${focDates.length} FOC dates`, focDates);

  const results = await Promise.all(
    focDates.map(date =>
      fetchLunarForDate(date, now).then(items => {
        console.log(`Lunar FOC ${date}: ${items.length} rows`);
        return items;
      })
    )
  );
  return results.flat();
}

// ── PRH ───────────────────────────────────────────────────────────────────────

function normalizePRHCard(card: DomEl, now: string): PullListRow | null {
  const isbn = card.querySelector(".carousel-meta-isbn")?.textContent?.trim() ?? "";
  if (!isbn) return null;

  // Take the first text node inside the title anchor to skip incentive-ratio spans like [1:10]
  let title = "";
  const titleAnchor = card.querySelector(".carousel-meta-title a");
  if (titleAnchor) {
    for (const node of titleAnchor.childNodes) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        title = node.textContent?.trim() ?? "";
        if (title) break;
      }
    }
  }
  if (!title) return null;

  const priceText = card.querySelector(".price-usa")?.textContent?.trim() ?? "";
  const priceMatch = priceText.match(/\$([\d.]+)/);
  const price = priceMatch ? parseFloat(priceMatch[1]) : null;

  const onSaleRaw = card.querySelector(".carousel-meta-onsale")?.textContent?.trim();
  const focRaw = card.querySelector(".carousel-meta-focdate")?.textContent?.trim();

  const authors = Array.from(card.querySelectorAll(".carousel-meta-author a"))
    .map((a) => (a as DomEl).textContent?.trim())
    .filter(Boolean)
    .join(", ");

  const format = card.querySelector(".carousel-meta-format")?.textContent?.trim() || null;
  const publisher = card.querySelector(".carousel-meta-division")?.textContent?.trim() || null;
  const variantLabel = card.querySelector(".variant-cover-flag")?.textContent?.trim() || null;

  return {
    source: "prh",
    sku: isbn,
    title,
    publisher,
    format,
    variant_label: variantLabel || null,
    price,
    foc_date: parsePRHDate(focRaw),
    on_sale_date: parsePRHDate(onSaleRaw),
    writer: authors || null,
    artist: null,
    upc_isbn: isbn,
    cover_image_url: `https://images.penguinrandomhouse.com/cover/${isbn}?width=500`,
    raw: { title, isbn, price_usa: priceText, on_sale_raw: onSaleRaw, foc_raw: focRaw, format, publisher, variant_label: variantLabel },
    last_seen_at: now,
  };
}

function parseCardsFromHtml(html: string, parser: DOMParser, now: string): { items: PullListRow[]; cardCount: number } {
  // deno-lint-ignore no-explicit-any
  const doc = parser.parseFromString(html, "text/html") as any;
  if (!doc) return { items: [], cardCount: 0 };

  const cards = doc.querySelectorAll(".product-item-medium.toast-anchor");
  const items: PullListRow[] = [];
  for (const card of cards) {
    const item = normalizePRHCard(card as DomEl, now);
    if (item) items.push(item);
  }
  return { items, cardCount: cards.length };
}

// Returns the Monday-aligned FOC date range: 4 weeks back through 2 weeks forward.
// Mirrors the Lunar window so both sources cover the same release dates.
// Format: MM/DD/YYYY (zero-padded), matching what PRH's get_product_list expects.
function computePRHDateRange(): { from: string; to: string } {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun…6=Sat
  const daysToLastMonday = dow === 0 ? 6 : dow - 1;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysToLastMonday);

  const from = new Date(lastMonday);
  from.setDate(lastMonday.getDate() - 28); // 4 weeks back

  const to = new Date(lastMonday);
  to.setDate(lastMonday.getDate() + 14); // 2 weeks forward

  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

  return { from: fmt(from), to: fmt(to) };
}

async function fetchAllPRH(parser: DOMParser, now: string): Promise<PullListRow[]> {
  // Step 1: Mint an anonymous nonce — no session or auth required.
  const nonceResp = await fetchWithTimeout(PRH_AJAX_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action: "get_nonce" }).toString(),
  });
  if (!nonceResp.ok) throw new Error(`PRH get_nonce failed: ${nonceResp.status}`);

  // deno-lint-ignore no-explicit-any
  const nonceJson = await nonceResp.json() as any;
  const nonce: string = nonceJson?.nonce ?? "";
  if (!nonce) throw new Error(`PRH nonce missing: ${JSON.stringify(nonceJson)}`);
  console.log(`PRH: nonce=${nonce}`);

  // Step 2: Paginate using get_product_list; response.data.content is the HTML fragment.
  const { from: focFrom, to: focTo } = computePRHDateRange();
  console.log(`PRH: date range ${focFrom} → ${focTo}`);

  const baseFilters = JSON.stringify({
    l1_category: "",
    filters: {
      category: [], "sale-status": [], format: [], age: [],
      grade: [], guides: [], publisher: [], comics_publisher: [],
    },
  });

  const allItems = new Map<string, PullListRow>();
  let start = 0;

  for (let page = 1; page <= MAX_PRH_PAGES; page++) {
    const params = JSON.stringify({
      isbn: [],        // must be explicit empty array; omitting causes silent total:0 filter
      catSetId: "CM",
      focDateFrom: focFrom,
      focDateTo: focTo,
      sort: ["title"],
      dir: ["asc"],
      start,
    });

    const body = new URLSearchParams({
      action: "get_product_list",
      postType: "dynamic-titlelist",
      postId: PRH_POST_ID,
      product_load_nonce: nonce,
      params,
      filters: baseFilters,
    });

    const resp = await fetchWithTimeout(PRH_AJAX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }).catch(() => null);

    if (!resp?.ok) {
      if (page === 1) throw new Error(`PRH get_product_list page 1 failed: ${resp?.status ?? "network error"}`);
      console.log(`PRH page ${page}: request failed (${resp?.status}), stopping`);
      break;
    }

    // deno-lint-ignore no-explicit-any
    const data = await resp.json() as any;
    if (!data?.success) {
      const preview = JSON.stringify(data).slice(0, 300);
      if (page === 1) throw new Error(`PRH get_product_list page 1 not success: ${preview}`);
      console.log(`PRH page ${page}: not success (${preview}), stopping`);
      break;
    }

    const content: string = data?.data?.content ?? "";
    const total: number = data?.data?.total ?? 0;
    const more: boolean = !!data?.data?.more;
    const nextStart: number = data?.data?.next_start_limit ?? (start + 36);

    const { items, cardCount } = parseCardsFromHtml(content, parser, now);
    console.log(`PRH page ${page} (start=${start}): total=${total}, cards=${cardCount}, items=${items.length}, more=${more}`);

    if (page === 1 && cardCount === 0) {
      const preview = content.slice(0, 400).replace(/\s+/g, " ");
      throw new Error(`PRH page 1: 0 cards parsed. total=${total}. content-preview: ${preview}`);
    }

    for (const item of items) allItems.set(item.sku, item);
    if (!more) break;
    start = nextStart;
  }

  return Array.from(allItems.values());
}

// ── Upsert ─────────────────────────────────────────────────────────────────────

async function upsertBatch(
  // deno-lint-ignore no-explicit-any
  client: any,
  items: PullListRow[]
): Promise<number> {
  if (items.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const { error, count } = await client
      .from("pull_list_items")
      .upsert(chunk, { onConflict: "source,sku", count: "exact" });
    if (error) throw error;
    total += count ?? chunk.length;
  }
  return total;
}

// ── Skip logic ─────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function shouldSkip(client: any, trigger: Trigger): Promise<boolean> {
  if (trigger === "manual") return false;
  const windowMs = trigger === "primary" ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data } = await client
    .from("pull_list_sync_log")
    .select("id")
    .in("status", ["success", "partial"])
    .gte("completed_at", cutoff)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Main handler ───────────────────────────────────────────────────────────────

const SYNC_SECRET = Deno.env.get("PULL_LIST_SYNC_SECRET") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const rawToken = authHeader.replace(/^Bearer\s+/i, "");

  // Accept the shared secret (pg_cron) or a valid admin user JWT (admin UI)
  let authorized = SYNC_SECRET !== "" && rawToken === SYNC_SECRET;
  if (!authorized && rawToken) {
    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (user) {
      const { data: profile } = await createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      ).from("user_profiles").select("is_admin").eq("id", user.id).single();
      authorized = !!profile?.is_admin;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const trigger: Trigger =
    body.trigger === "primary" || body.trigger === "retry" ? body.trigger : "manual";

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (await shouldSkip(serviceClient, trigger)) {
    console.log(`sync-pull-list: skipping (trigger=${trigger})`);
    await serviceClient.from("pull_list_sync_log").insert({ trigger, status: "skipped" });
    return new Response(JSON.stringify({ status: "skipped" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: logRow } = await serviceClient
    .from("pull_list_sync_log")
    .insert({ trigger, status: "running" })
    .select("id")
    .single();

  const logId: string | null = logRow?.id ?? null;
  const startedAt = Date.now();
  const now = new Date().toISOString();

  // Shared DOMParser instance — initialised once, reused for both sources
  const parser = new DOMParser();

  let lunarRowsSeen = 0, lunarRowsUpserted = 0, lunarError: string | null = null;
  let prhRowsSeen = 0, prhRowsUpserted = 0, prhError: string | null = null;

  // Wrap both syncs so an unhandled crash still writes to the log
  try {
    // Lunar — runs independently so a PRH failure doesn't block Lunar data
    try {
      const items = await fetchAllLunar(parser, now);
      lunarRowsSeen = items.length;
      if (lunarRowsSeen === 0) throw new Error("Zero rows returned — site may have changed");
      lunarRowsUpserted = await upsertBatch(serviceClient, items);
      console.log(`Lunar done: ${lunarRowsUpserted}/${lunarRowsSeen} upserted`);
    } catch (e) {
      lunarError = e instanceof Error ? e.message : String(e);
      console.error("Lunar error:", lunarError);
    }

    // PRH — runs independently
    try {
      const items = await fetchAllPRH(parser, now);
      prhRowsSeen = items.length;
      prhRowsUpserted = await upsertBatch(serviceClient, items);
      console.log(`PRH done: ${prhRowsUpserted}/${prhRowsSeen} upserted`);
    } catch (e) {
      prhError = e instanceof Error ? e.message : String(e);
      console.error("PRH error:", prhError);
    }
  } catch (fatal) {
    // Catches anything that escaped the inner try/catch blocks
    lunarError = lunarError ?? `Fatal: ${fatal instanceof Error ? fatal.message : String(fatal)}`;
    prhError = prhError ?? `Fatal: ${fatal instanceof Error ? fatal.message : String(fatal)}`;
  }

  const status: SyncStatus =
    !lunarError && !prhError ? "success"
    : lunarError && prhError ? "error"
    : "partial";

  const durationMs = Date.now() - startedAt;

  if (logId) {
    await serviceClient
      .from("pull_list_sync_log")
      .update({
        completed_at: new Date().toISOString(),
        status,
        lunar_rows_seen: lunarRowsSeen,
        lunar_rows_upserted: lunarRowsUpserted,
        lunar_error: lunarError,
        prh_rows_seen: prhRowsSeen,
        prh_rows_upserted: prhRowsUpserted,
        prh_error: prhError,
        duration_ms: durationMs,
      })
      .eq("id", logId);
  }

  return new Response(
    JSON.stringify({ status, lunarRowsSeen, lunarRowsUpserted, prhRowsSeen, prhRowsUpserted, lunarError, prhError, durationMs }),
    {
      status: status === "error" ? 500 : 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    }
  );
});
