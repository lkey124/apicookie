import TelegramBot from 'node-telegram-bot-api';
import http from 'http';

const VERSION = '1.0.1'; // Cập nhật lên bản v1.0.1 chống nghẽn file
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường TELE_TOKEN trên Render!');
  process.exit(1);
}

// Bộ nhớ tạm lưu lịch sử link theo từng người dùng
const userHistory = {}; 

// Hàm tự động quét và tính toán ngày hết hạn từ đống Cookies JSON
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

// Tạo Server mở cổng để Render luôn báo chữ "Live" màu xanh
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Bot Telegram phiên bản v${VERSION} đang chạy online 24/7!`);
}).listen(PORT, () => {
  console.log(`🌍 Đã mở cổng giả lập thành công trên Port: ${PORT}`);
});

const bot = new TelegramBot(TOKEN, { polling: true });
bot.setMyCommands([{ command: 'start', description: 'Khởi động lại Bot và hiện Menu' }]);

console.log(`🤖 Bot Telegram v${VERSION} đã sẵn sàng nhận dữ liệu...`);

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
  const welcomeText = `👋 Xin chào *${msg.from.first_name}*!\n\n🤖 Phiên bản hiện tại: *v${VERSION}*\n\nTôi là Bot tự động tạo link đăng nhập từ mã JSON.\n\n📥 *Cách sử dụng:* \n👉 *Cách 1:* dán trực tiếp đoạn chữ JSON vào ô chat.\n👉 *Cách 2:* Gửi một file chứa mã JSON (.txt hoặc .json).`;
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown', ...quickMenu });
});

// TÍNH NĂNG 1: XỬ LÝ CHỮ DÁN TRỰC TIẾP
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text || msg.document) return;
  const text = msg.text.trim();
  if (text.startsWith('/start')) return;

  if (text === '📜 Lịch sử link còn hạn') {
    const history = userHistory[chatId] || [];
    const now = Date.now();
    const validLinks = history.filter(item => item.expiresAt > now);
    userHistory[chatId] = validLinks; 

    if (validLinks.length === 0) {
      bot.sendMessage(chatId, '📭 Lịch sử trống hoặc tất cả link cookies cũ của bạn đã hết hạn sử dụng!', quickMenu);
      return;
    }

    let historyText = '📜 *DANH SÁCH LINK ĐĂNG NHẬP CÒN HẠN:*\n\n';
    const inlineButtons = [];
    validLinks.forEach((item, index) => {
      const hoursLeft = ((item.expiresAt - now) / 1000 / 60 / 60).toFixed(1);
      historyText += `${index + 1}. 📄 \`${item.name}\`\n⏳ Hạn dùng: Còn khoảng *${hoursLeft} giờ*\n\n`;
      inlineButtons.push([{ text: `🌐 Mở link số ${index + 1}`, url: item.link }]);
    });
    bot.sendMessage(chatId, historyText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineButtons } });
    return;
  }

  if (text === '🔄 Khởi động lại Bot (/start)') {
    bot.sendMessage(chatId, `🤖 Đang khởi động lại...\n🤖 Phiên bản hiện tại: *v${VERSION}*`, quickMenu);
    return;
  }

  if (text === '📋 Xem hướng dẫn định dạng JSON') {
    const guideText = `📝 *Cấu trúc mẫu JSON hợp lệ:*\n\n\`\`\`json\n{\n  "username": "admin",\n  "role": "user",\n  "session": "123456"\n}\n\`\`\``;
    bot.sendMessage(chatId, guideText, { parse_mode: 'Markdown', ...quickMenu });
    return;
  }

  const startTime = Date.now();
  try {
    const parsedJson = JSON.parse(text);
    const jsonString = JSON.stringify(parsedJson);
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;

    const expiresAt = getExpirationTime(parsedJson);
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ name: `Văn bản dán lúc ${new Date().toLocaleTimeString('vi-VN')}`, link: finalLoginLink, expiresAt: expiresAt });

    const inlineKeyboard = { reply_markup: { inline_keyboard: [[{ text: '🌐 Mở liên kết đăng nhập ngay', url: finalLoginLink }]] } };
    bot.sendMessage(chatId, `✅ *Xử lý JSON thành công!*\n\n🔗 *Link đăng nhập trực tiếp:*\n${finalLoginLink}\n\n⚡ *Thời gian tính toán:* \`${executionTime} ms\``, { parse_mode: 'Markdown', ...inlineKeyboard });
  } catch (error) {
    bot.sendMessage(chatId, '⚠️ *Lỗi:* Nội dung dán vào không phải cấu trúc JSON hợp lệ.', quickMenu);
  }
});

// TÍNH NĂNG 2: XỬ LÝ FILE ĐÍNH KÈM (BẢN VÁ LỖI KHÔNG CHẠY)
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const startTime = Date.now();

  try {
    const loadingMsg = await bot.sendMessage(chatId, `⏳ Đang đọc dữ liệu từ file: ${fileName}...`);

    // 🚀 GIẢI PHÁP MỚI: Tải file trực tiếp thông qua hàm lấy Buffer tải về của Telegram API
    const fileBuffer = await bot.downloadFile(fileId, "/tmp"); 
    
    // Đọc Buffer nhị phân chuyển đổi thành chuỗi chữ UTF-8 siêu tốc
    const rawContent = fileBuffer.toString('utf8');

    const parsedJson = JSON.parse(rawContent.trim());
    const jsonString = JSON.stringify(parsedJson);
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;
    const executionTime = Date.now() - startTime;

    const expiresAt = getExpirationTime(parsedJson);
    if (!userHistory[chatId]) userHistory[chatId] = [];
    userHistory[chatId].push({ name: fileName, link: finalLoginLink, expiresAt: expiresAt });

    const inlineKeyboard = { reply_markup: { inline_keyboard: [[{ text: '🌐 Mở liên kết đăng nhập ngay', url: finalLoginLink }]] } };
    
    // Dọn dẹp tin nhắn chờ
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    
    bot.sendMessage(chatId, `📄 *Xử lý file thành công!*\n\n📁 Tên file: \`${fileName}\`\n🔗 *Link đăng nhập:*\n${finalLoginLink}\n\n⚡ *Tổng thời gian xử lý:* \`${executionTime} ms\``, { parse_mode: 'Markdown', ...inlineKeyboard });
  } catch (error) {
    console.error("Lỗi đọc file:", error.message);
    bot.sendMessage(chatId, '❌ *Thất bại:* Nội dung file không đúng chuẩn định dạng JSON hoặc file bị lỗi.', quickMenu);
  }
});
