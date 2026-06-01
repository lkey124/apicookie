import TelegramBot from 'node-telegram-bot-api';
import http from 'http';
import https from 'https'; 

const VERSION = '4.0.1'; // Bản cập nhật danh sách App: Thêm Facebook, ChatGPT
const TOKEN = process.env.TELE_TOKEN;
const PORT = process.env.PORT || 3000;

// =========================================================================
// 📌 KHU VỰC CẤU HÌNH DANH SÁCH APP VÀ LINK SERVER THẬT CỦA ANH
// (Anh thay các link 'https://he-thong-...' thành link web Vercel/React của anh nhé)
// =========================================================================
const APP_SERVERS = {
'vieon.vn': process.env.VIEON_URL || 'https://vieon.vn',
'netflix.com': process.env.NETFLIX_URL || 'https://www.netflix.com',
'facebook.com': process.env.FB_URL || 'https://www.facebook.com',
'chatgpt.com': process.env.GPT_URL || 'https://chat.openai.com',
'openai.com': process.env.OPENAI_URL || 'https://openai.com'
};

if (!TOKEN) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường TELE_TOKEN trên Render!');
  process.exit(1);
}

const userHistory = {}; 

function getExpirationTime(parsedJson) {
  let minExpiry = Infinity;
  let cookiesArray = null;
  if (Array.isArray(parsedJson)) cookiesArray = parsedJson;
  else if (parsedJson.cookies && Array.isArray(parsedJson.cookies)) cookiesArray = parsedJson.cookies;

  if (cookiesArray) {
    cookiesArray.forEach(c => {
      if (c.expirationDate) {
        const expiryMs = c.expirationDate < 10000000000 ? c.expirationDate * 1000 : c.expirationDate;
        if (expiryMs < minExpiry) minExpiry = expiryMs;
      }
    });
  }
  return minExpiry === Infinity ? Date.now() + 24 * 60 * 60 * 1000 : minExpiry;
}

// Giữ cổng Live cho Render
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Bot Telegram phiên bản v${VERSION} đang chạy online 24/7!`);
}).listen(PORT, () => {
  console.log(`🌍 Đã mở cổng giả lập thành công trên Port: ${PORT}`);
});

const bot = new TelegramBot(TOKEN, { polling: true });
bot.setMyCommands([{ command: 'start', description: 'Khởi động lại Bot và hiện Menu' }]);

const quickMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📜 Lịch sử link còn hạn' }],
      [{ text: '🔄 Khởi động lại Bot (/start)' }, { text: '📋 Xem hướng dẫn định dạng JSON' }]
    ],
    resize_keyboard: true, 
    one_time_keyboard: false 
  }
};

bot.onText(/\/start/, (msg) => {
  const welcomeText = `👋 Xin chào <b>${msg.from.first_name}</b>!\n\n🤖 Phiên bản hiện tại: <b>v${VERSION}</b>\n\nTôi là Bot tự động tạo link đăng nhập thông minh.\n\n📥 <b>Tính năng:</b> Tự động quét JSON, nhận diện App (VieON, Netflix, Facebook, ChatGPT...) và xuất trả File đính kèm + Link Server!`;
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'HTML', ...quickMenu });
});

// HÀM XỬ LÝ LÕI VÀ TỰ ĐỘNG NHẬN DIỆN APP
async function processJsonAndSendLink(chatId, jsonText, sourceName) {
  const startTime = Date.now();
  try {
    const cleanText = jsonText.replace(/^\uFEFF/, '').trim();
    const parsedJson = JSON.parse(cleanText);
    
    // 🚀 BƯỚC 1: TỰ ĐỘNG PHÂN TÍCH VÀ NHẬN DIỆN TÊN MIỀN GỐC CỦA FILE JSON
    let detectedDomain = '';
    if (parsedJson.url) {
      try { detectedDomain = new URL(parsedJson.url).hostname; } catch(e) { detectedDomain = parsedJson.url; }
    } else {
      let cookiesArray = Array.isArray(parsedJson) ? parsedJson : (parsedJson.cookies || []);
      if (cookiesArray.length > 0 && cookiesArray[0].domain) {
        detectedDomain = cookiesArray[0].domain;
      }
    }

    // Làm sạch tên miền
    if (detectedDomain.startsWith('.')) detectedDomain = detectedDomain.substring(1);
    detectedDomain = detectedDomain.replace('www.', '').toLowerCase();

    // 🚀 BƯỚC 2: KIỂM TRA XEM DOMAIN NÀY THUỘC APP NÀO ĐỂ LẤY LINK SERVER TƯƠNG ỨNG
    let baseServerUrl = '';
    let appName = 'Chưa xác định';

    for (const key of Object.keys(APP_SERVERS)) {
      if (detectedDomain.includes(key)) {
        baseServerUrl = APP_SERVERS[key];
        // Đặt tên đẹp để hiển thị
        if (key === 'chatgpt.com' || key === 'openai.com') appName = 'CHATGPT';
        else if (key === 'facebook.com') appName = 'FACEBOOK';
        else appName = key.toUpperCase(); 
        break;
      }
    }

    // Nếu file lạ không nằm trong danh sách cấu hình sẵn
    if (!baseServerUrl) {
      baseServerUrl = parsedJson.url || `https://${detectedDomain}`;
      appName = `Gốc (${detectedDomain})`;
    }

    // 🚀 BƯỚC 3: MÃ HÓA VÀ ĐÓNG GÓI LINK ĐÍCH THẬT
    const jsonString = JSON.stringify(parsedJson);
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${baseServerUrl}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;

    // Lưu lịch sử
    const expiresAt = getExpirationTime(parsedJson);
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ name: `${appName} - ${sourceName}`, link: finalLoginLink, expiresAt: expiresAt });

    const inlineKeyboard = { reply_markup: { inline_keyboard: [[{ text: `🌐 Mở liên kết ${appName} ngay`, url: finalLoginLink }]] } };
    
    // Tạo file đính kèm chứa link để tránh lỗi quá dài của Telegram
    const linkBuffer = Buffer.from(finalLoginLink, 'utf8');
    const fileOptions = { filename: `Link_Dang_Nhap_${appName}.txt`, contentType: 'text/plain' };

    const captionMsg = `✅ <b>Xử lý & Nhận diện thành công!</b>\n\n🎯 <b>Ứng dụng phát hiện:</b> <code>${appName}</code>\n🌍 <b>Server đích đã trỏ:</b> <code>${baseServerUrl}</code>\n\n🔗 <i>Anh có thể tải file đính kèm dưới đây để copy link, hoặc bấm nút mở thẳng!</i>\n\n⚡ <b>Thời gian xử lý:</b> <code>${executionTime} ms</code>`;

    await bot.sendDocument(chatId, linkBuffer, {
      caption: captionMsg,
      parse_mode: 'HTML',
      ...inlineKeyboard
    }, fileOptions);

  } catch (error) {
    await bot.sendMessage(chatId, `⚠️ <b>Lỗi:</b> Dữ liệu cấu trúc JSON từ file không hợp lệ.\n<i>(Mã lỗi: ${error.message})</i>`, {
      parse_mode: 'HTML',
      ...quickMenu
    });
  }
}

// LUỒNG LẮNG NGHE TIN NHẮN
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.text) {
    const text = msg.text.trim();
    if (text.startsWith('/start') || text === '🔄 Khởi động lại Bot (/start)') return;

    if (text === '📜 Lịch sử link còn hạn') {
      const history = userHistory[chatId] || [];
      const now = Date.now();
      const validLinks = history.filter(item => item.expiresAt > now);
      userHistory[chatId] = validLinks;

      if (validLinks.length === 0) {
        return bot.sendMessage(chatId, '📭 Lịch sử trống hoặc tất cả link cookies cũ của bạn đã hết hạn sử dụng!', quickMenu);
      }

      let historyText = '📜 <b>DANH SÁCH LINK ĐĂNG NHẬP CÒN HẠN:</b>\n\n';
      const inlineButtons = [];
      validLinks.forEach((item, index) => {
        const hoursLeft = ((item.expiresAt - now) / 1000 / 60 / 60).toFixed(1);
        historyText += `${index + 1}. 📄 <code>${item.name}</code>\n⏳ Hạn dùng: Còn khoảng <b>${hoursLeft} giờ</b>\n\n`;
        inlineButtons.push([{ text: `🌐 Mở link số ${index + 1}`, url: item.link }]);
      });
      return bot.sendMessage(chatId, historyText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: inlineButtons } });
    }

    if (text === '📋 Xem hướng dẫn định dạng JSON') {
      const guideText = `📝 <b>Cấu trúc mẫu JSON hợp lệ:</b>\n\n<pre>{\n  "username": "admin",\n  "role": "user",\n  "session": "123456"\n}</pre>`;
      return bot.sendMessage(chatId, guideText, { parse_mode: 'HTML', ...quickMenu });
    }

    return processJsonAndSendLink(chatId, text, `Văn bản dán lúc ${new Date().toLocaleTimeString('vi-VN')}`);
  }

  if (msg.document) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'file_json.json';
    let loadingMsg;

    try {
      loadingMsg = await bot.sendMessage(chatId, `⏳ Đang tải và tự động quét dữ liệu từ file: <code>${fileName}</code>...`, { parse_mode: 'HTML' });

      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

      const rawContent = await new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`Lỗi từ Telegram API: ${res.statusCode}`));
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer.toString('utf8'));
          });
        }).on('error', reject);
      });

      bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      return processJsonAndSendLink(chatId, rawContent, fileName);

    } catch (error) {
      console.error("Lỗi khi xử lý file:", error);
      if (loadingMsg) bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      return bot.sendMessage(chatId, `❌ <b>Thất bại:</b> Không thể đọc file.`, { parse_mode: 'HTML', ...quickMenu });
    }
  }
});
