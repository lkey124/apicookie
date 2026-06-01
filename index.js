const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const VERSION = '1.0.5-Fixed';
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ Lỗi: Thiếu TELE_TOKEN trong biến môi trường!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const userHistory = {};

console.log(`🤖 Bot v${VERSION} đang khởi động...`);

// Hàm tính thời hạn cookie
function getExpirationTime(parsedJson) {
  try {
    let minExpiry = Date.now() + 86400000; // Mặc định 24h
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
    return minExpiry;
  } catch (e) {
    return Date.now() + 86400000;
  }
}

// Server giữ worker sống (Health Check)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`✅ Bot ${VERSION} Running!`);
}).listen(PORT, () => console.log(`🌍 Port ${PORT} ready`));

const menu = {
  reply_markup: {
    keyboard: [
      [{ text: '📜 Lịch sử link còn hạn' }],
      [{ text: '🔄 Khởi động lại Bot' }, { text: '📋 Hướng dẫn' }]
    ],
    resize_keyboard: true
  }
};

// Xử lý lệnh /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcome = `👋 Xin chào *${msg.from.first_name}*!\n\n🤖 Bot v${VERSION}\n\n📥 Gửi nội dung JSON hoặc file .json/.txt để tạo link.`;
  bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown', ...menu });
});

// Xử lý tin nhắn văn bản
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text || msg.document) return;
  
  const text = msg.text.trim();

  // Xử lý nút menu 1
  if (text === '📜 Lịch sử link còn hạn') {
    const now = Date.now();
    const history = (userHistory[chatId] || []).filter(item => item.expiresAt > now);
    
    if (history.length === 0) {
      bot.sendMessage(chatId, '📭 Không có link nào còn hạn!', menu);
      return;
    }

    let historyText = '📜 *DANH SÁCH LINK CÒN HẠN:*\n\n';
    const inlineButtons = [];
    
    history.slice(0, 10).forEach((item, index) => {
      const hoursLeft = ((item.expiresAt - now) / 3600000).toFixed(1);
      historyText += `${index + 1}. ${item.name}\n⏳ Còn ${hoursLeft} giờ\n\n`;
      inlineButtons.push([{ text: `🌐 Mở link ${index + 1}`, url: item.link }]);
    });

    bot.sendMessage(chatId, historyText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } });
    return;
  }

  // Xử lý nút menu 2
  if (text === '🔄 Khởi động lại Bot') {
    bot.sendMessage(chatId, `🤖 Đã khởi động lại!\n\n🤖 Phiên bản: *v${VERSION}*`, { parse_mode: 'Markdown', ...menu });
    return;
  }

  // Xử lý nút menu 3
  if (text === '📋 Hướng dẫn') {
    bot.sendMessage(chatId, '📝 Gửi nội dung JSON dạng text hoặc file .txt/.json đính kèm.', menu);
    return;
  }

  // ⚠️ Bỏ qua các tin nhắn lệch (commands, tin nhắn nhóm)
  if (text.startsWith('/')) return;
  if (msg.chat.type !== 'private') return;

  // ✨ XỬ LÝ JSON TRỰC TIẾP
  const startTime = Date.now();
  try {
    const parsedJson = JSON.parse(text);
    const jsonString = JSON.stringify(parsedJson);
    
    // Mã hóa Base64 an toàn cho URL (URL-safe)
    const safeToken = Buffer.from(jsonString).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;
    const expiresAt = getExpirationTime(parsedJson);

    // Lưu vào lịch sử (giới hạn 10 link gần nhất)
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ 
      name: `Tin nhắn lúc ${new Date().toLocaleTimeString('vi-VN')}`, 
      link: finalLoginLink, 
      expiresAt: expiresAt 
    });
    
    if (userHistory[chatId].length > 10) userHistory[chatId].shift();

    bot.sendMessage(chatId, `✅ *Xử lý thành công!*\n\n⚡ Thời gian: \`${executionTime} ms\``, { 
      parse_mode: 'Markdown',
      reply_markup: { 
        inline_keyboard: [[{ text: '🌐 Mở liên kết đăng nhập', url: finalLoginLink }]] 
      } 
    });

  } catch (error) {
    // Không làm gì cả để tránh spam lỗi khi người dùng chat thường
  }
});

// XỬ LÝ FILE ĐÍNH KÈM
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const startTime = Date.now();

  try {
    const loadingMsg = await bot.sendMessage(chatId, `⏳ Đang xử lý file: ${fileName}...`);

    const rawContent = await new Promise((resolve, reject) => {
      const stream = bot.getFileStream(fileId);
      const chunks = [];
      
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });

    const parsedJson = JSON.parse(rawContent.trim());
    const jsonString = JSON.stringify(parsedJson);
    const safeToken = Buffer.from(jsonString).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;
    const expiresAt = getExpirationTime(parsedJson);

    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ name: fileName, link: finalLoginLink, expiresAt: expiresAt });
    if (userHistory[chatId].length > 10) userHistory[chatId].shift();

    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    
    bot.sendMessage(chatId, `✅ *Xử lý file thành công!*\n\n⚡ Thời gian: \`${executionTime} ms\``, { 
      parse_mode: 'Markdown',
      reply_markup: { 
        inline_keyboard: [[{ text: '🌐 Mở liên kết đăng nhập', url: finalLoginLink }]] 
      } 
    });
    
  } catch (error) {
    console.error("❌ Lỗi xử lý file:", error.message);
    bot.sendMessage(chatId, '❌ File không đúng định dạng JSON!', menu);
  }
});

console.log('🤖 Bot sẵn sàng nhận dữ liệu.');
