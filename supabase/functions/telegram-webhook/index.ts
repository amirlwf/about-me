// telegram-webhook — receives Telegram Bot API updates.
// - /services  -> replies with the live service catalog from site_content
// - admin reply to an order message containing "#order-<id>" -> stored as
//   admin_reply on that order (+ notification row, visible in admin panel)
// Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<FUNC_URL>
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

async function tg(token: string, method: string, payload: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return new Response("telegram-webhook ok");
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!token) return new Response("bot not configured", { status: 200 });

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad update", { status: 200 });
  }

  const msg = update.message;
  if (!msg || !msg.text) return new Response("ok", { status: 200 });
  const chatId = msg.chat.id;
  const text: string = msg.text.trim();

  // --- /services: live catalog ---
  if (text === "/services" || text.startsWith("/services@")) {
    const { data } = await supa.from("site_content").select("value").eq("key", "services").single();
    const svc = (data?.value ?? {}) as Record<string, any>;
    const lines = Object.values(svc).map(
      (s: any) => `• <b>${s.title}</b> — ${s.tagline ?? ""}\n  ${(s.subservices ?? []).join("، ")}`,
    );
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: lines.length ? `📋 خدمات فعلی:\n\n${lines.join("\n\n")}` : "کاتالوگ خالی است.",
      parse_mode: "HTML",
    });
    return new Response("ok", { status: 200 });
  }

  // --- admin reply to an order message: "… #order-12 …" ---
  const replyText: string = msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "";
  const m = replyText.match(/#order-(\d+)/);
  if (m) {
    const orderId = Number(m[1]);
    const { error } = await supa.from("orders").update({ admin_reply: text }).eq("id", orderId);
    if (!error) {
      await supa.from("notifications").insert({
        order_id: orderId,
        channel: "site",
        payload: { via: "telegram_reply", text: text.slice(0, 500) },
      });
      await tg(token, "sendMessage", { chat_id: chatId, text: `✅ پاسخ برای سفارش #order-${orderId} ذخیره شد.` });
    } else {
      await tg(token, "sendMessage", { chat_id: chatId, text: `❌ سفارش ${orderId} پیدا نشد.` });
    }
    return new Response("ok", { status: 200 });
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "دستورات: /services — نمایش خدمات\nبرای پاسخ به سفارش، روی پیام آن Reply بزنید.",
  });
  return new Response("ok", { status: 200 });
});
