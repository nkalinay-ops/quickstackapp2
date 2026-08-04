import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import * as XLSX from "npm:xlsx@0.18.5";
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
const FETCH_TIMEOUT_MS = 30_000;
const LUNAR_HOME = "https://lunardistribution.com";
const LUNAR_DATA_BASE = "https://www.lunardistribution.com/home/productdatafile";
const PRH_LIST_URL = "https://prhcomics.com/dynamic-titlelist/comics-foc-date-one-week-2/";
const PRH_AJAX_FALLBACK = "https://prhcomics.com/wp-admin/admin-ajax.php";

// ── Fetch helpers ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Searches for var name = "value" or var name = 'value' patterns in inline JS
function extractJsVar(html: string, name: string): string | null {
  for (const re of [
    new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*"([^"]+)"`),
    new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*'([^']+)'`),
    new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`),
  ]) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
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

async function getLunarFocDates(parser: DOMParser): Promise<string[]> {
  const resp = await fetchWithTimeout(LUNAR_HOME);
  if (!resp.ok) throw new Error(`Lunar homepage fetch failed: ${resp.status}`);
  const html = await resp.text();
  // deno-lint-ignore no-explicit-any
  const doc = parser.parseFromString(html, "text/html") as any;
  if (!doc) throw new Error("Lunar homepage: failed to parse HTML");

  const dates: string[] = [];
  for (const btn of doc.querySelectorAll("button.datafile.foc")) {
    const val = (btn as DomEl).getAttribute("data-val");
    if (val) dates.push(val);
  }
  if (dates.length === 0) throw new Error("No FOC dates found on Lunar homepage — site may have changed");
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
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error(`Lunar xlsx fetch failed for "${focDate}": ${resp.status}`);

  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  // deno-lint-ignore no-explicit-any
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  return rows.flatMap((r) => {
    const n = normalizeLunarRow(r, now);
    return n ? [n] : [];
  });
}

async function fetchAllLunar(parser: DOMParser, now: string): Promise<PullListRow[]> {
  const focDates = await getLunarFocDates(parser);
  console.log(`Lunar: ${focDates.length} FOC dates`, focDates);

  const all: PullListRow[] = [];
  for (const date of focDates) {
    const items = await fetchLunarForDate(date, now);
    console.log(`Lunar FOC ${date}: ${items.length} rows`);
    all.push(...items);
  }
  return all;
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

  const authors = card.querySelectorAll(".carousel-meta-author a")
    .map((a) => a.textContent?.trim())
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

async function fetchAllPRH(parser: DOMParser, now: string): Promise<PullListRow[]> {
  // Force stable sort on initial page load via query param (Random sort causes duplicate/missing items)
  const initialResp = await fetchWithTimeout(`${PRH_LIST_URL}?sort=title:asc`);
  if (!initialResp.ok) throw new Error(`PRH initial fetch failed: ${initialResp.status}`);
  const initialHtml = await initialResp.text();

  const { items: firstItems, cardCount: firstCount } = parseCardsFromHtml(initialHtml, parser, now);
  console.log(`PRH page 1: ${firstCount} cards, ${firstItems.length} normalized`);

  // Deduplicate by isbn across pages
  const allItems = new Map<string, PullListRow>();
  for (const item of firstItems) allItems.set(item.sku, item);

  // Discover AJAX pagination config from the load-more button
  // deno-lint-ignore no-explicit-any
  const doc0 = parser.parseFromString(initialHtml, "text/html") as any;
  const btn = doc0?.querySelector("#titlelist-load-more-button") as DomEl | null;

  if (!btn) {
    console.log("PRH: no load-more button — single page");
    return Array.from(allItems.values());
  }

  const nonce =
    btn.getAttribute("data-nonce") ??
    btn.getAttribute("data-security") ??
    extractJsVar(initialHtml, "prhNonce") ??
    extractJsVar(initialHtml, "titleListNonce") ??
    extractJsVar(initialHtml, "nonce");

  const ajaxUrl =
    btn.getAttribute("data-ajax-url") ??
    btn.getAttribute("data-url") ??
    extractJsVar(initialHtml, "prhAjaxUrl") ??
    extractJsVar(initialHtml, "ajaxurl") ??
    extractJsVar(initialHtml, "ajax_url") ??
    PRH_AJAX_FALLBACK;

  const action =
    btn.getAttribute("data-action") ??
    btn.getAttribute("data-type") ??
    "load_titlelist_items";

  console.log(`PRH: ajaxUrl=${ajaxUrl}, action=${action}, nonce=${nonce ? "found" : "missing"}`);

  if (!nonce) {
    // Fallback: try WordPress /page/N/ URL pattern
    console.log("PRH: no nonce, trying /page/N/ fallback");
    for (let page = 2; page <= MAX_PRH_PAGES; page++) {
      const resp = await fetchWithTimeout(`${PRH_LIST_URL}page/${page}/?sort=title:asc`).catch(() => null);
      if (!resp?.ok) break;
      const { items, cardCount } = parseCardsFromHtml(await resp.text(), parser, now);
      console.log(`PRH page ${page} (fallback): ${cardCount} cards`);
      if (cardCount === 0) break;
      for (const item of items) allItems.set(item.sku, item);
    }
    return Array.from(allItems.values());
  }

  // AJAX pagination
  for (let page = 2; page <= MAX_PRH_PAGES; page++) {
    const body = new URLSearchParams({
      action,
      page_number: String(page),
      paged: String(page),
      nonce,
      sort: "title:asc",
    });

    const resp = await fetchWithTimeout(ajaxUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }).catch(() => null);

    if (!resp?.ok) {
      console.log(`PRH AJAX page ${page}: failed (${resp?.status}), stopping`);
      break;
    }

    const { items, cardCount } = parseCardsFromHtml(await resp.text(), parser, now);
    console.log(`PRH AJAX page ${page}: ${cardCount} cards, ${items.length} normalized`);
    if (cardCount === 0) break;
    for (const item of items) allItems.set(item.sku, item);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!SYNC_SECRET || authHeader !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
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

  // Lunar — run independently so a PRH failure doesn't prevent Lunar data from saving
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

  // PRH — run independently
  try {
    const items = await fetchAllPRH(parser, now);
    prhRowsSeen = items.length;
    if (prhRowsSeen === 0) throw new Error("Zero rows returned — site may have changed");
    prhRowsUpserted = await upsertBatch(serviceClient, items);
    console.log(`PRH done: ${prhRowsUpserted}/${prhRowsSeen} upserted`);
  } catch (e) {
    prhError = e instanceof Error ? e.message : String(e);
    console.error("PRH error:", prhError);
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
      headers: { "Content-Type": "application/json" },
    }
  );
});
