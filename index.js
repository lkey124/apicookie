import TelegramBot from 'node-telegram-bot-api';
import http from 'http';
import https from 'https'; 

const VERSION = '3.0.1'; // Bản v3.0.1 - Vá lỗi ghép chuỗi nhị phân & lọc BOM
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
    // 🚀 BỘ LỌC TỐI THƯỢNG: Xóa sạch ký tự BOM vô hình và các khoảng trắng rác
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
    
    await bot.sendMessage(chatId, `✅ *Xử lý thành công!*\n\n📁 Nguồn: \`${sourceName}\`\n🔗 *Link đăng nhập trực tiếp:*\n${finalLoginLink}\n\n⚡ *Thời gian tính toán:* \`${executionTime} ms\``, {
      parse_mode: 'Markdown',
      ...inlineKeyboard
    });
  } catch (error) {
    // In thêm lý do lỗi chi tiết để bắt bệnh nếu còn sai
    await bot.sendMessage(chatId, `⚠️ *Lỗi:* Dữ liệu từ \`${sourceName}\` không phải cấu trúc JSON hợp lệ.\n_(Chi tiết mã lỗi: ${error.message})_`, {
      parse_mode: 'Markdown',
      ...quickMenu
    });
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // 1. XỬ LÝ KHI DÁN CHỮ (TEXT)
  if (msg.text) {
    const text = msg.text.trim();
    
    if (text.startsWith('/start') || text === '🔄 Khởi động lại Bot (/start)') {
      const welcomeText = `👋 Xin chào *${msg.from.first_name}*!\n\n🤖 Phiên bản hiện tại: *v${VERSION}*\n\nTôi là Bot tự động tạo link đăng nhập từ mã JSON.\n\n📥 *Cách sử dụng:* \n👉 *Cách 1:* dán trực tiếp đoạn chữ JSON vào ô chat.\n👉 *Cách 2:* Gửi một file chứa mã JSON (.txt hoặc .json).`;
      return bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown', ...quickMenu });
    }

    if (text === '📜 Lịch sử link còn hạn') {
      const history = userHistory[chatId] || [];
      const now = Date.now();
      const validLinks = history.filter(item => item.expiresAt > now);
      userHistory[chatId] = validLinks;

      if (validLinks.length === 0) {
        return bot.sendMessage(chatId, '📭 Lịch sử trống hoặc tất cả link cookies cũ của bạn đã hết hạn sử dụng!', quickMenu);
      }

      let historyText = '📜 *DANH SÁCH LINK ĐĂNG NHẬP CÒN HẠN:*\n\n';
      const inlineButtons = [];
      validLinks.forEach((item, index) => {
        const hoursLeft = ((item.expiresAt - now) / 1000 / 60 / 60).toFixed(1);
        historyText += `${index + 1}. 📄 \`${item.name}\`\n⏳ Hạn dùng: Còn khoảng *${hoursLeft} giờ*\n\n`;
        inlineButtons.push([{ text: `🌐 Mở link số ${index + 1}`, url: item.link }]);
      });
      return bot.sendMessage(chatId, historyText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } });
    }

    if (text === '📋 Xem hướng dẫn định dạng JSON') {
      const guideText = `📝 *Cấu trúc mẫu JSON hợp lệ:*\n\n\`\`\`json\n{\n  "username": "admin",\n  "role": "user",\n  "session": "123456"\n}\n\`\`\``;
      return bot.sendMessage(chatId, guideText, { parse_mode: 'Markdown', ...quickMenu });
    }

    return processJsonAndSendLink(chatId, text, `Văn bản dán lúc ${new Date().toLocaleTimeString('vi-VN')}`);
  }

  // 2. XỬ LÝ KHI GỬI FILE (DOCUMENT)
  if (msg.document) {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'file_json.json';
    let loadingMsg;

    try {
      loadingMsg = await bot.sendMessage(chatId, `⏳ Đang tải và đọc dữ liệu từ file: \`${fileName}\`...`, { parse_mode: 'Markdown' });

      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

      const rawContent = await new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`Lỗi từ Telegram API: ${res.statusCode}`));
          
          // 🚀 GIẢI PHÁP LÕI NHỊ PHÂN: Gom Buffer cực kỳ an toàn
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
      return bot.sendMessage(chatId, `❌ *Thất bại:* Không thể đọc file.`, { parse_mode: 'Markdown', ...quickMenu });
    }
  }
});
