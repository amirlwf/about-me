// ===== Google Apps Script - بک‌اند چت زنده با تلگرام =====
// این کد رو در Google Apps Script قرار بده
// پیام‌ها در Google Sheets ذخیره می‌شن و ربات تلگرام پاسخ‌ها رو دریافت می‌کنه

// ===== ثابت‌ها =====
const MESSAGES_SHEET = 'messages';
const STATE_SHEET = 'state';
const VISITOR_PREFIX = '[Visitor:';

// ===== پاسخ به درخواست POST (ارسال پیام از بازدیدکننده) =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { visitorId, message } = data;

    if (!message || !visitorId) {
      return createJsonResponse({ success: false, error: 'پیام یا آیدی خالیه!' });
    }

    storeMessage(visitorId, message, 'visitor');
    forwardToTelegram(visitorId, message);

    return createJsonResponse({ success: true });
  } catch (error) {
    Logger.log('POST Error: ' + error.toString());
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ===== پاسخ به درخواست GET (پولینگ - بررسی پاسخ‌ها) =====
function doGet(e) {
  try {
    const visitorId = e.parameter.visitorId;

    if (!visitorId) {
      return createJsonResponse({ success: false, error: 'visitorId لازمه!' });
    }

    checkForReplies();

    const messages = getChatHistory(visitorId);
    return createJsonResponse({ success: true, messages: messages });
  } catch (error) {
    Logger.log('GET Error: ' + error.toString());
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ===== تنظیم شیت (یک بار اجرا کن) =====
function setupSheet() {
  const props = PropertiesService.getScriptProperties();
  let ss;

  const sheetId = props.getProperty('SPREADSHEET_ID');
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
      Logger.log('شیت موجود پیدا شد: ' + ss.getUrl());
    } catch (e) {
      Logger.log('شیت قبلی پیدا نشد، ساخت شیت جدید...');
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('Jigar Chat - Messages');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('شیت جدید ساخته شد: ' + ss.getUrl());
  }

  let messagesSheet = ss.getSheetByName(MESSAGES_SHEET);
  if (!messagesSheet) {
    messagesSheet = ss.insertSheet(MESSAGES_SHEET);
    messagesSheet.appendRow(['visitorId', 'message', 'sender', 'timestamp']);
    messagesSheet.setFrozenRows(1);
    messagesSheet.setColumnWidth(1, 150);
    messagesSheet.setColumnWidth(2, 400);
    messagesSheet.setColumnWidth(3, 100);
    messagesSheet.setColumnWidth(4, 180);
  }

  let stateSheet = ss.getSheetByName(STATE_SHEET);
  if (!stateSheet) {
    stateSheet = ss.insertSheet(STATE_SHEET);
    stateSheet.appendRow(['key', 'value']);
    stateSheet.setFrozenRows(1);
    stateSheet.appendRow(['lastUpdateId', '0']);
  }

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('تنظیم شیت کامل شد!');
}

// ===== گرفتن شیت‌اسپرید =====
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SPREADSHEET_ID');
  if (!sheetId) {
    setupSheet();
    return SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
  }
  return SpreadsheetApp.openById(sheetId);
}

// ===== ذخیره پیام در شیت =====
function storeMessage(visitorId, message, sender) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(MESSAGES_SHEET);
  const timestamp = new Date().toISOString();
  sheet.appendRow([visitorId, message, sender, timestamp]);
}

// ===== فوروارد پیام به تلگرام =====
function forwardToTelegram(visitorId, message) {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty('BOT_TOKEN');
  const chatId = props.getProperty('CHAT_ID');

  if (!botToken || !chatId) {
    Logger.log('توکن‌ها تنظیم نشدن!');
    return;
  }

  const prefix = VISITOR_PREFIX + visitorId + ']';
  const text = `📨 پیام جدید از سایت\n${prefix}\n\n${message}`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    }),
    muteHttpExceptions: true
  });
}

// ===== بررسی پاسخ‌های جدید از تلگرام =====
function checkForReplies() {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty('BOT_TOKEN');
  const chatId = props.getProperty('CHAT_ID');

  if (!botToken || !chatId) {
    return;
  }

  const updates = getTelegramUpdates(botToken);
  if (!updates || updates.length === 0) {
    return;
  }

  let maxUpdateId = getLastUpdateId();
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(MESSAGES_SHEET);
  const existingTimestamps = {};
  const data = sheet.getDataRange().getValues();

  // ایندکس کردن پیام‌های مالک موجود
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === 'owner') {
      existingTimestamps[data[i][3]] = true;
    }
  }

  // بررسی هر آپدیت
  for (const update of updates) {
    if (update.update_id > maxUpdateId) {
      maxUpdateId = update.update_id;
    }

    if (!update.message || !update.message.reply_to_message) {
      continue;
    }

    const visitorId = extractVisitorId(update.message.reply_to_message.text || '');
    if (!visitorId) {
      continue;
    }

    const replyText = update.message.text || '';
    if (!replyText) {
      continue;
    }

    const timestamp = new Date(update.message.date * 1000).toISOString();

    // ذخیره فقط اگه قبلاً ذخیره نشده
    if (!existingTimestamps[timestamp]) {
      sheet.appendRow([visitorId, replyText, 'owner', timestamp]);
    }
  }

  // آپدیت آخرین آیدی
  if (maxUpdateId > getLastUpdateId()) {
    setLastUpdateId(maxUpdateId);
  }
}

// ===== استخراج visitorId از متن پیام =====
function extractVisitorId(text) {
  if (!text) {
    return null;
  }
  const match = text.match(/\[Visitor:([a-f0-9]+)\]/i);
  return match ? match[1] : null;
}

// ===== گرفتن آپدیت‌های تلگرام =====
function getTelegramUpdates(botToken) {
  const offset = getLastUpdateId() + 1;
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=50`;

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());
    return result.ok ? result.result : [];
  } catch (error) {
    Logger.log('getUpdates Error: ' + error.toString());
    return [];
  }
}

// ===== خواندن آخرین آیدی آپدیت =====
function getLastUpdateId() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(STATE_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'lastUpdateId') {
      return parseInt(data[i][1]) || 0;
    }
  }
  return 0;
}

// ===== ذخیره آخرین آیدی آپدیت =====
function setLastUpdateId(id) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(STATE_SHEET);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'lastUpdateId') {
      sheet.getRange(i + 1, 2).setValue(id);
      return;
    }
  }
  sheet.appendRow(['lastUpdateId', id]);
}

// ===== گرفتن تاریخچه چت یک بازدیدکننده =====
function getChatHistory(visitorId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(MESSAGES_SHEET);
  const data = sheet.getDataRange().getValues();
  const messages = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === visitorId) {
      messages.push({
        sender: data[i][2],
        text: data[i][1],
        time: data[i][3]
      });
    }
  }

  return messages;
}

// ===== ساخت پاسخ JSON =====
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== تنظیم توکن‌ها (یه بار اجرا کن) =====
function setupBotCredentials() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    'BOT_TOKEN': '8945812898:AAF4TvIT1C08BbSl2G6y1GBpkOa6TqP8cbc',
    'CHAT_ID': '8376494566'
  });
  Logger.log('توکن‌ها با موفقیت ذخیره شدن!');
}

// ===== تست اتصال =====
function testConnection() {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty('BOT_TOKEN');
  const chatId = props.getProperty('CHAT_ID');

  Logger.log('BOT_TOKEN: ' + (botToken ? 'تنظیم شده' : 'تنظیم نشده'));
  Logger.log('CHAT_ID: ' + (chatId ? 'تنظیم شده' : 'تنظیم نشده'));

  if (botToken && chatId) {
    Logger.log('همه چیز آماده‌ست!');
  } else {
    Logger.log('اول تابع setupBotCredentials رو اجرا کن');
  }
}

// ===== تست ارسال پیام =====
function testSendMessage() {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty('BOT_TOKEN');
  const chatId = props.getProperty('CHAT_ID');

  if (!botToken || !chatId) {
    Logger.log('توکن‌ها تنظیم نشدن! اول setupBotCredentials رو اجرا کن');
    return;
  }

  Logger.log('در حال ارسال پیام تست...');

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: '🧪 پیام تست از Google Apps Script\n\nاگه این پیام رو دیدی، ربات درست کار می‌کنه!',
        parse_mode: 'HTML'
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (result.ok) {
      Logger.log('پیام تست با موفقیت ارسال شد! تلگرامت رو چک کن');
    } else {
      Logger.log('خطا در ارسال: ' + result.description);
    }
  } catch (error) {
    Logger.log('خطای شبکه: ' + error.toString());
  }
}