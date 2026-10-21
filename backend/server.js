'use strict';

/**
 * 情侣思念小程序 - 实时后端
 * - Express 提供 REST 接口（配对、统计、定时情话、日记）
 * - ws 提供 WebSocket 实时通道（思念秒达、回抱、表情、心情、在线状态）
 * - 定时器每分钟检查定时情话并推送给双方
 */

const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const store = require('./store');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// 简单内存房间 -> 在线连接映射（仅运行时，重启即清空在线状态）
// key: code -> { A: ws|null, B: ws|null }
const presence = {};

function wsOf(code, who) {
  return presence[code] && presence[code][who];
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

function other(who) {
  return who === 'A' ? 'B' : 'A';
}

// 广播给房间里另一个人
function broadcastToOther(code, fromWho, payload) {
  const target = wsOf(code, other(fromWho));
  if (target) send(target, payload);
}

// 广播给房间所有人（含自己，用于同步状态）
function broadcastRoom(code, payload, exceptWho) {
  const room = presence[code];
  if (!room) return;
  ['A', 'B'].forEach(who => {
    if (who === exceptWho) return;
    const ws = room[who];
    if (ws) send(ws, payload);
  });
}

// ---------------- REST ----------------
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 创建房间（发起方 A）
app.post('/api/room/create', (req, res) => {
  const { name, userId } = req.body || {};
  const room = store.createRoom(name || '我');
  if (!presence[room.code]) presence[room.code] = { A: null, B: null };
  res.json({ ok: true, code: room.code, room: publicRoom(room, 'A'), userId: userId || null });
});

// 加入房间（受邀方 B）
app.post('/api/room/join', (req, res) => {
  const { code, name, userId } = req.body || {};
  const room = store.getRoom(code);
  if (!room) return res.json({ ok: false, error: '邀请码不存在或已失效' });
  const updated = store.joinRoom(code, name || 'TA');
  if (!presence[code]) presence[code] = { A: null, B: null };
  res.json({ ok: true, room: publicRoom(updated, 'B'), userId: userId || null });
});

// 获取房间公开状态
app.get('/api/room/:code/state', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.json({ ok: false, error: 'not found' });
  const who = req.query.who === 'B' ? 'B' : 'A';
  res.json({ ok: true, room: publicRoom(room, who), stats: store.getStats(req.params.code) });
});

// 统计
app.get('/api/stats/:code', (req, res) => {
  const stats = store.getStats(req.params.code);
  if (!stats) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, stats });
});

// 定时情话
app.get('/api/schedule/:code', (req, res) => {
  res.json({ ok: true, list: store.getSchedules(req.params.code) });
});
app.post('/api/schedule', (req, res) => {
  const { code, text, time, createdBy } = req.body || {};
  if (!code || !text || !time) return res.json({ ok: false, error: '缺少参数' });
  const item = store.addSchedule(code, text, time, createdBy || 'A');
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

// 日记 / 未来信件
app.get('/api/diary/:code', (req, res) => {
  res.json({ ok: true, list: store.getDiaries(req.params.code) });
});
app.post('/api/diary', (req, res) => {
  const { code, title, body, from, type } = req.body || {};
  if (!code) return res.json({ ok: false, error: '缺少 code' });
  const item = store.addDiary(code, title, body, from || 'A', type || 'diary');
  // 实时通知对方有新的信件/日记
  const room = store.getRoom(code);
  if (room) {
    broadcastToOther(code, from === 'B' ? 'B' : 'A', {
      type: 'diary_new', id: item.id, from: from || 'A', type2: item.type,
    });
  }
  res.json({ ok: true, item });
});
app.post('/api/diary/read', (req, res) => {
  const { code, id, who } = req.body || {};
  const item = store.markDiaryRead(code, id, who || 'A');
  res.json({ ok: !!item, item });
});

// ---------------- 专属信物 & 爱意卡片 ----------------
// 生成专属信物码（二维码），仅房间成员可获取
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

// 卡片牌库
app.get('/api/cards', (req, res) => {
  res.json({ ok: true, deck: store.getCardDeck() });
});

// 某人已收集的卡片
app.get('/api/room/:code/cards', (req, res) => {
  const who = req.query.who === 'B' ? 'B' : 'A';
  const data = store.getCollected(req.params.code, who);
  if (!data) return res.json({ ok: false, error: 'not found' });
  res.json({ ok: true, ...data });
});

// 扫码解锁一张卡片
app.post('/api/room/:code/unlock', (req, res) => {
  const { who, token } = req.body || {};
  const room = store.getRoom(req.params.code);
  if (!room) return res.json({ ok: false, error: 'not found' });
  // 校验信物码
  const m = /^couple-token:\/\/([^/]+)\/(.+)$/.exec(token || '');
  if (!m || m[1] !== room.code || m[2] !== room.secret) {
    return res.json({ ok: false, error: 'invalid_token' });
  }
  const result = store.unlockCard(req.params.code, who === 'B' ? 'B' : 'A');
  if (result.done) return res.json({ ok: true, done: true });
  if (result.error) return res.json({ ok: false, error: result.error });

  // 实时通知对方
  const fromName = who === 'B' ? room.nameB : room.nameA;
  broadcastToOther(req.params.code, who === 'B' ? 'B' : 'A', {
    type: 'card_unlocked',
    from: who === 'B' ? 'B' : 'A',
    fromName,
    card: result.card,
  });
  res.json({ ok: true, card: result.card });
});

// 一个内置情话库，供小程序随机获取
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
app.get('/api/quote/random', (req, res) => {
  res.json({ ok: true, text: QUOTES[Math.floor(Math.random() * QUOTES.length)] });
});
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
    online: {
      A: !!(presence[room.code] && presence[room.code].A),
      B: !!(presence[room.code] && presence[room.code].B),
    },
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

  // 通知双方在线状态变化
  broadcastRoom(code, { type: 'presence', online: { A: !!presence[code].A, B: !!presence[code].B } });

  send(ws, {
    type: 'welcome',
    who,
    room: publicRoom(store.getRoom(code), who),
    stats: store.getStats(code),
  });

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
      // 告诉对方：有人想你了（携带对方姓名）
      broadcastToOther(code, who, {
        type: 'miss_incoming',
        from: who,
        fromName: room[who === 'A' ? 'nameA' : 'nameB'],
        ts: Date.now(),
        stats,
      });
      // 同步最新统计给双方
      broadcastRoom(code, { type: 'stats', stats });
      break;
    }
    case 'hug': {
      const room = store.addHug(code, who);
      broadcastToOther(code, who, {
        type: 'hug_incoming',
        from: who,
        fromName: room[who === 'A' ? 'nameA' : 'nameB'],
        ts: Date.now(),
      });
      break;
    }
    case 'react': {
      // 表情互动
      broadcastToOther(code, who, {
        type: 'react_incoming',
        from: who,
        emoji: msg.emoji,
        ts: Date.now(),
      });
      break;
    }
    case 'mood': {
      store.addMood(code, who, msg.mood, msg.note);
      broadcastToOther(code, who, {
        type: 'mood_incoming',
        from: who,
        mood: msg.mood,
        note: msg.note,
        ts: Date.now(),
      });
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

// ---------------- 定时情话调度 ----------------
// 每分钟检查：若当前 HH:MM 与某条启用定时一致，且今天尚未发送，则推送给双方
function scheduleTick() {
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const todayKey = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  const db = store._raw();
  for (const code in db.schedules) {
    for (const s of db.schedules[code]) {
      if (s.deleted || !s.enabled) continue;
      if (s.time === hhmm && s.lastSentDate !== todayKey) {
        s.lastSentDate = todayKey;
        // 推送
        const payload = {
          type: 'scheduled',
          id: s.id,
          text: s.text,
          time: s.time,
          ts: Date.now(),
        };
        broadcastRoom(code, payload);
      }
    }
  }
  // 写盘（标记 lastSentDate 需要持久化）
  store.flush();
}
setInterval(scheduleTick, 30 * 1000);
// 立即跑一次，避免启动后等待
scheduleTick();

server.listen(PORT, '0.0.0.0', () => {
  console.log('❤️  情侣思念后端已启动: http://0.0.0.0:' + PORT);
  console.log('   WebSocket: ws://0.0.0.0:' + PORT + '/ws');
});

module.exports = { app, server };
