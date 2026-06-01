import TelegramBot from 'node-telegram-bot-api';
import http from 'http';
import https from 'https'; 

const VERSION = '3.0.2'; // Bản v3.0.2 - Chuyển sang định dạng HTML siêu an toàn
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';
const PORT = process.env.PORT || 3000;

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

// Hàm xử lý lõi
async function processJsonAndSendLink(chatId, jsonText, sourceName) {
  const startTime = Date.now();
  try {
    const cleanText = jsonText.replace(/^\uFEFF/, '').trim();
    const parsedJson = JSON.parse(cleanText);
    
    const jsonString = JSON.stringify(parsedJson);
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;

    const expiresAt = getExpirationTime(parsedJson);
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ name: sourceName, link: finalLoginLink, expiresAt: expiresAt });

    const inlineKeyboard = { reply_markup: { inline_keyboard: [[{ text: '🌐 Mở liên kết đăng nhập ngay', url: finalLoginLink }]] } };
    
    // 🚀 Dùng định dạng HTML an toàn: <b> (in đậm), <i> (in nghiêng), <code> (khối code)
    await bot.sendMessage(chatId, `✅ <b>Xử lý thành công!</b>\n\n📁 Nguồn: <code>${sourceName}</code>\n🔗 <b>Link đăng nhập trực tiếp:</b>\n${finalLoginLink}\n\n⚡ <b>Thời gian tính toán:</b> <code>${executionTime} ms</code>`, {
      parse_mode: 'HTML',
      ...inlineKeyboard
    });
  } catch (error) {
    await bot.sendMessage(chatId, `⚠️ <b>Lỗi:</b> Dữ liệu từ <code>${sourceName}</code> không phải cấu trúc JSON hợp lệ.\n<i>(Chi tiết mã lỗi: ${error.message})</i>`, {
      parse_mode: 'HTML',
      ...quickMenu
    });
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.text) {
    const text = msg.text.trim();
    
    if (text.startsWith('/start') || text === '🔄 Khởi động lại Bot (/start)') {
      const welcomeText = `👋 Xin chào <b>${msg.from.first_name}</b>!\n\n🤖 Phiên bản hiện tại: <b>v${VERSION}</b>\n\nTôi là Bot tự động tạo link đăng nhập từ mã JSON.\n\n📥 <b>Cách sử dụng:</b> \n👉 <b>Cách 1:</b> dán trực tiếp đoạn chữ JSON vào ô chat.\n👉 <b>Cách 2:</b> Gửi một file chứa mã JSON (.txt hoặc .json).`;
      return bot.sendMessage(chatId, welcomeText, { parse_mode: 'HTML', ...quickMenu });
    }

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
      loadingMsg = await bot.sendMessage(chatId, `⏳ Đang tải và đọc dữ liệu từ file: <code>${fileName}</code>...`, { parse_mode: 'HTML' });

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
      return bot.sendMessage(chatId, `❌ <b>Thất bại:</b> Không thể đọc file.`, { parse_mode: 'HTML', ...
