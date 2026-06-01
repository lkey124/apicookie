const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const VERSION = '1.0.4-Optimized';
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường TELE_TOKEN!');
  process.exit(1);
}

// Cấu hình Bot
const bot = new TelegramBot(TOKEN, { polling: true });
// Tối ưu polling để giảm lag
bot.removeAllListeners('polling_error'); // Bỏ qua cảnh báo polling nhỏ cho đỡ spam console

// Bộ nhớ tạm với giới hạn để tối ưu RAM
const MAX_HISTORY = 20; 
const userHistory = {}; 

/** 
 * Hàm dọn dẹp và giới hạn dữ liệu lịch sử 
 * @param {Number} chatId 
 * @param {Boolean} force - Xóa hết hay chỉ xóa hết hạn
 */
function manageHistory(chatId, force = false) {
  if (!userHistory[chatId]) return;
  
  const now = Date.now();
  let history = userHistory[chatId];

  // Lọc bỏ link đã hết hạn
  if (force) {
    userHistory[chatId] = [];
  } else {
    userHistory[chatId] = history.filter(item => item.expiresAt > now);
  }
  
  // Giới hạn kích thước mảng (FIFO) nếu vượt quá MAX_HISTORY
  if (userHistory[chatId].length > MAX_HISTORY) {
    userHistory[chatId] = userHistory[chatId].slice(-MAX_HISTORY);
  }
}

// Tính ngày hết hạn
function getExpirationTime(parsedJson) {
  let minExpiry = Date.now() + 24 * 60 * 60 * 1000; // Mặc định 24h nếu không có cookie
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
}

// HTTP Server giả lập để Render không tính timeout
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`✅ Bot v${VERSION} Online | RAM: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
}).listen(PORT, () => console.log(`🌍 Server running on Port: ${PORT}`));

// Menu
const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📜 Lịch sử link còn hạn' }],
      [{ text: '🔄 Khởi động lại Bot' }, { text: '📋 Hướng dẫn' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Xử lý /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  manageHistory(chatId); // Dọn dẹp khi khởi động lại
  
  const text = `👋 Xin chào *${msg.from.first_name}*!\n\n🤖 Phiên bản: *v${VERSION}*\n\n⚡ Tối ưu tốc độ & RAM.\n\n📥 *Cách dùng:*\nGửi nội dung JSON hoặc file .json/.txt.`;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainMenu });
});

// Xử lý tin nhắn văn bản (Message)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text || msg.document || msg.photo || msg.chat.type === 'group') return;

  const text = msg.text.trim();

  // 1. Xử lý nút bấm (Menu Buttons)
  if (text === '📜 Lịch sử link còn hạn') {
    manageHistory(chatId); // Dọn dẹp phụ thuộc trước khi hiển thị
    const history = userHistory[chatId] || [];
    
    if (history.length === 0)
