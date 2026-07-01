# 🤖 Jigar | Cyber Hub

یک وبسایت شخصی سایبرپانک با قابلیت ارسال پیام از طریق تلگرام.

## فایل‌ها

- `index.html` - وبسایت اصلی (همه چیز در یک فایل)
- `Code.gs` - کد Google Apps Script (بک‌اند)

## راهنمای راه‌اندازی

### مرحله ۱: ساخت ربات تلگرام

1. به [@BotFather](https://t.me/BotFather) در تلگرام پیام بده
2. دستور `/newbot` رو بفرست
3. یه اسم برای ربات انتخاب کن (مثلاً `Jigar Bot`)
4. یه یوزرنیم انتخاب کن (مثلاً `jigar_cyber_bot`)
5. **توکن ربات** رو کپی کن (مثل `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### مرحله ۲: گرفتن Chat ID

1. به [@userinfobot](https://t.me/userinfobot) در تلگرام پیام بده
2. **Chat ID** خودت رو کپی کن (یه عدد مثل `123456789`)

### مرحله ۳: ساخت Google Apps Script

1. برو به [script.google.com](https://script.google.com)
2. روی **New Project** کلیک کن
3. محتوای فایل `Code.gs` رو کامل کپی و جایگزین کن
4. پروژه رو ذخیره کن (Ctrl+S)

### مرحله ۴: تنظیم توکن‌ها

1. در Google Apps Script، تابع `setupBotCredentials` رو از لیست بالا انتخاب کن
2. روی **Run** کلیک کن
3. اولین بار ازت اجازه دسترسی می‌خواد → **Review Permissions** → **Allow**
4. توکن‌ها ذخیره شدن ✅

### مرحله ۵: دیپلوی وب‌اپ

1. روی **Deploy** → **New deployment** کلیک کن
2. از آیکون ⚙️، **Web app** رو انتخاب کن
3. تنظیمات:
   - **Execute as**: Me
   - **Who has access**: Anyone
4. روی **Deploy** کلیک کن
5. **URL وب‌اپ** رو کپی کن (مثل `https://script.google.com/macros/s/.../exec`)

> **⚠️ نکته مهم:** اگه کد رو تغییر دادی، حتماً یه دیپلوی **جدید** بساز (نه ویرایش دیپلوی قبلی). ویرایش دیپلوی قبلی باعث می‌شه تغییرات اعمال نشن.

### مرحله ۶: تنظیم وبسایت

1. فایل `index.html` رو باز کن
2. مقادیر زیر رو جایگزین کن:

```javascript
// این خط رو پیدا کن:
const SCRIPT_URL = 'YOUR_SCRIPT_URL';

// جایگزین کن با URL وب‌اپت:
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
```

```html
<!-- این خط رو پیدا کن: -->
<a href="https://t.me/YOUR_USERNAME?text=..." ...>

<!-- جایگزین کن با یوزرنیمت: -->
<a href="https://t.me/arlwf?text=..." ...>
```

### مرحله ۷: آپلود روی GitHub Pages

1. یه ریپازیتوری جدید در GitHub بساز
2. فایل `index.html` رو آپلود کن
3. برو به **Settings** → **Pages**
4. **Source** رو روی `main` بذار
5. چند ثانیه صبر کن تا سایت بالا بیاد 🎉

## تست اتصال

1. در Google Apps Script، تابع `testConnection` رو اجرا کن
2. باید ببینی:
   ```
   BOT_TOKEN: ✅ تنظیم شده
   CHAT_ID: ✅ تنظیم شده
   🎉 همه چیز آماده‌ست!
   ```

3. برای تست واقعی ارسال پیام، تابع `testSendMessage` رو اجرا کن
4. اگه پیام تست رو در تلگرام دریافت کردی، همه چیز درسته!

## نکات مهم

- **امنیت**: توکن ربات داخل Google Apps Script ذخیره می‌شه و در کد سایت قابل مشاهده نیست
- **CORS**: 
  - وقتی فایل `index.html` مستقیماً از روی سیستم باز بشه (`file://`)، مرورگر origin رو `null` در نظر می‌گیره
  - Google Apps Script از `null` origin پشتیبانی نمی‌کنه
  - راه‌حل: از `mode: 'no-cors'` استفاده شده تا درخواست بره و پردازش بشه
  - وقتی سایت روی GitHub Pages باشه (`https://`)، این مشکل وجود نداره
- **هزینه**: Google Apps Script رایگانه (تا ۲۰,۰۰۰ درخواست در روز)
- **محدودیت**: هر اجرا حداکثر ۶ دقیقه زمان می‌بره

## عیب‌یابی

| مشکل | راه‌حل |
|-------|--------|
| پیام ارسال نمی‌شه | توکن‌ها رو با `testConnection` چک کن |
| خطای 403 | دسترسی وب‌اپ رو روی "Anyone" بذار |
| خطای 404 | URL اسکریپت رو دوباره کپی کن |
| پیام به تلگرام نمی‌رسه | Chat ID رو چک کن |
| خطای CORS در فایل محلی | طبیعیه! فایل رو روی GitHub Pages بذار یا از `mode: 'no-cors'` استفاده کن |
| خطای CORS در GitHub Pages | مطمئن شو از `HtmlService` استفاده شده و دیپلوی جدید ساختی |

## تکنولوژی‌ها

- HTML5 / CSS3 / Vanilla JS
- Google Apps Script (بک‌اند)
- Telegram Bot API
- Google Fonts (JetBrains Mono, Orbitron, Vazirmatn)

---

ساخته شده با ❤️ توسط جیگر
