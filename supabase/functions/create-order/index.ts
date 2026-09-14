// create-order — public order/lead endpoint with server-side validation,
// honeypot check, edge rate-limit (<=3 orders/hour per IP), Telegram notify.
//
// Two modes share this endpoint:
// - FA order (source=fa_site, default): Iranian mobile + service required.
// - EN free-edit lead (source=en_landing or type=free_edit): name + email,
//   no phone; service forced to edit/free_edit; distinct Telegram format.
// Deploy: supabase functions deploy create-order --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   FA_BOT_TOKEN + FA_CHAT_ID (Persian orders, original bot — untouched behavior),
//   EN_BOT_TOKEN + EN_CHAT_ID (English free-edit leads, new bot).
// Legacy TELEGRAM_BOT_TOKEN / ADMIN_CHAT_ID still work as fallback for FA,
// so old setups keep notifying until the FA_* secrets are set.
// IMPORTANT: run supabase/migration_en_leads.sql BEFORE deploying this version.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IR_MOBILE = /^09\d{9}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SERVICES = ["edit", "web", "pc"];
const RATE_LIMIT = 3; // orders per hour per IP

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }

  // honeypot: bots fill it, humans never see it
  if (body.website) return new Response(JSON.stringify({ error: "spam" }), { status: 400, headers: cors });

  const name = String(body.name ?? "").trim();
  const trackToken = String(body.track_token ?? "").trim();
  const source = String(body.source ?? "fa_site").trim() || "fa_site";
  const type = String(body.type ?? "").trim();
  const isEN = source === "en_landing" || type === "free_edit";

  if (name.length < 2 || name.length > 80) return bad("invalid name");
  if (!/^[0-9a-f-]{36}$/i.test(trackToken)) return bad("invalid token");

  // per-mode fields + validation
  const phone = String(body.phone ?? "").trim().replace(/[\s-]/g, "");
  const service = String(body.service ?? "").trim();
  const sub = String(body.sub_service ?? "").trim().slice(0, 120);
  const desc = String(body.description ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const rawLink = String(body.raw_link ?? (body as Record<string, unknown>).rawLink ?? "").trim().slice(0, 500);

  if (isEN) {
    if (!EMAIL.test(email) || email.length > 160) return bad("invalid email");
    if (service !== "edit") return bad("invalid service");
    if (sub !== "" && sub !== "free_edit") return bad("invalid sub_service");
    if (desc.length < 5 || desc.length > 2000) return bad("invalid description");
    if (rawLink && !/^https?:\/\/\S+\.\S+/.test(rawLink)) return bad("invalid link");
  } else {
    if (!IR_MOBILE.test(phone)) return bad("invalid phone");
    if (!SERVICES.includes(service)) return bad("invalid service");
    if (desc.length < 5 || desc.length > 2000) return bad("invalid description");
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // edge rate-limit: <=3 orders/hour per IP (both modes share the bucket)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supa
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("source_ip", ip)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= RATE_LIMIT) {
    return new Response(JSON.stringify({ error: "rate limited: max 3 orders/hour" }), { status: 429, headers: cors });
  }

  const row = isEN
    ? { name, phone: null, email, service: "edit", sub_service: "free_edit", description: desc,
        raw_link: rawLink || null, track_token: trackToken, source_ip: ip, source: "en_landing", status: "new" }
    : { name, phone, service, sub_service: sub, description: desc, track_token: trackToken, source_ip: ip, status: "new" };

  const { data, error } = await supa
    .from("orders")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return new Response(JSON.stringify({ error: "db insert failed" }), { status: 500, headers: cors });
  }

  // Telegram notify (mock-safe: skipped when secrets absent).
  // FA orders -> FA bot; EN leads -> EN bot. Fully separate.
  const faToken = Deno.env.get("FA_BOT_TOKEN") || Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const faChat = Deno.env.get("FA_CHAT_ID") || Deno.env.get("ADMIN_CHAT_ID") || "";
  const enToken = Deno.env.get("EN_BOT_TOKEN") || "";
  const enChat = Deno.env.get("EN_CHAT_ID") || "";
  const msg = isEN
    ? `🎬 <b>[EN-FREE] New lead #order-${data.id}</b>\n` +
      `Name: ${esc(name)}\nEmail: <code>${esc(email)}</code>\n` +
      (rawLink ? `Footage: ${esc(rawLink)}\n` : "") +
      `Notes: ${esc(desc.slice(0, 500))}`
    : `🧾 <b>سفارش جدید #order-${data.id}</b>\n` +
      `خدمت: ${esc(service)} / ${esc(sub)}\n` +
      `نام: ${esc(name)}\nتلفن: <code>${esc(phone)}</code>\n` +
      `شرح: ${esc(desc.slice(0, 500))}`;
  let tgSent = false;
  if (isEN) {
    if (enToken && enChat) tgSent = await sendTelegram(enToken, enChat, msg);
  } else if (faToken && faChat) {
    tgSent = await sendTelegram(faToken, faChat, msg);
  }
  await supa.from("notifications").insert({
    order_id: data.id,
    channel: "telegram",
    payload: { sent: tgSent, mock: !((isEN ? (enToken && enChat) : (faToken && faChat))), source: isEN ? "en_landing" : "fa_site" },
  });

  return new Response(JSON.stringify({ id: data.id, track_token: trackToken }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
