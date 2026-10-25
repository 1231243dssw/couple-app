'use strict';

/**
 * 轻量数据持久化层
 * 使用 JSON 文件存储，避免引入数据库原生依赖。
 * 房间(room)、定时情话(schedule)、日记(diary)、纪念日(anniversary)、
 * 愿望清单(wishlist)、旅游打卡(travel) 均落盘。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 数据目录：默认 ./data，部署到 Railway/Render 时挂卷到 /data 即可持久化
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function ensurePhotosDir() {
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return { rooms: {}, schedules: {}, diaries: {}, anniversaries: {}, wishlist: {}, travel: {} };
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      rooms: parsed.rooms || {},
      schedules: parsed.schedules || {},
      diaries: parsed.diaries || {},
      anniversaries: parsed.anniversaries || {},
      wishlist: parsed.wishlist || {},
      travel: parsed.travel || {},
    };
  } catch (e) {
    // 文件损坏则备份后重建
    const backup = DATA_FILE + '.bak.' + Date.now();
    try { fs.copyFileSync(DATA_FILE, backup); } catch (_) {}
    return { rooms: {}, schedules: {}, diaries: {}, anniversaries: {}, wishlist: {}, travel: {} };
  }
}

let db = load();
migrate();

// 老房间（旧版 store 创建）补齐新增字段，避免读不到 undefined 字段报错
function migrate() {
  let changed = false;
  for (const code in db.rooms) {
    const r = db.rooms[code];
    if (!r.openid) { r.openid = { A: null, B: null }; changed = true; }
    if (!r.push) { r.push = { A: { granted: false, tmpl: '' }, B: { granted: false, tmpl: '' } }; changed = true; }
    if (typeof r.togetherSince === 'undefined') { r.togetherSince = null; changed = true; }
    if (!r.checkins) { r.checkins = { A: { last: null, streak: 0 }, B: { last: null, streak: 0 } }; changed = true; }
    else {
      if (!r.checkins.A) r.checkins.A = { last: null, streak: 0 };
      if (!r.checkins.B) r.checkins.B = { last: null, streak: 0 };
    }
  }
  if (changed) persist();
}

function persist() {
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function uid(prefix) {
  return (prefix || '') + crypto.randomBytes(6).toString('hex');
}

function keyOf(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// 周一为基准的周键（同一周内相同）
function mondayKey(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return keyOf(x);
}

// ---------------- Rooms ----------------
function getRoom(code) {
  return db.rooms[code] || null;
}

function createRoom(nameA) {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 位邀请码
  } while (db.rooms[code]);
  const room = {
    code,
    nameA: nameA || '我',
    nameB: null,
    bound: false,
    createdAt: Date.now(),
    secret: crypto.randomBytes(6).toString('hex'), // 专属信物密钥
    miss: { A: 0, B: 0 },          // 各自发送思念次数
    totalMiss: 0,
    history: [],                   // { from:'A'|'B', ts }
    hugs: { A: 0, B: 0 },
    moods: [],                     // { from, mood, ts, note }
    collected: { A: [], B: [] },   // 各自收集到的爱意卡片 id
    lastActive: { A: 0, B: 0 },
    // 新增：微信相关
    openid: { A: null, B: null },               // 各自微信 openid
    push: { A: { granted: false, tmpl: '' }, B: { granted: false, tmpl: '' } }, // 订阅消息授权状态
    togetherSince: null,                        // 恋爱起始日(ts)，用于恋爱天数
    checkins: {                                  // 每日打卡连续天数
      A: { last: null, streak: 0 },
      B: { last: null, streak: 0 },
    },
  };
  db.rooms[code] = room;
  persist();
  return room;
}

function joinRoom(code, nameB) {
  const room = db.rooms[code];
  if (!room) return null;
  room.nameB = nameB || 'TA';
  room.bound = true;
  room.lastActive.B = Date.now();
  persist();
  return room;
}

function touch(code, who) {
  const room = db.rooms[code];
  if (!room) return;
  room.lastActive[who] = Date.now();
  persist();
}

// 微信登录后写入 openid
function setOpenid(code, who, openid) {
  const room = db.rooms[code];
  if (!room) return null;
  room.openid[who] = openid;
  persist();
  return room;
}
function getOpenid(code, who) {
  const room = db.rooms[code];
  return room ? room.openid[who] : null;
}

// 记录订阅消息授权（前端 wx.requestSubscribeMessage 成功后调用）
function grantPush(code, who, tmpl) {
  const room = db.rooms[code];
  if (!room) return null;
  room.push[who] = { granted: true, tmpl: tmpl || '' };
  persist();
  return room.push[who];
}
// 消费一次授权（推送后调用），一次性订阅用完后置回 false，前端需再次请求授权
function consumePush(code, who) {
  const room = db.rooms[code];
  if (!room) return false;
  if (room.push[who] && room.push[who].granted) {
    room.push[who].granted = false;
    persist();
    return true;
  }
  return false;
}

function setTogetherSince(code, ts) {
  const room = db.rooms[code];
  if (!room) return null;
  room.togetherSince = ts;
  persist();
  return room;
}

function addMiss(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  room.miss[who] = (room.miss[who] || 0) + 1;
  room.totalMiss += 1;
  room.history.push({ from: who, ts: Date.now() });
  if (room.history.length > 500) room.history = room.history.slice(-500);
  persist();
  return room;
}

function addHug(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  room.hugs[who] = (room.hugs[who] || 0) + 1;
  persist();
  return room;
}

function addMood(code, who, mood, note) {
  const room = db.rooms[code];
  if (!room) return null;
  room.moods.push({ from: who, mood, note: note || '', ts: Date.now() });
  if (room.moods.length > 300) room.moods = room.moods.slice(-300);
  persist();
  return room;
}

// 统计：连续天数(streak)、日均、今日次数等
function getStats(code) {
  const room = db.rooms[code];
  if (!room) return null;
  const history = room.history;
  const total = room.totalMiss;
  const days = Math.max(1, Math.ceil((Date.now() - room.createdAt) / 86400000));
  const avgPerDay = +(total / days).toFixed(2);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCount = history.filter(h => h.ts >= startOfToday.getTime()).length;

  const daySet = new Set(history.map(h => keyOf(new Date(h.ts))));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!daySet.has(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(keyOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = keyOf(d);
    const c = history.filter(h => keyOf(new Date(h.ts)) === k).length;
    last14.push({ date: (d.getMonth() + 1) + '/' + d.getDate(), count: c });
  }

  let loveDays = 0;
  if (room.togetherSince) {
    loveDays = Math.max(0, Math.floor((Date.now() - room.togetherSince) / 86400000) + 1);
  }

  return {
    total,
    avgPerDay,
    todayCount,
    streak,
    days,
    loveDays,
    byWho: { A: room.miss.A, B: room.miss.B },
    hugs: room.hugs,
    last14,
  };
}

// ---------------- Schedules（定时情话，支持未来日期 + 重复） ----------------
function getSchedules(code) {
  return (db.schedules[code] || []).filter(s => !s.deleted);
}

function addSchedule(code, text, time, createdBy, opts) {
  if (!db.schedules[code]) db.schedules[code] = [];
  opts = opts || {};
  const item = {
    id: uid('s_'),
    code,
    text,
    time,                 // "HH:MM"
    createdBy: createdBy || 'A',
    createdAt: Date.now(),
    enabled: true,
    date: opts.date || null,            // "YYYY-MM-DD" 指定日期；为空表示按 repeat 重复
    repeat: opts.repeat || 'none',      // none | daily | weekly
    weekday: (opts.weekday != null) ? opts.weekday : null, // 0-6，weekly 时用
    lastSentKey: null,
    sentOnce: false,
    deleted: false,
  };
  db.schedules[code].push(item);
  persist();
  return item;
}

function updateSchedule(id, patch) {
  for (const code in db.schedules) {
    const list = db.schedules[code];
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) {
      list[idx] = Object.assign(list[idx], patch);
      persist();
      return list[idx];
    }
  }
  return null;
}

function deleteSchedule(id) {
  for (const code in db.schedules) {
    const list = db.schedules[code];
    const idx = list.findIndex(s => s.id === id);
    if (idx >= 0) {
      list[idx].deleted = true;
      persist();
      return true;
    }
  }
  return false;
}

// 判断是否应在当前时刻触发（供定时器调用）
function shouldFireSchedule(s, now) {
  if (!s.enabled || s.deleted) return false;
  if (s.time !== hhmm(now)) return false;
  const todayKey = keyOf(now);
  if (s.repeat === 'daily') {
    return s.lastSentKey !== todayKey;
  }
  if (s.repeat === 'weekly') {
    const wd = now.getDay();
    if (s.weekday != null && s.weekday !== wd) return false;
    return s.lastSentKey !== ('W' + wd + ':' + mondayKey(now));
  }
  // 指定日期（一次性）
  if (s.date) {
    return s.date === todayKey && !s.sentOnce;
  }
  return false;
}
function markScheduleSent(s, now) {
  const todayKey = keyOf(now);
  if (s.repeat === 'daily') {
    s.lastSentKey = todayKey;
  } else if (s.repeat === 'weekly') {
    s.lastSentKey = 'W' + now.getDay() + ':' + mondayKey(now);
  } else if (s.date) {
    s.sentOnce = true;
  }
  persist();
}

// ---------------- Diaries（恋爱日记 / 未来信件） ----------------
function getDiaries(code) {
  return (db.diaries[code] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
}

function addDiary(code, title, body, from, type) {
  if (!db.diaries[code]) db.diaries[code] = [];
  const item = {
    id: uid('d_'),
    code,
    title: title || '',
    body: body || '',
    from: from || 'A',
    type: type || 'diary',  // diary | letter(未来信件)
    createdAt: Date.now(),
    readBy: [],
  };
  db.diaries[code].push(item);
  persist();
  return item;
}

function markDiaryRead(code, id, who) {
  const list = db.diaries[code] || [];
  const item = list.find(d => d.id === id);
  if (item && !item.readBy.includes(who)) {
    item.readBy.push(who);
    persist();
  }
  return item || null;
}

// ---------------- 纪念日 / 倒数日 ----------------
function getAnniversaries(code) {
  return (db.anniversaries[code] || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}
function addAnniversary(code, title, date, type, createdBy) {
  if (!db.anniversaries[code]) db.anniversaries[code] = [];
  const item = { id: uid('a_'), code, title, date, type: type || 'normal', createdBy: createdBy || 'A', createdAt: Date.now() };
  db.anniversaries[code].push(item);
  persist();
  return item;
}
function updateAnniversary(id, patch) {
  for (const code in db.anniversaries) {
    const list = db.anniversaries[code];
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) { list[idx] = Object.assign(list[idx], patch); persist(); return list[idx]; }
  }
  return null;
}
function deleteAnniversary(id) {
  for (const code in db.anniversaries) {
    const list = db.anniversaries[code];
    const idx = list.findIndex(a => a.id === id);
    if (idx >= 0) { list.splice(idx, 1); persist(); return true; }
  }
  return false;
}

// ---------------- 每日打卡 + 连续天数 ----------------
function checkin(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  const today = keyOf(new Date());
  const c = room.checkins[who];
  if (c.last === today) return c; // 今天已打卡
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (c.last === keyOf(y)) c.streak = (c.streak || 0) + 1;
  else c.streak = 1;
  c.last = today;
  persist();
  return c;
}
function getCheckin(code) {
  const room = db.rooms[code];
  if (!room) return null;
  return {
    A: room.checkins.A,
    B: room.checkins.B,
    loveDays: room.togetherSince ? Math.max(0, Math.floor((Date.now() - room.togetherSince) / 86400000) + 1) : 0,
    togetherSince: room.togetherSince,
  };
}

// ---------------- 共享愿望清单 ----------------
function getWishes(code) {
  return (db.wishlist[code] || []).slice().sort((a, b) => a.createdAt - b.createdAt);
}
function addWish(code, text, by) {
  if (!db.wishlist[code]) db.wishlist[code] = [];
  const item = { id: uid('w_'), code, text, done: false, by: by || 'A', createdAt: Date.now() };
  db.wishlist[code].push(item);
  persist();
  return item;
}
function updateWish(id, patch) {
  for (const code in db.wishlist) {
    const list = db.wishlist[code];
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) { list[idx] = Object.assign(list[idx], patch); persist(); return list[idx]; }
  }
  return null;
}
function deleteWish(id) {
  for (const code in db.wishlist) {
    const list = db.wishlist[code];
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) { list.splice(idx, 1); persist(); return true; }
  }
  return false;
}

// ---------------- 旅游打卡（定位 + 照片） ----------------
function getTravels(code) {
  return (db.travel[code] || []).slice().sort((a, b) => b.ts - a.ts);
}
// photoBase64: "data:image/jpeg;base64,...." 或纯 base64；返回保存的文件名
function addTravel(code, who, lat, lng, name, note, photoBase64) {
  if (!db.travel[code]) db.travel[code] = [];
  let photoFile = null;
  if (photoBase64) {
    try {
      ensurePhotosDir();
      const m = /^data:(image\/\w+);base64,(.*)$/.exec(photoBase64);
      const b64 = m ? m[2] : photoBase64;
      const ext = m ? (m[1].split('/')[1] || 'jpg').replace('jpeg', 'jpg') : 'jpg';
      photoFile = uid('p_') + '.' + ext;
      fs.writeFileSync(path.join(PHOTOS_DIR, photoFile), Buffer.from(b64, 'base64'));
    } catch (e) { photoFile = null; }
  }
  const item = {
    id: uid('t_'), code, who, lat, lng, name: name || '', note: note || '',
    photo: photoFile, ts: Date.now(),
  };
  db.travel[code].push(item);
  persist();
  return item;
}
function deleteTravel(id) {
  for (const code in db.travel) {
    const list = db.travel[code];
    const idx = list.findIndex(t => t.id === id);
    if (idx >= 0) {
      const it = list[idx];
      if (it.photo) { try { fs.unlinkSync(path.join(PHOTOS_DIR, it.photo)); } catch (_) {} }
      list.splice(idx, 1); persist(); return true;
    }
  }
  return false;
}

// ---------------- 爱意卡片（信物收集） ----------------
const CARD_DECK = [
  { id: 'c1', emoji: '🌹', title: '给你的玫瑰', text: '你是我每天想摘给 TA 的那朵玫瑰。' },
  { id: 'c2', emoji: '🌟', title: '专属星辰', text: '遇见你之后，我的夜空才有了星星。' },
  { id: 'c3', emoji: '☕', title: '一杯温热', text: '希望此刻你能喝到一杯刚好温度的热饮。' },
  { id: 'c4', emoji: '📝', title: '小纸条', text: '忙的时候也别忘了，有人在想你。' },
  { id: 'c5', emoji: '🌈', title: '雨后彩虹', text: '再难的日子里，你都是我的彩虹。' },
  { id: 'c6', emoji: '🎵', title: '我们的歌', text: '听到那首歌，就会想起和你在一起的瞬间。' },
  { id: 'c7', emoji: '🍰', title: '甜甜一块', text: '今天也要像蛋糕一样，甜一点。' },
  { id: 'c8', emoji: '💌', title: '一封情书', text: '纸短情长，写不下我对你的喜欢。' },
  { id: 'c9', emoji: '🌙', title: '晚安月亮', text: '月亮替我陪着你，晚安，我的宝贝。' },
  { id: 'c10', emoji: '🔥', title: '心动时刻', text: '每一次想到你，心还是会跳快半拍。' },
  { id: 'c11', emoji: '🐱', title: '猫系撒娇', text: '喵～今天也想被你摸摸头。' },
  { id: 'c12', emoji: '💍', title: '未来约定', text: '想和你把平凡的日子，过成一辈子。' },
];

function getCardDeck() {
  return CARD_DECK;
}

function getCollected(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  const ids = room.collected[who] || [];
  const cards = ids.map((id) => CARD_DECK.find((c) => c.id === id)).filter(Boolean);
  return { cards, total: CARD_DECK.length, collectedCount: ids.length };
}

function unlockCard(code, who) {
  const room = db.rooms[code];
  if (!room) return { error: 'not found' };
  const got = new Set(room.collected[who] || []);
  const next = CARD_DECK.find((c) => !got.has(c.id));
  if (!next) return { done: true };
  room.collected[who].push(next.id);
  persist();
  return { card: next };
}

module.exports = {
  uid,
  getRoom, createRoom, joinRoom, touch,
  setOpenid, getOpenid, grantPush, consumePush,
  setTogetherSince,
  addMiss, addHug, addMood, getStats,
  getSchedules, addSchedule, updateSchedule, deleteSchedule,
  shouldFireSchedule, markScheduleSent,
  getDiaries, addDiary, markDiaryRead,
  getAnniversaries, addAnniversary, updateAnniversary, deleteAnniversary,
  checkin, getCheckin,
  getWishes, addWish, updateWish, deleteWish,
  getTravels, addTravel, deleteTravel,
  getCardDeck, getCollected, unlockCard,
  getPhotosDir: () => PHOTOS_DIR,
  getDataDir: () => DATA_DIR,
  flush: persist,
  _raw: () => db,
};
