// chat-webhook — receives updates for the DEDICATED chat bot.
// - owner Reply to a "… #chat-<visitor> …" message -> stored as the owner
//   message in chat_messages (+ notification row); the visitor gets it
//   instantly via Realtime, or on return if offline.
// - anything else -> short help text.
// Set webhook: https://api.telegram.org/bot<CHAT_BOT_TOKEN>/setWebhook?url=<FUNC_URL>
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CHAT_BOT_TOKEN
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
  if (req.method === "GET") return new Response("chat-webhook ok");
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const token = Deno.env.get("CHAT_BOT_TOKEN") || "";
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
  if (text.length < 1 || text.length > 2000) return new Response("ok", { status: 200 });

  // --- owner reply to a chat message: "… #chat-<visitor> …" ---
  const replyText: string = msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "";
  const m = replyText.match(/#chat-([0-9a-f]{8,32})/i);
  if (m) {
    const visitorId = m[1].toLowerCase();
    const { error } = await supa.from("chat_messages").insert({
      visitor_id: visitorId,
      sender: "owner",
      text: text.slice(0, 2000),
    });
    if (!error) {
      await supa.from("notifications").insert({
        order_id: null,
        channel: "site",
        payload: { via: "chat_reply", visitor_id: visitorId, text: text.slice(0, 500) },
      });
      await tg(token, "sendMessage", { chat_id: chatId, text: `✅ پاسخ چت برای #chat-${visitorId} ذخیره شد.` });
    } else {
      await tg(token, "sendMessage", { chat_id: chatId, text: `❌ خطا در ذخیره پاسخ چت.` });
    }
    return new Response("ok", { status: 200 });
  }

  await tg(token, "sendMessage", {
    chat_id: chatId,
    text: "برای پاسخ به پیام چت، روی پیام آن Reply بزنید.",
  });
  return new Response("ok", { status: 200 });
});
