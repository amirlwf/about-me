-- ============================================================
-- amirlwf.ir — seed data (run AFTER schema.sql)
-- Contact values are placeholders: edit them in /admin/ later.
-- ============================================================

insert into public.site_content (key, value) values
('business', '{
  "name": "امیر | خدمات کامپیوتر، طراحی سایت و ادیت ویدیو",
  "owner": "امیر",
  "city": "هشتگرد",
  "area_served": ["هشتگرد", "نظرآباد", "ساوجبلاغ", "کرج", "تهران"],
  "hours": "شنبه تا پنجشنبه، ۹ صبح تا ۹ شب",
  "phone": "09000000000",
  "telegram": "CHANGE_ME",
  "whatsapp": "9000000000",
  "rubika": "CHANGE_ME",
  "channels_enabled": {"phone": true, "telegram": true, "whatsapp": true, "rubika": true}
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
}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ============================================================
-- Grant the admin flag to your login user (run AFTER creating the
-- user in Dashboard > Authentication > Users, or via sign-up):
-- ============================================================
-- update auth.users
-- set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';
