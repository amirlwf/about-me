// chat-send — public chat endpoint for /callme/.
// Validates, rate-limits, stores the visitor message, notifies the admin
// instantly via the DEDICATED chat bot. History lives in chat_messages;
// delivery to an online visitor is Supabase Realtime, offline visitors
// sync missed messages from DB on return.
// Deploy: supabase functions deploy chat-send --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHAT_BOT_TOKEN, ADMIN_CHAT_ID
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-visitor-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISITOR = /^[0-9a-f]{8,32}$/;
const RATE_LIMIT = 30; // messages per hour per IP

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

  const visitorId = String(body.visitor_id ?? "").trim().toLowerCase();
  const text = String(body.text ?? "").trim();
  if (!VISITOR.test(visitorId)) return new Response(JSON.stringify({ error: "invalid visitor" }), { status: 400, headers: cors });
  if (text.length < 1 || text.length > 2000) return new Response(JSON.stringify({ error: "invalid text" }), { status: 400, headers: cors });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // edge rate-limit: <=30 messages/hour per IP (chat is bursty, unlike orders)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supa
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("source_ip", ip)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= RATE_LIMIT) {
    return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: cors });
  }

  const { data, error } = await supa
    .from("chat_messages")
    .insert({ visitor_id: visitorId, sender: "visitor", text: text.slice(0, 2000), source_ip: ip })
    .select("id,created_at")
    .single();
  if (error || !data) {
    return new Response(JSON.stringify({ error: "db insert failed" }), { status: 500, headers: cors });
  }

  // instant notify to admin via dedicated chat bot (mock-safe when secrets absent).
  // Owner replies to THIS message -> chat-webhook stores it as the owner reply.
  const tgToken = Deno.env.get("CHAT_BOT_TOKEN") || "";
  const chatId = Deno.env.get("ADMIN_CHAT_ID") || "";
  const msg =
    `💬 <b>پیام چت #chat-${visitorId}</b>\n` +
    `${esc(text.slice(0, 800))}`;
  let tgSent = false;
  if (tgToken && chatId) {
    tgSent = await sendTelegram(tgToken, chatId, msg);
  }
  await supa.from("notifications").insert({
    order_id: null,
    channel: "telegram",
    payload: { via: "chat", visitor_id: visitorId, sent: tgSent, mock: !(tgToken && chatId) },
  });

  return new Response(JSON.stringify({ ok: true, id: data.id, at: data.created_at }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
