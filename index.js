import TelegramBot from 'node-telegram-bot-api';

// 1. Cấu hình bảo mật từ Render
const TOKEN = process.env.TELE_TOKEN;
const TARGET_SERVER_URL = process.env.TARGET_URL || 'https://he-thong-cua-ban.com/login-endpoint';

if (!TOKEN) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường TELE_TOKEN trên Render!');
  process.exit(1);
}

// 2. Khởi tạo Bot
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Bot Telegram đã khởi động với toàn bộ tính năng mới nhất...');

// 3. Cấu hình Menu phím tắt dưới khung chat
const quickMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '🔄 Khởi động lại Bot (/start)' }],
      [{ text: '📋 Xem hướng dẫn định dạng JSON' }]
    ],
    resize_keyboard: true, 
    one_time_keyboard: false 
  }
};

// ==========================================
// CHỨC NĂNG 1: LỆNH CHÀO MỪNG (/start)
// ==========================================
bot.onText(/\/start/, (msg) => {
  const welcomeText = `👋 Xin chào *${msg.from.first_name}*!\n\nTôi là Bot tự động tạo link đăng nhập từ mã JSON.\n\n📥 *Cách sử dụng:* \n👉 *Cách 1:* Dán trực tiếp đoạn chữ JSON vào ô chat.\n👉 *Cách 2:* Gửi một file chứa mã JSON (.txt hoặc .json).\n\n⚡ Hệ thống đã tích hợp bộ đo thời gian xử lý thời gian thực!`;
  bot.sendMessage(msg.chat.id, welcomeText, { parse_mode: 'Markdown', ...quickMenu });
});

// ==========================================
// CHỨC NĂNG 2: XỬ LÝ VĂN BẢN (Sửa lỗi nhận diện Link/Cookies)
// ==========================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Bỏ qua nếu tin nhắn không phải chữ (ví dụ: ảnh, video) hoặc là file gửi lên
  if (!msg.text || msg.document) return;

  const text = msg.text.trim();

  // Bỏ qua lệnh /start ban đầu để không bị phản hồi 2 lần
  if (text.startsWith('/start')) return;

  // Xử lý các nút bấm nhanh
  if (text === '🔄 Khởi động lại Bot (/start)') {
    bot.sendMessage(chatId, '🤖 Đang khởi động lại...', quickMenu);
    return;
  }

  if (text === '📋 Xem hướng dẫn định dạng JSON') {
    const guideText = `📝 *Cấu trúc mẫu JSON hợp lệ:*\n\n\`\`\`json\n{\n  "username": "admin",\n  "role": "user",\n  "session": "123456"\n}\n\`\`\`\n\n⚠️ *Lưu ý:* Hãy chắc chắn dữ liệu được bọc trong dấu ngoặc nhọn \`{}\`.`;
    bot.sendMessage(chatId, guideText, { parse_mode: 'Markdown', ...quickMenu });
    return;
  }

  // ⏱️ Bắt đầu đo thời gian xử lý văn bản
  const startTime = performance.now();

  try {
    // Ép kiểu phân tích chuỗi JSON (Chấp nhận cả chuỗi có chứa link/cookies)
    const parsedJson = JSON.parse(text);
    const jsonString = JSON.stringify(parsedJson);
    
    // Mã hóa Base64
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;

    // ⏱️ Kết thúc đo thời gian
    const endTime = performance.now();
    const executionTime = (endTime - startTime).toFixed(2);

    // Cấu hình nút Inline mở link trực tiếp
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Mở liên kết đăng nhập ngay', url: finalLoginLink }]
        ]
      }
    };

    bot.sendMessage(chatId, `✅ *Xử lý JSON thành công!*\n\n🔗 *Link đăng nhập trực tiếp:*\n${finalLoginLink}\n\n⚡ *Thời gian tính toán:* \`${executionTime} ms\``, { 
      parse_mode: 'Markdown',
      ...inlineKeyboard 
    });

  } catch (error) {
    // Chỉ báo lỗi nếu định dạng chữ dán vào bị sai cấu trúc dấu ngoặc
    bot.sendMessage(chatId, '⚠️ *Lỗi:* Nội dung dán vào không phải cấu trúc JSON hợp lệ. Hãy kiểm tra kỹ lại các dấu ngoặc vuông `[]`, ngoặc nhọn `{}` và dấu phẩy `,` nhé.', quickMenu);
  }
});

// ==========================================
// CHỨC NĂNG 3: XỬ LÝ FILE ĐÍNH KÈM SIÊU TỐC
// ==========================================
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;

  // ⏱️ Bắt đầu đo thời gian tải và xử lý file
  const startTime = performance.now();

  try {
    const loadingMsg = await bot.sendMessage(chatId, `⏳ Đang đọc dữ liệu từ file \`${fileName}\`...`, { parse_mode: 'Markdown' });

    // Lấy link tải file trực tiếp (Không dùng Stream để tránh treo máy chủ Render)
    const fileLink = await bot.getFileLink(fileId);
    const response = await fetch(fileLink);
    const rawContent = await response.text();

    // Phân tích và mã hóa JSON
    const parsedJson = JSON.parse(rawContent.trim());
    const jsonString = JSON.stringify(parsedJson);
    
    const safeToken = Buffer.from(jsonString).toString('base64');
    const finalLoginLink = `${TARGET_SERVER_URL}?auth_token=${safeToken}`;

    // ⏱️ Kết thúc đo thời gian
    const endTime = performance.now();
    const executionTime = (endTime - startTime).toFixed(2);

    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Mở liên kết đăng nhập ngay', url: finalLoginLink }]
        ]
      }
    };

    // Xóa tin nhắn chờ "Đang đọc..." cho gọn khung chat
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    bot.sendMessage(chatId, `📄 *Xử lý file thành công!*\n\n📁 Tên file: \`${fileName}\`\n🔗 *Link đăng nhập:*\n${finalLoginLink}\n\n⚡ *Tổng thời gian xử lý:* \`${executionTime} ms\``, { 
      parse_mode: 'Markdown',
      ...inlineKeyboard 
    });

  } catch (error) {
    console.error('Lỗi file:', error);
    bot.sendMessage(chatId, '❌ *Thất bại:* Nội dung bên trong file bạn gửi không hợp lệ hoặc có lỗi khi tải file.', quickMenu);
  }
});
