// create-order — public order endpoint with server-side validation,
// honeypot check, edge rate-limit (<=3 orders/hour per IP), Telegram notify.
// Deploy: supabase functions deploy create-order --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN (opt), ADMIN_CHAT_ID (opt)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IR_MOBILE = /^09\d{9}$/;
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
  const phone = String(body.phone ?? "").trim().replace(/[\s-]/g, "");
  const service = String(body.service ?? "").trim();
  const sub = String(body.sub_service ?? "").trim().slice(0, 120);
  const desc = String(body.description ?? "").trim();
  const trackToken = String(body.track_token ?? "").trim();

  if (!IR_MOBILE.test(phone)) return new Response(JSON.stringify({ error: "invalid phone" }), { status: 400, headers: cors });
  if (!SERVICES.includes(service)) return new Response(JSON.stringify({ error: "invalid service" }), { status: 400, headers: cors });
  if (name.length < 2 || name.length > 80) return new Response(JSON.stringify({ error: "invalid name" }), { status: 400, headers: cors });
  if (desc.length < 5 || desc.length > 2000) return new Response(JSON.stringify({ error: "invalid description" }), { status: 400, headers: cors });
  if (!/^[0-9a-f-]{36}$/i.test(trackToken)) return new Response(JSON.stringify({ error: "invalid token" }), { status: 400, headers: cors });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // edge rate-limit: <=3 orders/hour per IP
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supa
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("source_ip", ip)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= RATE_LIMIT) {
    return new Response(JSON.stringify({ error: "rate limited: max 3 orders/hour" }), { status: 429, headers: cors });
  }

  const { data, error } = await supa
    .from("orders")
    .insert({ name, phone, service, sub_service: sub, description: desc, track_token: trackToken, source_ip: ip, status: "new" })
    .select("id")
    .single();
  if (error || !data) {
    return new Response(JSON.stringify({ error: "db insert failed" }), { status: 500, headers: cors });
  }

  // Telegram notify (mock-safe: skipped when secrets absent)
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const chatId = Deno.env.get("ADMIN_CHAT_ID") || "";
  const msg =
    `🧾 <b>سفارش جدید #order-${data.id}</b>\n` +
    `خدمت: ${esc(service)} / ${esc(sub)}\n` +
    `نام: ${esc(name)}\nتلفن: <code>${esc(phone)}</code>\n` +
    `شرح: ${esc(desc.slice(0, 500))}`;
  let tgSent = false;
  if (tgToken && chatId) {
    tgSent = await sendTelegram(tgToken, chatId, msg);
  }
  await supa.from("notifications").insert({
    order_id: data.id,
    channel: "telegram",
    payload: { sent: tgSent, mock: !(tgToken && chatId) },
  });

  return new Response(JSON.stringify({ id: data.id, track_token: trackToken }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
