'use strict';

/**
 * 轻量数据持久化层
 * 使用 JSON 文件存储，避免引入数据库原生依赖。
 * 房间(room)、用户(user)、思念记录(miss)、定时情话(schedule)、日记(diary) 均落盘。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 数据目录：默认 ./data，部署到 Railway/Render 时挂卷到 /data 即可持久化
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return { rooms: {}, schedules: {}, diaries: {} };
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      rooms: parsed.rooms || {},
      schedules: parsed.schedules || {},
      diaries: parsed.diaries || {},
    };
  } catch (e) {
    // 文件损坏则备份后重建
    const backup = DATA_FILE + '.bak.' + Date.now();
    try { fs.copyFileSync(DATA_FILE, backup); } catch (_) {}
    return { rooms: {}, schedules: {}, diaries: {} };
  }
}

let db = load();

function persist() {
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function uid(prefix) {
  return (prefix || '') + crypto.randomBytes(6).toString('hex');
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

function addMiss(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  room.miss[who] = (room.miss[who] || 0) + 1;
  room.totalMiss += 1;
  room.history.push({ from: who, ts: Date.now() });
  // 仅保留最近 500 条，避免无限膨胀
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

  // 今日次数
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCount = history.filter(h => h.ts >= startOfToday.getTime()).length;

  // 连续有思念的天数（streak）
  const daySet = new Set(history.map(h => {
    const d = new Date(h.ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // 若今天还没思念，从昨天往前数
  if (!daySet.has(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(keyOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 最近 14 天每日次数（用于折线）
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const k = keyOf(d);
    const c = history.filter(h => {
      const hd = new Date(h.ts);
      return keyOf(hd) === k;
    }).length;
    last14.push({ date: (d.getMonth() + 1) + '/' + d.getDate(), count: c });
  }

  return {
    total,
    avgPerDay,
    todayCount,
    streak,
    days,
    byWho: { A: room.miss.A, B: room.miss.B },
    hugs: room.hugs,
    last14,
  };
}

function keyOf(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// ---------------- Schedules（定时情话） ----------------
function getSchedules(code) {
  return (db.schedules[code] || []).filter(s => !s.deleted);
}

function addSchedule(code, text, time, createdBy) {
  if (!db.schedules[code]) db.schedules[code] = [];
  const item = {
    id: uid('s_'),
    code,
    text,
    time,                 // "HH:MM"
    createdBy: createdBy || 'A',
    createdAt: Date.now(),
    lastSentDate: null,   // 已发送的日期，避免一天多次
    enabled: true,
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

// 返回某人的已收集卡片对象 + 剩余数
function getCollected(code, who) {
  const room = db.rooms[code];
  if (!room) return null;
  const ids = room.collected[who] || [];
  const cards = ids.map((id) => CARD_DECK.find((c) => c.id === id)).filter(Boolean);
  return { cards, total: CARD_DECK.length, collectedCount: ids.length };
}

// 解锁下一张未收集卡片；全部集齐返回 null
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
  addMiss, addHug, addMood, getStats,
  getSchedules, addSchedule, updateSchedule, deleteSchedule,
  getDiaries, addDiary, markDiaryRead,
  getCardDeck, getCollected, unlockCard,
  flush: persist,
  _raw: () => db,
};
