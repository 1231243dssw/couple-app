'use strict';

/**
 * 情侣思念小程序 - 实时后端
 * - Express 提供 REST 接口（配对、统计、定时情话、日记、纪念日、打卡、愿望清单、旅游打卡、微信推送）
 * - ws 提供 WebSocket 实时通道（思念秒达、回抱、表情、心情、在线状态、双人猜拳）
 * - 定时器每分钟检查定时情话并推送给双方（含微信订阅消息）
 */

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const store = require('./store');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '12mb' })); // 照片 base64 可能较大

// ---------------- 微信相关（订阅消息推送） ----------------
const WX_APPID = process.env.WX_APPID || '';
const WX_APPSECRET = process.env.WX_APPSECRET || '';
let _tokenCache = { token: null, exp: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.exp) return _tokenCache.token;
  if (!WX_APPID || !WX_APPSECRET) return null;
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APPSECRET}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.access_token) {
      _tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 300) * 1000 };
      return j.access_token;
    }
  } catch (e) {}
  return null;
}

// 订阅消息内容模板字段（需与你在公众平台申请的模板字段一致：thing1/thing2/time3）
function buildPushData(content, name) {
  const d = new Date();
  const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return {
    thing1: { value: (content || '').slice(0, 20) },
    thing2: { value: (name || 'TA').slice(0, 10) },
    time3: { value: t },
  };
}

async function pushSubscribeMessage(openid, templateId, data) {
  if (!openid || !templateId) return false;
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: openid, template_id: templateId, data }),
    });
    const j = await r.json();
    return j && j.errcode === 0;
  } catch (e) { return false; }
}

// 触发对对方的微信推送（思念/回抱等）。一次性订阅用完后置回，前端需再次授权。
function tryPushToPartner(code, fromWho, content) {
  const room = store.getRoom(code);
  if (!room) return;
  const partner = fromWho === 'A' ? 'B' : 'A';
  const p = room.push[partner];
  if (!p || !p.granted) return;
  const openid = room.openid[partner];
  const tmpl = p.tmpl;
  const name = fromWho === 'A' ? room.nameA : room.nameB;
  pushSubscribeMessage(openid, tmpl, buildPushData(content, name)).then((ok) => {
    if (ok) store.consumePush(code, partner);
  });
}

// ---------------- 内存房间在线状态 ----------------
const presence = {};
function wsOf(code, who) { return presence[code] && presence[code][who]; }
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function other(who) { return who === 'A' ? 'B' : 'A'; }
function broadcastToOther(code, fromWho, payload) {
  const target = wsOf(code, other(fromWho));
  if (target) send(target, payload);
}
function broadcastRoom(code, payload, exceptWho) {
  const room = presence[code];
  if (!room) return;
  ['A', 'B'].forEach(who => {
    if (who === exceptWho) return;
    const ws = room[who];
    if (ws) send(ws, payload);
  });
}

// 双人猜拳临时状态
const rpsChoices = {};

// ---------------- REST ----------------
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), pushEnabled: !!(WX_APPID && WX_APPSECRET) }));

app.post('/api/room/create', (req, res) => {
  const { name, userId } = req.body || {};
  const room = store.createRoom(name || '我');
  if (!presence[room.code]) presence[room.code] = { A: null, B: null };
  res.json({ ok: true, code: room.code, room: publicRoom(room, 'A'), userId: userId || null });
});

app.post('/api/room/join', (req, res) => {
  const { code, name, userId } = req.body || {};
  const room = store.getRoom(code);
  if (!room) return res.json({ ok: false, error: '邀请码不存在或已失效' });
  const updated = store.joinRoom(code, name || 'TA');
  if (!presence[code]) presence[code] = { A: null, B: null };
  res.json({ ok: true, room: publicRoom(updated, 'B'), userId: userId || null });
});

app.get('/api/room/:code/state', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.json({ ok: false, error: 'not found' });
  const who = req.query.who === 'B' ? 'B' : 'A';
  res.json({ ok: true, room: publicRoom(room, who), stats: store.getStats(req.params.code) });
});

app.get('/api/stats/:code', (req, res) => {
  const stats = store.getStats(req.params.code);
  if (!stats) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, stats });
});

// 恋爱起始日
app.post('/api/room/:code/together', (req, res) => {
  const { ts } = req.body || {};
  const room = store.setTogetherSince(req.params.code, ts ? Number(ts) : null);
  if (!room) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, room: publicRoom(room, 'A') });
});

// ---------------- 定时情话（支持未来日期 + 重复） ----------------
app.get('/api/schedule/:code', (req, res) => {
  res.json({ ok: true, list: store.getSchedules(req.params.code) });
});
app.post('/api/schedule', (req, res) => {
  const { code, text, time, createdBy, date, repeat, weekday } = req.body || {};
  if (!code || !text || !time) return res.json({ ok: false, error: '缺少参数' });
  const item = store.addSchedule(code, text, time, createdBy || 'A', { date, repeat, weekday });
  res.json({ ok: true, item });
});
app.put('/api/schedule', (req, res) => {
  const { id, patch } = req.body || {};
  const item = store.updateSchedule(id, patch || {});
  res.json({ ok: !!item, item });
});
app.delete('/api/schedule/:id', (req, res) => {
  res.json({ ok: store.deleteSchedule(req.params.id) });
});

// ---------------- 日记 / 未来信件 ----------------
app.get('/api/diary/:code', (req, res) => {
  res.json({ ok: true, list: store.getDiaries(req.params.code) });
});
app.post('/api/diary', (req, res) => {
  const { code, title, body, from, type } = req.body || {};
  if (!code) return res.json({ ok: false, error: '缺少 code' });
  const item = store.addDiary(code, title, body, from || 'A', type || 'diary');
  const room = store.getRoom(code);
  if (room) broadcastToOther(code, from === 'B' ? 'B' : 'A', { type: 'diary_new', id: item.id, from: from || 'A', type2: item.type });
  res.json({ ok: true, item });
});
app.post('/api/diary/read', (req, res) => {
  const { code, id, who } = req.body || {};
  const item = store.markDiaryRead(code, id, who || 'A');
  res.json({ ok: !!item, item });
});

// ---------------- 纪念日 / 倒数日 ----------------
app.get('/api/anni/:code', (req, res) => res.json({ ok: true, list: store.getAnniversaries(req.params.code) }));
app.post('/api/anni', (req, res) => {
  const { code, title, date, type, createdBy } = req.body || {};
  if (!code || !title || !date) return res.json({ ok: false, error: '缺少参数' });
  res.json({ ok: true, item: store.addAnniversary(code, title, date, type, createdBy || 'A') });
});
app.put('/api/anni', (req, res) => {
  const { id, patch } = req.body || {};
  res.json({ ok: !!store.updateAnniversary(id, patch || {}) });
});
app.delete('/api/anni/:id', (req, res) => res.json({ ok: store.deleteAnniversary(req.params.id) }));

// ---------------- 每日打卡 + 连续天数 ----------------
app.post('/api/checkin', (req, res) => {
  const { code, who } = req.body || {};
  if (!code || !who) return res.json({ ok: false, error: '缺少参数' });
  const c = store.checkin(code, who === 'B' ? 'B' : 'A');
  res.json({ ok: true, checkin: c, info: store.getCheckin(code) });
});
app.get('/api/checkin/:code', (req, res) => {
  const info = store.getCheckin(req.params.code);
  if (!info) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, info });
});

// ---------------- 共享愿望清单 ----------------
app.get('/api/wish/:code', (req, res) => res.json({ ok: true, list: store.getWishes(req.params.code) }));
app.post('/api/wish', (req, res) => {
  const { code, text, by } = req.body || {};
  if (!code || !text) return res.json({ ok: false, error: '缺少参数' });
  res.json({ ok: true, item: store.addWish(code, text, by || 'A') });
});
app.put('/api/wish', (req, res) => {
  const { id, patch } = req.body || {};
  res.json({ ok: !!store.updateWish(id, patch || {}) });
});
app.delete('/api/wish/:id', (req, res) => res.json({ ok: store.deleteWish(req.params.id) }));

// ---------------- 旅游打卡（定位 + 照片） ----------------
app.get('/api/travel/:code', (req, res) => res.json({ ok: true, list: store.getTravels(req.params.code) }));
app.post('/api/travel', (req, res) => {
  const { code, who, lat, lng, name, note, photo } = req.body || {};
  if (!code) return res.json({ ok: false, error: '缺少 code' });
  const item = store.addTravel(code, who === 'B' ? 'B' : 'A', lat, lng, name, note, photo);
  const room = store.getRoom(code);
  if (room) broadcastToOther(code, who === 'B' ? 'B' : 'A', { type: 'travel_new', id: item.id });
  res.json({ ok: true, item });
});
app.delete('/api/travel/:id', (req, res) => res.json({ ok: store.deleteTravel(req.params.id) }));
// 照片静态服务
app.get('/photos/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const fp = path.join(store.getPhotosDir(), f);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  res.sendFile(fp);
});

// ---------------- 微信登录 & 订阅授权 ----------------
app.post('/api/wx/login', async (req, res) => {
  const { code, who, roomCode } = req.body || {};
  if (!WX_APPID || !WX_APPSECRET) return res.json({ ok: false, error: '服务端未配置 AppSecret' });
  if (!code || !roomCode) return res.json({ ok: false, error: '缺少 code/roomCode' });
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_APPSECRET}&js_code=${code}&grant_type=authorization_code`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.openid) {
      store.setOpenid(roomCode, who === 'B' ? 'B' : 'A', j.openid);
      res.json({ ok: true, openid: j.openid });
    } else {
      res.json({ ok: false, error: j.errmsg || '登录失败' });
    }
  } catch (e) {
    res.json({ ok: false, error: '登录请求异常' });
  }
});
app.post('/api/wx/subscribe', (req, res) => {
  const { code, who, templateId } = req.body || {};
  if (!code || !who) return res.json({ ok: false, error: '缺少参数' });
  const p = store.grantPush(code, who === 'B' ? 'B' : 'A', templateId || '');
  res.json({ ok: true, push: p });
});

// ---------------- 专属信物 & 爱意卡片 ----------------
app.get('/api/room/:code/token', async (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.json({ ok: false, error: 'not found' });
  const payload = `couple-token://${room.code}/${room.secret}`;
  try {
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 480 });
    res.json({ ok: true, secret: room.secret, qr });
  } catch (e) {
    res.json({ ok: false, error: 'qr failed' });
  }
});
app.get('/api/cards', (req, res) => res.json({ ok: true, deck: store.getCardDeck() }));
app.get('/api/room/:code/cards', (req, res) => {
  const who = req.query.who === 'B' ? 'B' : 'A';
  const data = store.getCollected(req.params.code, who);
  if (!data) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, ...data });
});
app.post('/api/room/:code/unlock', (req, res) => {
  const { who, token } = req.body || {};
  const room = store.getRoom(req.params.code);
  if (!room) return res.json({ ok: false, error: 'not found' });
  const m = /^couple-token:\/\/([^/]+)\/(.+)$/.exec(token || '');
  if (!m || m[1] !== room.code || m[2] !== room.secret) {
    return res.json({ ok: false, error: 'invalid_token' });
  }
  const result = store.unlockCard(req.params.code, who === 'B' ? 'B' : 'A');
  if (result.done) return res.json({ ok: true, done: true });
  if (result.error) return res.json({ ok: false, error: result.error });
  const fromName = who === 'B' ? room.nameB : room.nameA;
  broadcastToOther(req.params.code, who === 'B' ? 'B' : 'A', { type: 'card_unlocked', from: who === 'B' ? 'B' : 'A', fromName, card: result.card });
  res.json({ ok: true, card: result.card });
});

// 情话库
const QUOTES = [
  '想你的时候，风都变得温柔。',
  '即使不在身边，你也是我每天的偏爱。',
  '今天的云很像你笑起来的样子。',
  '我把思念折成星星，藏进每一个梦里。',
  '世界很大，但我的眼里只有你。',
  '你是我所有温柔的来处。',
  '距离只是让想念更有重量的理由。',
  '今天也要好好吃饭，照顾好自己，等我。',
  '你一笑，我就忘了所有烦恼。',
  '无论多远，我的心都朝着你的方向。',
  '想见你，是今天最强烈的愿望。',
  '你是我平淡日子里最亮的星光。',
  '每一秒的想念，都是因为太喜欢你。',
  '希望今晚的梦里，有你。',
  '你是我想要共度余生的人。',
];
app.get('/api/quote/random', (req, res) => res.json({ ok: true, text: QUOTES[Math.floor(Math.random() * QUOTES.length)] }));
app.get('/api/quotes', (req, res) => res.json({ ok: true, list: QUOTES }));

function publicRoom(room, who) {
  return {
    code: room.code,
    nameA: room.nameA,
    nameB: room.nameB,
    bound: room.bound,
    createdAt: room.createdAt,
    me: who,
    myName: who === 'A' ? room.nameA : room.nameB,
    partnerName: who === 'A' ? room.nameB : room.nameA,
    online: { A: !!(presence[room.code] && presence[room.code].A), B: !!(presence[room.code] && presence[room.code].B) },
    togetherSince: room.togetherSince,
    pushEnabled: !!(WX_APPID && WX_APPSECRET),
  };
}

// ---------------- WebSocket ----------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const who = url.searchParams.get('who') === 'B' ? 'B' : 'A';
  const userId = url.searchParams.get('userId') || null;

  if (!code || !store.getRoom(code)) {
    send(ws, { type: 'error', error: '房间不存在' });
    ws.close();
    return;
  }
  if (!presence[code]) presence[code] = { A: null, B: null };
  presence[code][who] = ws;
  store.touch(code, who);

  broadcastRoom(code, { type: 'presence', online: { A: !!presence[code].A, B: !!presence[code].B } });

  send(ws, { type: 'welcome', who, room: publicRoom(store.getRoom(code), who), stats: store.getStats(code) });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    handleMessage(code, who, msg, ws);
  });

  ws.on('close', () => {
    if (presence[code] && presence[code][who] === ws) {
      presence[code][who] = null;
      broadcastRoom(code, { type: 'presence', online: { A: !!presence[code].A, B: !!presence[code].B } });
    }
  });
});

function handleMessage(code, who, msg, ws) {
  store.touch(code, who);
  switch (msg.type) {
    case 'miss': {
      const room = store.addMiss(code, who);
      const stats = store.getStats(code);
      broadcastToOther(code, who, { type: 'miss_incoming', from: who, fromName: room[who === 'A' ? 'nameA' : 'nameB'], ts: Date.now(), stats });
      broadcastRoom(code, { type: 'stats', stats });
      tryPushToPartner(code, who, 'TA 想你了 💗');
      break;
    }
    case 'hug': {
      const room = store.addHug(code, who);
      broadcastToOther(code, who, { type: 'hug_incoming', from: who, fromName: room[who === 'A' ? 'nameA' : 'nameB'], ts: Date.now() });
      tryPushToPartner(code, who, 'TA 给你一个抱抱 🤗');
      break;
    }
    case 'react': {
      broadcastToOther(code, who, { type: 'react_incoming', from: who, emoji: msg.emoji, ts: Date.now() });
      break;
    }
    case 'mood': {
      store.addMood(code, who, msg.mood, msg.note);
      broadcastToOther(code, who, { type: 'mood_incoming', from: who, mood: msg.mood, note: msg.note, ts: Date.now() });
      break;
    }
    case 'rps': {
      if (!rpsChoices[code]) rpsChoices[code] = {};
      rpsChoices[code][who] = msg.choice;
      const rc = rpsChoices[code];
      if (rc.A && rc.B) {
        const win = rpsWin(rc.A, rc.B);
        broadcastRoom(code, { type: 'rps_result', a: rc.A, b: rc.B, winner: win });
        rpsChoices[code] = {};
      } else {
        broadcastToOther(code, who, { type: 'rps_wait', from: who });
      }
      break;
    }
    case 'ping': {
      send(ws, { type: 'pong', ts: Date.now() });
      break;
    }
    default:
      break;
  }
}

function rpsWin(a, b) {
  if (a === b) return 'tie';
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  return beats[a] === b ? 'A' : 'B';
}

// ---------------- 定时情话调度（含微信推送） ----------------
function scheduleTick() {
  const now = new Date();
  const db = store._raw();
  for (const code in db.schedules) {
    for (const s of db.schedules[code]) {
      if (!store.shouldFireSchedule(s, now)) continue;
      store.markScheduleSent(s, now);
      const payload = { type: 'scheduled', id: s.id, text: s.text, time: s.time, ts: Date.now() };
      broadcastRoom(code, payload);
      // 微信订阅消息推送（若双方已授权）
      const room = store.getRoom(code);
      if (room) {
        ['A', 'B'].forEach(w => {
          const p = room.push[w];
          if (p && p.granted) {
            pushSubscribeMessage(room.openid[w], p.tmpl, buildPushData(s.text, w === 'A' ? room.nameA : room.nameB))
              .then(ok => { if (ok) store.consumePush(code, w); });
          }
        });
      }
    }
  }
  store.flush();
}
setInterval(scheduleTick, 30 * 1000);
scheduleTick();

server.listen(PORT, '0.0.0.0', () => {
  console.log('❤️  情侣思念后端已启动: http://0.0.0.0:' + PORT);
  console.log('   WebSocket: ws://0.0.0.0:' + PORT + '/ws');
  console.log('   微信推送: ' + (WX_APPID && WX_APPSECRET ? '已启用' : '未配置(AppSecret 缺失)'));
});
