// bot-test — sends a test message through one of the three configured bots
// (chat | orders_fa | orders_en) so the admin panel can verify credentials.
//
// Credentials live in the public.bot_config table (admin-only RLS) and are
// read here with service_role; env secrets stay as a fallback.
// Auth: deploy WITH --verify-jwt (default). The admin panel calls it with the
// logged-in admin session, and only role=admin (or service_role) is accepted.
// Deploy: supabase functions deploy bot-test --verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BotId = "chat" | "orders_fa" | "orders_en";
const IDS: BotId[] = ["chat", "orders_fa", "orders_en"];

const ENV_FALLBACK: Record<BotId, [string, string]> = {
  chat: ["CHAT_BOT_TOKEN", "ADMIN_CHAT_ID"],
  orders_fa: ["FA_BOT_TOKEN", "FA_CHAT_ID"],
  orders_en: ["EN_BOT_TOKEN", "EN_CHAT_ID"],
};

function jwtPayload(req: Request): Record<string, any> | null {
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    const body = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body));
  } catch {
    return null;
  }
}

function isAdmin(req: Request): boolean {
  const p = jwtPayload(req);
  if (!p) return false;
  if (p.role === "service_role") return true;
  const md = p.user_metadata || {};
  const am = p.app_metadata || {};
  return md.role === "admin" || am.role === "admin";
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; status: number; detail: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    let detail = "";
    try {
      const j = await r.json();
      if (j && j.description) detail = String(j.description);
    } catch { /* non-json body */ }
    return { ok: r.ok, status: r.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: cors });
  }
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "admin only" }), { status: 403, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const id = String(body.id ?? "") as BotId;
  if (!IDS.includes(id)) {
    return new Response(JSON.stringify({ error: "unknown bot id" }), { status: 400, headers: cors });
  }

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let token = "";
  let chatId = "";
  let via: "db" | "env" = "env";
  let enabled = false;
  try {
    const { data } = await supa
      .from("bot_config")
      .select("bot_token, chat_id, enabled")
      .eq("id", id)
      .maybeSingle();
    if (data && data.bot_token && data.chat_id) {
      token = data.bot_token;
      chatId = data.chat_id;
      enabled = !!data.enabled;
      via = "db";
    }
  } catch { /* table missing -> fall back to env */ }

  if (!token || !chatId) {
    const [tKey, cKey] = ENV_FALLBACK[id];
    token = Deno.env.get(tKey) || (id === "orders_fa" ? Deno.env.get("TELEGRAM_BOT_TOKEN") || "" : "");
    chatId = Deno.env.get(cKey) || (id === "orders_fa" ? Deno.env.get("ADMIN_CHAT_ID") || "" : "");
    via = "env";
  }

  // say precisely what is missing instead of a generic "not configured"
  if (!token || !chatId) {
    const missing = !token && !chatId ? "توکن و chat_id"
      : !token ? "توکن بات (Bot Token)" : "chat_id";
    return new Response(
      JSON.stringify({
        ok: false,
        configured: false,
        fields: { token: !!token, chat_id: !!chatId },
        enabled,
        error: `${missing} ثبت نشده است — در همین کارت پر و ذخیره کنید.`,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const label = id === "chat" ? "گفت‌وگوی زنده" : id === "orders_fa" ? "مشتری فارسی" : "مشتری انگلیسی";
  const text =
    `✅ <b>پیام آزمایشی بات</b>\n` +
    `کاربرد: ${label}\n` +
    `منبع: ${via === "db" ? "دیتابیس (پنل ادمین)" : "secrets پروژه"}\n` +
    `زمان: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const res = await sendTelegram(token, chatId, text);

  // enabled=false is the silent killer: the test still sends, but the real
  // order/chat notifications are skipped — say so in plain Persian.
  const disabledNote = enabled
    ? null
    : "ذخیره شده ولی غیرفعال است — نوتیف‌های واقعی ارسال نمی‌شوند؛ کلید «فعال» را بزنید و ذخیره کنید.";

  return new Response(
    JSON.stringify({
      ok: res.ok,
      configured: true,
      via,
      enabled,
      fields: { token: true, chat_id: true },
      telegram: res.detail || null,
      error: res.ok ? disabledNote
        : `تلگرام رد کرد (${res.status}): ${res.detail || "بدون توضیح"} — معمولاً توکن ناقص یا chat_id اشتباه است.`,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
