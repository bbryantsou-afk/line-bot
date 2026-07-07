// ============================================
// LINE Bot - Node.js 版本
// 功能：接收 LINE 訊息 → 呼叫 NVIDIA AI → 搜尋 Google Drive
// ============================================

const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const linebot = require('linebot');

// ============================================
// 設定區（請填入你的資料）
// ============================================

// NVIDIA API 設定
const NVIDIA_API_KEY = '你的 NVIDIA API Key';  // ← 請填你的 Key
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

// LINE Bot 設定
const LINE_CHANNEL_ACCESS_TOKEN = '你的 LINE Channel Access Token';  // ← 請填你的 Token
const LINE_CHANNEL_SECRET = '你的 LINE Channel Secret';  // ← 請填你的 Secret

// Google Drive 設定（使用服務帳戶金鑰）
// 請到 Google Cloud Console 建立服務帳戶並下載金鑰檔案
// 將金鑰檔案放在專案根目錄，命名為 service-account-key.json
const KEY_FILE_PATH = './service-account-key.json';  // ← 你下載的金鑰檔案路徑
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// ============================================
// 初始化 Express 和 LINE Bot
// ============================================

const app = express();
app.use(express.json());

// ============================================
// 核心功能：搜尋 Google Drive
// ============================================

async function searchDriveFiles(keyword) {
  try {
    // 使用服務帳戶認證
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });

    // 搜尋檔案：標題包含關鍵字
    const response = await drive.files.list({
      q: `name contains '${keyword}' and trashed=false`,
      fields: 'files(id, name, webViewLink, modifiedTime)',
      pageSize: 5,
    });

    const files = response.data.files;

    if (files.length === 0) {
      return `❌ 找不到包含「${keyword}」的檔案，請試試其他關鍵字。`;
    }

    let result = `🔍 搜尋關鍵字：「${keyword}」\n`;
    files.forEach((file, index) => {
      result += `\n📄 ${file.name}`;
      result += `\n🔗 ${file.webViewLink || '無法取得連結'}`;
      result += `\n📅 更新：${file.modifiedTime}`;
      result += `\n------------------------`;
    });

    return result;
  } catch (error) {
    console.error('❌ 搜尋雲端硬碟失敗：', error.message);
    return '搜尋雲端硬碟時發生錯誤：' + error.message;
  }
}

// ============================================
// 核心功能：呼叫 NVIDIA AI
// ============================================

async function callNVIDIA(prompt) {
  try {
    const payload = {
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 512,
    };

    const response = await axios.post(NVIDIA_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      timeout: 30000,
    });

    return response.data.choices[0].message.content || 'AI 回覆了空內容。';
  } catch (error) {
    console.error('❌ 呼叫 NVIDIA API 失敗：', error.message);
    return 'AI 服務暫時無法回應，請稍後再試。';
  }
}

// ============================================
// 核心功能：處理使用者的搜尋請求
// ============================================

async function handleSearchRequest(userMessage) {
  // 第一步：用 AI 提取關鍵字
  const aiPrompt = `請從使用者的指令中，提取出用來搜尋 Google 雲端硬碟檔案的關鍵詞。只輸出關鍵詞，不要有其他廢話。使用者說："${userMessage}"`;
  const keyword = await callNVIDIA(aiPrompt);
  console.log('🤖 AI 提取的關鍵詞：', keyword);

  // 第二步：用關鍵字搜尋雲端硬碟
  const searchResult = await searchDriveFiles(keyword);
  return searchResult;
}

// ============================================
// LINE Bot 路由
// ============================================

const bot = linebot({
  channelId: LINE_CHANNEL_SECRET,  // 實際上是 Channel Secret
  channelSecret: LINE_CHANNEL_SECRET,
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});

bot.on('message', async (event) => {
  if (event.message.type === 'text') {
    const userMessage = event.message.text;
    console.log('📨 收到訊息：', userMessage);

    try {
      const replyText = await handleSearchRequest(userMessage);
      event.reply(replyText).then(() => {
        console.log('✅ 回覆成功');
      }).catch((error) => {
        console.error('❌ 回覆失敗：', error);
      });
    } catch (error) {
      console.error('❌ 處理訊息時發生錯誤：', error);
      event.reply('抱歉，處理您的請求時發生錯誤，請稍後再試。');
    }
  }
});

// ============================================
// Webhook 端點（LINE 會呼叫這個網址）
// ============================================

app.post('/webhook', (req, res) => {
  bot.parser(req, res, () => {
    res.status(200).send('OK');
  });
});

// ============================================
// 健康檢查端點（用來確認服務是否活著）
// ============================================

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ============================================
// 啟動伺服器
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ LINE Bot 已啟動，監聽端口 ${PORT}`);
});
