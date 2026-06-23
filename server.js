const https = require('https');
const http = require('http');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

const INSECT_PROMPT = `你是專精台灣昆蟲的資深昆蟲學家。請辨識這張照片中的昆蟲。

【辨識原則】
1. 照片角度不限：正面、背面、腹面、側面、展翅、飛行中、局部特寫皆可，不要因角度非標準圖鑑角度而放棄。
2. 展翅照片：腹部、後翅膜翅、足都是重要特徵，請善加利用。
3. 優先從最顯眼的特徵切入（角突、體色、斑紋、體型），再對照分類確認。
4. 獨角仙展翅時可見三叉角（頭角＋胸角）、琥珀色膜翅、黑褐色鞘翅。

【台灣常見甲蟲知識庫】
▌金龜子總科（270種）：獨角仙、花金龜、糞金龜等，觸角鰓葉狀
▌鍬形蟲科（50種）：雄蟲大顎發達，體色多黑褐色
▌瓢蟲科（148種）：體圓半球形，鞘翅常具圓斑
▌天牛科：觸角超長，體型修長
▌虎甲蟲亞科（19種）：體色金屬光澤，大複眼，行動迅速
▌步行蟲科（515種）：體色多黑色，大顎發達，肉食性
▌金花蟲科：體色鮮豔具金屬光澤，植食性
▌象鼻蟲科：頭部延伸成象鼻狀口器

請以繁體中文用簡單易懂的方式回答（7歲小朋友也能看懂），格式如下：

🐛 這是什麼？
[昆蟲中文名稱]

📍 分類
[目 > 科]

✨ 特徵
[2句話描述外觀，生動有趣]

🌿 在哪裡找到牠？
[台灣的棲地或常見環境，1句話]

🎯 辨識信心
[高 / 中 / 低]

若圖片不是昆蟲或完全無法判斷，請友善說明。`;

function callClaude(imageBase64, mimeType) {
  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: INSECT_PROMPT }
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
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 辨識昆蟲
  if (req.method === 'POST' && req.url === '/api/identify') {
    if (!API_KEY) { json(res, 500, { error: '伺服器未設定 API Key' }); return; }
    try {
      const { image, mimeType } = await readBody(req);
      if (!image) throw new Error('缺少圖片資料');
      const result = await callClaude(image, mimeType || 'image/jpeg');
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
