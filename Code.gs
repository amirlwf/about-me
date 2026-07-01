// ===== Google Apps Script - بک‌اند ارسال پیام به تلگرام =====
// این کد رو در Google Apps Script قرار بده
// توکن ربات و آیدی چت در Script Properties ذخیره می‌شن (امن)
//
// ⚠️ نکته مهم درباره CORS:
// برای اینکه درخواست‌های fetch از مرورگر کار کنن، باید:
// 1. وب‌اپ رو با دسترسی "Anyone" دیپلوی کنی
// 2. از HtmlService برای پاسخ‌ها استفاده کنی (نه ContentService)
// 3. بعد از تغییرات، حتماً دیپلوی جدید بسازی (نه ویرایش دیپلوی قبلی)

// ===== پاسخ به درخواست‌های POST (ارسال پیام) =====
function doPost(e) {
  try {
    // لاگ کردن درخواست دریافتی
    Logger.log('=== درخواست جدید ===');
    Logger.log('محتوای درخواست: ' + e.postData.contents);
    
    // دریافت پیام از بدنه درخواست
    const data = JSON.parse(e.postData.contents);
    const message = data.message;

    // بررسی وجود پیام
    if (!message) {
      Logger.log('❌ پیام خالیه');
      return createJsonResponse({ success: false, error: 'پیام خالیه!' });
    }

    Logger.log('پیام دریافتی: ' + message);

    // دریافت توکن و آیدی از Script Properties
    const scriptProperties = PropertiesService.getScriptProperties();
    const botToken = scriptProperties.getProperty('BOT_TOKEN');
    const chatId = scriptProperties.getProperty('CHAT_ID');

    Logger.log('BOT_TOKEN: ' + (botToken ? 'تنظیم شده' : 'تنظیم نشده'));
    Logger.log('CHAT_ID: ' + (chatId || 'تنظیم نشده'));

    // بررسی تنظیم بودن توکن‌ها
    if (!botToken || !chatId) {
      Logger.log('❌ توکن‌ها تنظیم نشدن');
      return createJsonResponse({ success: false, error: 'توکن ربات تنظیم نشده!' });
    }

    // ارسال پیام به تلگرام
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: `📨 پیام جدید از سایت:\n\n${message}`,
      parse_mode: 'HTML'
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    Logger.log('ارسال درخواست به تلگرام...');
    const response = UrlFetchApp.fetch(telegramUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log('کد پاسخ تلگرام: ' + responseCode);
    Logger.log('متن پاسخ تلگرام: ' + responseText);

    const result = JSON.parse(responseText);

    // بررسی موفقیت ارسال
    if (result.ok) {
      Logger.log('✅ پیام با موفقیت ارسال شد');
      return createJsonResponse({ success: true });
    } else {
      Logger.log('❌ خطا از تلگرام: ' + result.description);
      return createJsonResponse({ success: false, error: result.description || 'خطای تلگرام' });
    }

  } catch (error) {
    Logger.log('❌ خطای عمومی: ' + error.toString());
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ===== پاسخ به درخواست‌های GET (اطلاعات) =====
function doGet(e) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Telegram Bot API</title>
      <style>
        body { 
          font-family: monospace; 
          background: #0a0a0a; 
          color: #00ff41; 
          padding: 40px; 
          text-align: center; 
        }
        h1 { color: #00ff41; }
        p { color: #888; }
        code { 
          background: #1a1a1a; 
          padding: 2px 8px; 
          border-radius: 4px; 
        }
      </style>
    </head>
    <body>
      <h1>🤖 Telegram Bot API Proxy</h1>
      <p>این سرویس پیام‌های سایت رو به تلگرام ارسال می‌کنه.</p>
      <p>برای ارسال پیام، از <code>POST</code> با بدنه JSON استفاده کن:</p>
      <pre style="background:#1a1a1a; padding:15px; border-radius:8px; text-align:right; direction:ltr;">
{
  "message": "پیام شما"
}</pre>
      <p style="margin-top:30px; font-size:0.8rem;">Built with ❤️ by Jigar</p>
    </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Telegram Bot API')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===== تابع کمکی برای ساخت پاسخ JSON =====
// از ContentService استفاده می‌کنیم برای پاسخ‌های JSON
// توجه: ContentService از CORS پشتیبانی نمی‌کنه، اما وقتی وب‌اپ با دسترسی "Anyone" دیپلوی بشه
// و درخواست از https:// بیاد (مثل GitHub Pages)، مرورگر اجازه می‌ده
function createJsonResponse(data) {
  const json = JSON.stringify(data);
  
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== تابع تنظیم توکن‌ها (یه بار اجرا کن) =====
// این تابع رو دستی اجرا کن تا توکن‌ها ذخیره بشن
function setupBotCredentials() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // ⚠️ مقادیر زیر رو با اطلاعات خودت جایگزین کن
  scriptProperties.setProperties({
    'BOT_TOKEN': '8945812898:AAF4TvIT1C08BbSl2G6y1GBpkOa6TqP8cbc',
    'CHAT_ID': '8376494566'
  });
  
  Logger.log('✅ توکن‌ها با موفقیت ذخیره شدن!');
}

// ===== تابع تست اتصال =====
function testConnection() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const botToken = scriptProperties.getProperty('BOT_TOKEN');
  const chatId = scriptProperties.getProperty('CHAT_ID');
  
  Logger.log('BOT_TOKEN: ' + (botToken ? '✅ تنظیم شده' : '❌ تنظیم نشده'));
  Logger.log('CHAT_ID: ' + (chatId ? '✅ تنظیم شده' : '❌ تنظیم نشده'));
  
  if (botToken && chatId) {
    Logger.log('🎉 همه چیز آماده‌ست!');
  } else {
    Logger.log('⚠️ اول تابع setupBotCredentials رو اجرا کن');
  }
}

// ===== تابع تست ارسال پیام =====
// این تابع رو اجرا کن تا مطمئن شی ربات کار می‌کنه
function testSendMessage() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const botToken = scriptProperties.getProperty('BOT_TOKEN');
  const chatId = scriptProperties.getProperty('CHAT_ID');
  
  if (!botToken || !chatId) {
    Logger.log('❌ توکن‌ها تنظیم نشدن! اول setupBotCredentials رو اجرا کن');
    return;
  }
  
  Logger.log('🔄 در حال ارسال پیام تست...');
  
  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: '🧪 پیام تست از Google Apps Script\n\nاگه این پیام رو دیدی، ربات درست کار می‌کنه!',
      parse_mode: 'HTML'
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(telegramUrl, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      Logger.log('✅ پیام تست با موفقیت ارسال شد! تلگرامت رو چک کن');
    } else {
      Logger.log('❌ خطا در ارسال: ' + result.description);
    }
    
  } catch (error) {
    Logger.log('❌ خطای شبکه: ' + error.toString());
  }
}
