-- ============================================================

-- amirlwf.ir — seed data (run AFTER schema.sql)

-- Contact values are placeholders: edit them in /admin/ later.

-- Keys: business, services, en_home, fa_home, fa_edit, fa_web, fa_pc

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

  "channels_enabled": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": false, "linkedin": false, "youtube": false},

  "page_channels": {

    "en": {"phone": false, "email": true, "telegram": true, "whatsapp": true, "rubika": false, "linkedin": true, "youtube": true},

    "fa": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": true, "linkedin": false, "youtube": false},

    "fa_edit": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": true, "linkedin": false, "youtube": false},

    "fa_web": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": true, "linkedin": false, "youtube": false},

    "fa_pc": {"phone": true, "email": false, "telegram": true, "whatsapp": true, "rubika": true, "linkedin": false, "youtube": false}

  }

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

  "brand_name": "Amir Reza Lotfi",

  "footer_tagline": "Short-form video editor.",

  "seo_title": "Amir Reza Lotfi | Short-Form Video Editor — Get 1 Free Edit",

  "seo_description": "Amir Reza Lotfi — short-form video editor for Reels, TikTok and Shorts. Get your first reel edited FREE in 48 hours, no commitment.",

  "hero_eyebrow": "Short-form editing for creators",

  "hero_title": "I Edit Scroll-Stopping Shorts",

  "hero_lead": "I'm Amir Reza Lotfi. Reels, TikToks and Shorts cut for retention — strong hooks, punchy captions, clean sound. Try me free before you pay a cent.",

  "hero_cta_primary": "Get 1 Free Edit",

  "hero_cta_secondary": "See Samples",

  "hero_micro": "First reel FREE · 48-hour delivery · No commitment",

  "splash_kicker": "SHOWREEL · 2026",

  "splash_title": "",

  "splash_sub": "Short-Form Video Editor",

  "splash_cta": "Enter",

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

  "seo_title": "امیررضا لطفی | خدمات کامپیوتر و طراحی سایت در هشتگرد",

  "seo_description": "امیررضا لطفی (امیر): ادیت ویدیو، طراحی سایت ارزان و نصب ویندوز و پرینتر در محل در هشتگرد و حومه. ثبت سفارش آنلاین با پیگیری زنده.",

  "hero_title": "امیررضا لطفی — خدمات کامپیوتر، طراحی سایت و ادیت ویدیو در هشتگرد",

  "hero_lead": "نصب ویندوز و پرینتر در محل، طراحی سایت سریع و مقرون‌به‌صرفه، و تدوین حرفه‌ای ویدیو — با ثبت سفارش آنلاین و پیگیری لحظه‌ای وضعیت کار.",

  "hero_cta_primary": "ثبت سفارش",

  "hero_cta_secondary": "گفت‌وگوی زنده",

  "card_edit_title": "ادیت ویدیو",

  "card_edit_text": "تدوین حرفه‌ای ویدیو برای یوتیوب، اینستاگرام و تبلیغات؛ زیرنویس فارسی، اصلاح رنگ و ریتم مناسب هر پلتفرم.",

  "card_web_title": "طراحی سایت",

  "card_web_text": "سایت شرکتی، فروشگاهی و لندینگ‌پیج؛ سریع، سئومحور و واکنش‌گرا، با پشتیبانی بعد از تحویل.",

  "card_pc_title": "خدمات کامپیوتری",

  "card_pc_text": "نصب ویندوز، نصب و عیب‌یابی پرینتر، افزایش سرعت سیستم و بکاپ اطلاعات — در محل شما در هشتگرد و حومه.",

  "faq_title": "سوالات پرتکرار",

  "faq": [
    {"q": "امیررضا لطفی کیست؟", "a": "امیررضا لطفی (با نام کوتاه امیر) متخصص خدمات کامپیوتر در هشتگرد است: نصب ویندوز و پرینتر در محل، طراحی سایت ارزان و سئومحور، و تدوین حرفه‌ای ویدیو برای یوتیوب، ریلز اینستاگرام و تبلیغات — با ثبت سفارش آنلاین و پیگیری زنده."},

    {"q": "چطور سفارش ثبت کنم؟", "a": "فرم ثبت سفارش همین صفحه را با نام و شماره موبایل پر کنید؛ وضعیت سفارش را به‌صورت زنده همین‌جا دنبال می‌کنید."},

    {"q": "چرا شماره موبایل لازم است؟", "a": "شماره موبایل کلید پیگیری سفارش شماست و اطلاع‌رسانی وضعیت کار از طریق آن انجام می‌شود. بدون شماره معتبر امکان ثبت سفارش نیست."},

    {"q": "در چه مناطقی خدمات حضوری دارید؟", "a": "هشتگرد، نظرآباد و ساوجبلاغ. خدمات آنلاین مثل طراحی سایت و ادیت ویدیو بدون محدودیت مکانی انجام می‌شود."},

    {"q": "ساعات کاری چیست؟", "a": "شنبه تا پنجشنبه، ۹ صبح تا ۹ شب."}

  ],

  "form_title": "ثبت سفارش"

}'::jsonb),

('fa_edit', '{

  "seo_title": "ادیت ویدیو حرفه‌ای | تدوین یوتیوب و ریلز | امیررضا لطفی",

  "seo_description": "تدوین حرفه‌ای ویدیو توسط امیررضا لطفی؛ یوتیوب، ریلز اینستاگرام و تیزر تبلیغاتی با زیرنویس فارسی و اصلاح رنگ. سفارش آنلاین با تحویل منظم.",

  "hero_title": "ادیت ویدیو حرفه‌ای",

  "intro_title": "ادیت یعنی نگه داشتن مخاطب",

  "intro_text": "فرق ویدیویی که تا آخر دیده می‌شود با ویدیویی که بعد از سه ثانیه بسته می‌شود، معمولاً تصویربرداری نیست؛ تدوین است. ریتم کات‌ها، حذف مکث‌های اضافه، زیرنویس خوانا، موسیقی‌ای که حواس را پرت نکند و اصلاح رنگی که حس حرفه‌ای بدهد — این‌ها چیزی است که من روی هر پروژه اعمال می‌کنم.",

  "price_title": "راهنمای هزینه",

  "price_note2": "قاعده سرانگشتی: ریلز کوتاه زیر یک دقیقه ارزان‌ترین است؛ ویدیوی یوتیوب بر اساس دقیقه نهایی و حجم فایل خام محاسبه می‌شود؛ تیزر تبلیغاتی با سناریو و موشن‌گرافی ساده رده میانی است. زیرنویس فارسی و اصلاح رنگ روی همه پروژه‌ها استاندارد و رایگان است. برای برآورد دقیق، در فرم سفارش بنویسید ویدیو چند دقیقه است و برای کجاست — جواب سریع می‌گیرید.",

  "subsvc_title": "زیرخدمت‌ها",

  "subservices": [

    {"title": "📺 تدوین ویدیوی یوتیوب", "text": "کات تمیز، حذف سکوت‌ها، زیرنویس، افکت‌های صوتی و تصویری به‌جا و کاور هماهنگ؛ با ساختاری که نرخ نگه‌داشت مخاطب را بالا می‌برد."},

    {"title": "📱 ادیت ریلز و استوری اینستاگرام", "text": "ابعاد عمودی، کپشن‌های بزرگ و خوانا، ترندهای صوتی و کات‌های سریع مخصوص اکسپلور؛ مناسب پیج‌های فروشگاهی و شخصی."},

    {"title": "✨ تیزر تبلیغاتی", "text": "معرفی کوتاه و اثرگذار محصول یا خدمات شما برای اینستاگرام و سایت؛ با سناریوی ساده، موشن‌متن و دعوت به اقدام شفاف."},

    {"title": "💬 زیرنویس و کپشن فارسی", "text": "زیرنویس دقیق و هماهنگ با گفتار برای ویدیوهای آماده شما؛ با فونت و استایل مناسب هر پلتفرم. بیشتر بازدید اینستاگرام بی‌صداست — زیرنویس یعنی دیده شدن."},

    {"title": "🎨 اصلاح رنگ و نور", "text": "یکدست‌سازی رنگ چند نما، اصلاح نور کم و حال‌وهوای سینمایی برای ویدیوهای آماده؛ بدون نیاز به تدوین مجدد."}

  ],

  "cta_0": "سفارش تدوین",

  "cta_1": "سفارش ریلز",

  "cta_2": "سفارش تیزر",

  "cta_3": "سفارش زیرنویس",

  "cta_4": "سفارش اصلاح رنگ",

  "faq_title": "سوالات پرتکرار",

  "faq": [

    {"q": "فایل خام را چطور ارسال کنم؟", "a": "لینک گوگل‌درایو، تلگرام یا هر فضای ابری دیگری کافی است؛ حجم بالا هم مشکلی نیست."},

    {"q": "چند دور اصلاحیه دارم؟", "a": "دو دور اصلاحیه جزئی روی هر پروژه لحاظ است تا خروجی دقیقاً همان شود که می‌خواهید."},

    {"q": "زمان تحویل ویدیو چقدر است؟", "a": "ریلز کوتاه ۲ تا ۴ روز، ویدیوی یوتیوب متوسط حدود یک هفته؛ پروژه فوری را موقع سفارش بگویید تا سریع‌تر هماهنگ کنیم."},

    {"q": "موسیقی ویدیو از کجاست؟", "a": "از آرشیو موسیقی بدون کپی‌رایت استفاده می‌کنم تا ویدیوی یوتیوب شما دچار مشکل نشود."}

  ],

  "more_title": "سایر خدمات",

  "form_title": "ثبت سفارش ادیت ویدیو"

}'::jsonb),

('fa_web', '{

  "seo_title": "طراحی سایت ارزان و سئومحور | امیررضا لطفی",

  "seo_description": "طراحی سایت شرکتی، فروشگاهی و لندینگ‌پیج توسط امیررضا لطفی؛ سریع، واکنش‌گرا و سئومحور با پشتیبانی بعد از تحویل. مشاوره و برآورد رایگان.",

  "hero_title": "طراحی سایت ارزان و سئومحور",

  "intro_title": "چرا سایت از من؟",

  "price_title": "راهنمای هزینه",

  "price_note2": "قاعده سرانگشتی: لندینگ‌پیج تک‌صفحه‌ای برای کمپین تبلیغاتی ارزان‌ترین گزینه است؛ سایت معرفی چندصفحه‌ای با بخش خدمات، نمونه‌کار و تماس در رده میانی؛ فروشگاه اینترنتی با درگاه پرداخت و پنل مدیریت بالاترین رده است. سئوی پایه (متاتگ‌ها، نقشه سایت، سرعت) روی همه پلن‌ها رایگان است. برای برآورد دقیق، فرم سفارش را با توضیح کسب‌وکارتان پر کنید — مشاوره و برآورد رایگان است.",

  "subsvc_title": "زیرخدمت‌ها",

  "subservices": [

    {"title": "🏢 سایت شرکتی و معرفی", "text": "معرفی کسب‌وکار، خدمات، نمونه‌کارها و راه‌های تماس؛ چندصفحه‌ای، فارسی و راست‌چین، با فرم تماس و دکمه‌های شبکه‌های اجتماعی."},

    {"title": "🛒 فروشگاه اینترنتی", "text": "کاتالوگ محصولات، سبد خرید، درگاه پرداخت آنلاین و پنل مدیریت سفارش‌ها؛ با آموزش کامل کار با فروشگاه بعد از تحویل."},

    {"title": "🎯 لندینگ‌پیج تبلیغاتی", "text": "صفحه فرود تک‌صفحه‌ای برای کمپین اینستاگرام یا گوگل‌ادز؛ متمرکز بر یک هدف (تماس، ثبت‌نام، خرید) و بهینه برای موبایل."},

    {"title": "📈 سئوی پایه و افزایش سرعت", "text": "برای سایتی که از قبل دارید: اصلاح متاتگ‌ها، ساختار هدینگ، فشرده‌سازی تصاویر، نقشه سایت و داده ساخت‌یافته — همان چیزهایی که رتبه گوگل را بالا می‌برد."},

    {"title": "🛠️ پشتیبانی و نگهداری", "text": "به‌روزرسانی، بکاپ منظم، رفع ایراد و تغییرات کوچک محتوایی به‌صورت ماهانه؛ تا سایت همیشه سالم و به‌روز بماند."}

  ],

  "cta_0": "سفارش سایت معرفی",

  "cta_1": "سفارش فروشگاه",

  "cta_2": "سفارش لندینگ",

  "cta_3": "سفارش سئو",

  "cta_4": "سفارش پشتیبانی",

  "faq_title": "سوالات پرتکرار",

  "faq": [

    {"q": "سایت با چه ابزاری ساخته می‌شود؟", "a": "بسته به نیاز شما: سایت سبک و سریع با کدنویسی مستقیم (مثل همین سایت)، یا وردپرس برای مدیریت آسان محتوا توسط خودتان. موقع سفارش راهنمایی‌تان می‌کنم کدام بهتر است."},

    {"q": "دامنه و هاست با کیست؟", "a": "دامنه و هاست به نام خودتان خریده می‌شود تا مالکیت کامل داشته باشید؛ من در انتخاب و اتصال آن کمک می‌کنم."},

    {"q": "زمان تحویل چقدر است؟", "a": "لندینگ‌پیج حدود یک هفته، سایت معرفی دو تا سه هفته، و فروشگاه اینترنتی بسته به امکانات سه تا شش هفته."},

    {"q": "پشتیبانی بعد از تحویل دارید؟", "a": "بله؛ رفع ایرادهای احتمالی و آموزش مدیریت سایت رایگان است و نگهداری ماهانه جداگانه توافق می‌شود."}

  ],

  "more_title": "سایر خدمات",

  "form_title": "ثبت سفارش طراحی سایت"

}'::jsonb),

('fa_pc', '{

  "seo_title": "خدمات کامپیوتر در هشتگرد | امیررضا لطفی",

  "seo_description": "نصب ویندوز، نصب و عیب‌یابی پرینتر و افزایش سرعت سیستم توسط امیررضا لطفی در محل شما در هشتگرد و حومه. ثبت سفارش آنلاین.",

  "hero_title": "خدمات کامپیوتر در هشتگرد",

  "intro_title": "چه کارهایی انجام می‌شود؟",

  "price_title": "راهنمای هزینه",

  "price_note2": "قاعده کلی: نصب ویندوز همراه با درایورها و نرم‌افزارهای پایه یک تعرفه دارد؛ نصب پرینتر و اتصال آن به چند سیستم تعرفه جداگانه؛ عیب‌یابی (گیر کاغذ، خطای درایور، مشکلات شبکه پرینتر) بر اساس زمان صرف‌شده؛ و بهینه‌سازی سرعت سیستم معمولاً در همان یک جلسه اول نتیجه محسوس می‌دهد. برآورد دقیق را بعد از ثبت سفارش و شنیدن شرح مشکل اعلام می‌کنم — بدون هزینه پنهان.",

  "subsvc_title": "زیرخدمت‌ها",

  "subservices": [

    {"title": "🪟 نصب ویندوز", "text": "نصب تمیز ویندوز ۱۰ یا ۱۱ همراه با درایورها، فعال‌سازی، نرم‌افزارهای کاربردی (مرورگر، آفیس، پخش‌کننده، آنتی‌ویروس) و بکاپ‌گیری از فایل‌های مهم قبل از نصب. درایوهای دیگر شما دست نمی‌خورد."},

    {"title": "🖨️ نصب پرینتر", "text": "نصب و راه‌اندازی پرینترهای HP، Canon، Epson و Brother؛ اتصال با کابل یا وای‌فای، نصب روی چند سیستم، و تست چاپ و اسکن جلوی چشم شما."},

    {"title": "🔧 عیب‌یابی پرینتر", "text": "رفع گیر کردن کاغذ، خطاهای درایور، چاپ نصفه‌نیمه یا بی‌کیفیت، و مشکلات اتصال پرینتر به شبکه. اگر مشکل سخت‌افزاری جدی باشد، صادقانه می‌گویم تعمیر به‌صرفه نیست."},

    {"title": "⚡ افزایش سرعت سیستم", "text": "پاک‌سازی برنامه‌های اضافه استارت‌آپ، حذف بدافزار و تبلیغ‌افزار، بهینه‌سازی تنظیمات ویندوز، و بررسی سلامت هارد. اگر سیستم قدیمی باشد، پیشنهاد دقیق ارتقا (SSD یا رم) با برآورد هزینه می‌دهم."},

    {"title": "💾 بکاپ و بازیابی اطلاعات", "text": "بکاپ‌گیری منظم از عکس‌ها و اسناد مهم روی فلش، هارد اکسترنال یا فضای ابری، و تلاش برای بازیابی فایل‌های پاک‌شده. پیشگیری همیشه ارزان‌تر از بازیابی است."}

  ],

  "cta_0": "سفارش نصب ویندوز",

  "cta_1": "سفارش نصب پرینتر",

  "cta_2": "سفارش عیب‌یابی",

  "cta_3": "سفارش افزایش سرعت",

  "cta_4": "سفارش بکاپ",

  "faq_title": "سوالات پرتکرار",

  "faq": [

    {"q": "نصب ویندوز با حفظ اطلاعات انجام می‌شود؟", "a": "بله؛ قبل از نصب از فایل‌های مهم بکاپ گرفته می‌شود و درایوهای دیگر دست نمی‌خورد. فقط حتماً در توضیح سفارش بنویسید چه فایل‌هایی مهم است."},

    {"q": "کدام مدل‌های پرینتر پشتیبانی می‌شود؟", "a": "پرینترهای خانگی و اداری HP، Canon، Epson و Brother — هم نصب اولیه و هم رفع گیر کاغذ و خطای درایور."},

    {"q": "سیستم خیلی قدیمی ارزش ارتقا دارد؟", "a": "بسته به مدل دارد؛ معمولاً اضافه کردن SSD به لپ‌تاپ‌های بالای ۸ سال هم جان تازه می‌دهد. موقع سفارش مدل سیستم را بنویسید تا بگویم به‌صرفه است یا نه."},

    {"q": "هزینه ایاب‌وذهاب چقدر است؟", "a": "داخل هشتگرد رایگان است؛ خارج از محدوده قبل از اعزام اعلام و توافق می‌شود."}

  ],

  "more_title": "سایر خدمات",

  "form_title": "ثبت سفارش خدمات کامپیوتری"

}'::jsonb)

on conflict (key) do update set value = excluded.value;



-- ============================================================

-- Grant the admin flag to your login user (run AFTER creating the

-- user in Dashboard > Authentication > Users, or via sign-up):

-- ============================================================

-- update auth.users

-- set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb

-- where email = 'YOUR_ADMIN_EMAIL';

