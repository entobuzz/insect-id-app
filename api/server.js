const https = require('https');
const http = require('http');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400'
};

function getPromptByLevel(level) {
  const kb_note = `若知識庫有對應學名，以知識庫為準。`;

  if (level <= 9) {
    return `你是昆蟲辨識專家。請看這張照片，只回答以下格式，不要加任何其他文字：

是昆蟲 / 不是昆蟲

若是昆蟲就回答「是昆蟲」，不是就回答「不是昆蟲：[簡短說明是什麼]」`;
  }

  if (level <= 19) {
    return `你是昆蟲辨識專家。請看這張照片，從以下12個類群中選出最符合的一個，只回答以下格式：

🐛 這是什麼？
[從以下選一個：蜻蜓、蚱蜢、蟑螂、螳螂、竹節蟲、蟬、金龜子、獨角仙、鍬形蟲、瓢蟲、蝴蝶、蜜蜂、螞蟻、蒼蠅、蚊子]

🎯 辨識信心
[高 / 中 / 低]

若不是以上12種類群的昆蟲，回答「其他昆蟲」。若不是昆蟲，只寫「不是昆蟲」。不要加任何其他說明。`;
  }

  if (level <= 59) {
    return `你是專精台灣昆蟲的昆蟲學家。請辨識這張照片中的昆蟲，回答到「目」的層級。嚴格只輸出以下格式：

🐛 這是什麼？
[昆蟲常見中文名稱]

📍 分類
[目中文名 目學名]

🎯 辨識信心
[高 / 中 / 低]

不要加任何其他說明。若不是昆蟲，只寫「不是昆蟲」。`;
  }

  if (level <= 89) {
    return `你是專精台灣昆蟲的昆蟲學家。請辨識這張照片中的昆蟲，回答到「科」與「屬名」的層級。嚴格只輸出以下格式，不要有任何括弧、星號、或多餘符號：

🐛 這是什麼？
[昆蟲中文名稱]

📍 分類
[目中文名 Coleoptera > 科中文名 Scarabaeidae > 屬名]

🎯 辨識信心
[高 / 中 / 低]

規則：名稱欄只放中文名，不放學名。不要描述姿態或性別。若不是昆蟲，只寫「不是昆蟲」。`;
  }

  // Lv 90-100
  return `你是專精台灣昆蟲的資深昆蟲學家。請辨識這張照片中的昆蟲，給出完整學名。

【辨識原則】
1. 照片角度不限，從任何可見特徵辨識。
2. 能辨識到種就給種名，不確定就給科/屬，不要亂猜。
3. 所有分類名稱附上中文。
4. ${kb_note}

【台灣常見甲蟲知識庫】
▌金龜子總科（270種）：獨角仙（正確學名：Trypoxylus dichotomus，叉犀金龜屬）
▌鍬形蟲科（50種）：雄蟲大顎發達，體色多黑褐色
▌瓢蟲科（148種）：體圓半球形，鞘翅常具圓斑
▌天牛科：觸角超長，體型修長
▌虎甲蟲亞科（19種）：體色金屬光澤，大複眼
▌步行蟲科（515種）：體色多黑色，肉食性

嚴格只輸出以下格式，不要有任何括弧、星號、或多餘符號：

🐛 這是什麼？
[昆蟲中文名稱 學名不加任何符號]

📍 分類
[目中文名 目學名 > 科中文名 科學名 > 屬種學名]

🎯 辨識信心
[高 / 中 / 低]

規則：名稱欄學名直接接在中文後，不加括弧星號。不要描述姿態或性別。若不是昆蟲，只寫「不是昆蟲」。`;
}

const INSECT_PROMPT = getPromptByLevel(100); // default fallback

function callClaude(imageBase64, mimeType, kbExtra, level) {
  const basePrompt = getPromptByLevel(level || 100);
  const prompt = basePrompt + (kbExtra || '');
  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.content?.[0]?.text || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Set CORS headers on every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 辨識昆蟲
  if (req.method === 'POST' && req.url === '/api/identify') {
    if (!API_KEY) { json(res, 500, { error: '伺服器未設定 API Key' }); return; }
    try {
      const { image, mimeType, kbExtra, level } = await readBody(req);
      if (!image) throw new Error('缺少圖片資料');
      const result = await callClaude(image, mimeType || 'image/jpeg', kbExtra || '', level || 100);
      json(res, 200, { result });
    } catch(err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    json(res, 200, { status: 'ok', message: '昆蟲辨識伺服器運作中 🦋' });
    return;
  }

  // Debug endpoint
  if (req.method === 'GET' && req.url === '/debug') {
    json(res, 200, {
      hasKey: !!process.env.ANTHROPIC_API_KEY,
      keyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 15) + '...' : 'NOT SET',
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('ANTHROP') || k.includes('API') || k.includes('insect'))
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🦋 昆蟲辨識伺服器已啟動：port ${PORT}`);
  if (!API_KEY) console.warn('⚠️  警告：未設定 ANTHROPIC_API_KEY');
});
