-- ============================================================
-- amirlwf.ir — seed data (run AFTER schema.sql)
-- Contact values are placeholders: edit them in /admin/ later.
-- Keys: business, services, en_home, fa_home
-- ============================================================

insert into public.site_content (key, value) values
('business', '{
  "name": "Amir Reza Lotfi | Short-Form Video Editor",
  "owner": "Amir Reza Lotfi",
  "city": "Hashtgerd",
  "area_served": ["Worldwide (remote)", "Hashtgerd", "Karaj", "Tehran"],
  "hours": "Sat–Thu, 9:00–21:00",
  "phone": "09000000000",
  "email": "CHANGE_ME",
  "telegram": "CHANGE_ME",
  "whatsapp": "9000000000",
  "rubika": "CHANGE_ME",
  "linkedin": "CHANGE_ME",
  "youtube": "CHANGE_ME",
  "channels_enabled": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": false, "linkedin": false, "youtube": false}
}'::jsonb),
('services', '{
  "edit": {"title": "ادیت ویدیو", "tagline": "تدوین حرفه‌ای ویدیو برای یوتیوب، اینستاگرام و تبلیغات",
    "price_note": "قیمت توافقی بر اساس حجم پروژه؛ برای برآورد دقیق سفارش ثبت کنید.",
    "subservices": ["تدوین ویدیوی یوتیوب", "ادیت ریلز و استوری اینستاگرام", "تیزر تبلیغاتی", "زیرنویس و کپشن فارسی", "اصلاح رنگ و نور"]},
  "web": {"title": "طراحی سایت", "tagline": "طراحی سایت سریع، سئو‌محور و مقرون‌به‌صرفه",
    "price_note": "سایت معرفی از قیمت پایه توافقی؛ فروشگاه اینترنتی و امکانات خاص جداگانه برآورد می‌شود.",
    "subservices": ["سایت شرکتی و معرفی", "فروشگاه اینترنتی", "لندینگ‌پیج تبلیغاتی", "سئوی پایه و افزایش سرعت", "پشتیبانی و نگهداری"]},
  "pc": {"title": "خدمات کامپیوتری", "tagline": "نصب ویندوز، پرینتر و افزایش سرعت در محل",
    "price_note": "هزینه خدمات حضوری در هشتگرد و حومه ثابت؛ ایاب‌وذهاب برای خارج از محدوده توافقی است.",
    "subservices": ["نصب ویندوز", "نصب پرینتر", "عیب‌یابی پرینتر", "افزایش سرعت سیستم", "بکاپ و بازیابی اطلاعات"]}
}'::jsonb),
('en_home', '{
  "hero_eyebrow": "Short-form editing for creators",
  "hero_title": "I Edit Scroll-Stopping Shorts",
  "hero_lead": "Reels, TikToks and Shorts cut for retention — strong hooks, punchy captions, clean sound. Try me free before you pay a cent.",
  "hero_cta_primary": "Get 1 Free Edit",
  "hero_cta_secondary": "See Samples",
  "hero_micro": "First reel FREE · 48-hour delivery · No commitment",
  "work_title": "Recent Work",
  "work_sub": "Real cuts, real retention — tap any piece to watch the style.",
  "offer_title": "Your First Reel Is FREE",
  "offer_sub": "One full edit, on the house — so you can judge my work on your own footage, not promises.",
  "offer_points": ["One short edited end-to-end, free", "Delivered within 48 hours", "No commitment — keep it either way", "Limited free spots each week"],
  "offer_cta": "Claim My Free Edit",
  "services_title": "What I Do",
  "services_sub": "Short-form first. Every cut is built for watch time and replays.",
  "services": [
    {"icon": "🎬", "title": "Shorts / Reels / TikTok Editing", "text": "Cuts, zooms, b-roll and sound design paced for retention on every platform."},
    {"icon": "⚡", "title": "Hooks, Captions & Pacing", "text": "Opening hooks that stop the scroll and animated captions timed to the beat."},
    {"icon": "🎨", "title": "Color, Sound & Cleanup", "text": "Balanced grade, leveled dialogue, filler-word removal and clean exports."}
  ],
  "steps_title": "How It Works",
  "steps_sub": "Three steps, no calls required.",
  "steps": [
    {"title": "Send your raw clip", "text": "Drop a link to your footage plus a short note about the style you want."},
    {"title": "Get your free edit in 48h", "text": "I cut, caption and polish one short and send it back within two days."},
    {"title": "Scale if you love it", "text": "Like the result? We set up a simple per-video flow for the rest of your content."}
  ],
  "faq_title": "Questions, Answered",
  "faq_sub": "Short answers, no fine print.",
  "faq": [
    {"q": "What do I get for free?", "a": "One short-form video edited from your raw clip — hooks, captions, pacing, color and sound — delivered in 48 hours."},
    {"q": "Is there really no commitment?", "a": "None. The free edit is yours to keep whatever you decide. If you love it, we talk about ongoing work."},
    {"q": "What should I send?", "a": "A link to your raw footage (Drive, Dropbox or unlisted YouTube) and a short note about your style or a reference you like."}
  ],
  "form_title": "Get Your Free Edit",
  "form_sub": "Fill this in — I review every request personally and reply soon."
}'::jsonb),
('fa_home', '{
  "hero_title": "خدمات کامپیوتر، طراحی سایت و ادیت ویدیو در هشتگرد",
  "hero_lead": "نصب ویندوز و پرینتر در محل، طراحی سایت سریع و مقرون‌به‌صرفه، و تدوین حرفه‌ای ویدیو — با ثبت سفارش آنلاین و پیگیری لحظه‌ای وضعیت کار.",
  "hero_cta_primary": "ثبت سفارش",
  "hero_cta_secondary": "گفت‌وگوی زنده"
}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ============================================================
-- Grant the admin flag to your login user (run AFTER creating the
-- user in Dashboard > Authentication > Users, or via sign-up):
-- ============================================================
-- update auth.users
-- set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';
