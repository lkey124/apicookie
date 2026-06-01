import TelegramBot from 'node-telegram-bot-api';

// Cấu hình bảo mật lấy từ Environment Variables trên Render
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';

if (!TOKEN) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường TELE_TOKEN!');
  process.exit(1);
}

// Khởi tạo Bot với chế độ Polling
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Bot Telegram đang chạy và sẵn sàng nhận dữ liệu...');

// 1. Lệnh /start chào mừng
bot.onText(/\/start/, (msg) => {
  const welcomeText = `👋 Xin chào *${msg.from.first_name}*!\n\nTôi là Bot tự động tạo link đăng nhập từ mã JSON.\n\n📥 *Cách sử dụng:* \n👉 *Cách 1:* Dán trực tiếp đoạn chữ JSON vào ô chat.\n👉 *Cách 2:* Gửi một file chứa mã JSON (.txt hoặc .json).\n\nTôi sẽ mã hóa bảo mật và trả lại link đăng nhập lập tức!`;
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown' });
});

// 2. Xử lý khi bạn gửi CHỮ JSON trực tiếp
bot.on('text', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.startsWith('/')) return; // Bỏ qua các lệnh hệ thống như /start

  try {
    const parsedJson = JSON.parse(text);
    const jsonString = JSON.stringify(parsedJson);
    
    // Mã hóa chuỗi sang Base64 an toàn cho URL
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;

    bot.sendMessage(chatId, `✅ *Xử lý JSON thành công!*\n\n🔗 *Link đăng nhập trực tiếp của bạn:* \n${finalLoginLink}`, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '⚠️ *Lỗi:* Nội dung chữ bạn gửi không phải cấu trúc JSON hợp lệ. Hãy kiểm tra lại dấu ngoặc hoặc dấu phẩy.');
  }
});

// 3. Xử lý khi bạn gửi FILE chứa JSON (.txt hoặc .json)
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;

  try {
    bot.sendMessage(chatId, `⏳ Đang đọc dữ liệu từ file \`${fileName}\`...`, { parse_mode: 'Markdown' });

    // Tải và đọc luồng dữ liệu của file từ server Telegram
    const fileStream = bot.getFileStream(fileId);
    let rawContent = '';
    
    for await (const chunk of fileStream) {
      rawContent += chunk;
    }

    // Phân tích dữ liệu chữ bên trong file
    const parsedJson = JSON.parse(rawContent.trim());
    const jsonString = JSON.stringify(parsedJson);
    
    // Mã hóa Base64
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;

    bot.sendMessage(chatId, `📄 *Xử lý file thành công!*\n\n📁 Tên file: \`${fileName}\`\n🔗 *Link đăng nhập:* \n${finalLoginLink}`, { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, '❌ *Thất bại:* Nội dung bên trong file bạn gửi không tuân theo đúng định dạng cấu trúc JSON.');
  }
});