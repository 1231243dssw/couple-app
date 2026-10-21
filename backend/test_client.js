'use strict';
// 测试脚本：模拟 A、B 两个客户端，验证配对、思念秒达、回抱、表情、心情、统计、定时情话
const WebSocket = require('ws');
const http = require('http');

const BASE = 'http://localhost:3000';
const WS = 'ws://localhost:3000/ws';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 },
    }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => resolve(JSON.parse(s)));
    });
    if (data) r.write(data);
    r.end();
  });
}

function openWS(code, who) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS + `?code=${code}&who=${who}`);
    ws._msgs = [];
    ws.on('message', (m) => {
      const msg = JSON.parse(m.toString());
      ws._msgs.push(msg);
      ws._last = msg;
      (ws._handlers || []).forEach((h) => h(msg));
    });
    ws.on('open', () => resolve(ws));
  });
}

function firstOf(ws, type) {
  return ws._msgs.find((m) => m.type === type);
}

function waitFor(ws, type, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + type)), timeout);
    const h = (msg) => {
      if (msg.type === type) {
        clearTimeout(t);
        ws._handlers = (ws._handlers || []).filter((x) => x !== h);
        resolve(msg);
      }
    };
    ws._handlers = ws._handlers || [];
    ws._handlers.push(h);
  });
}

(async () => {
  try {
    console.log('1) 创建房间 (A)...');
    const created = await req('POST', '/api/room/create', { name: '小明' });
    const code = created.code;
    console.log('   邀请码:', code, '| A房间:', created.room.nameA, '/ 伴侣:', created.room.partnerName);

    console.log('2) B 加入房间...');
    const joined = await req('POST', '/api/room/join', { code, name: '小红' });
    console.log('   绑定成功:', joined.room.bound, '| B:', joined.room.nameB);

    console.log('3) 建立 WebSocket 连接...');
    const wsA = await openWS(code, 'A');
    const wsB = await openWS(code, 'B');
    const welcome = firstOf(wsA, 'welcome');
    console.log('   A 收到 welcome, 在线状态:', JSON.stringify((welcome && welcome.room.online)));

    console.log('4) A 点击“想你” -> B 应秒收思念...');
    const gotMiss = waitFor(wsB, 'miss_incoming');
    wsA.send(JSON.stringify({ type: 'miss' }));
    const miss = await gotMiss;
    console.log('   B 收到思念来自:', miss.fromName, '| 总次数:', miss.stats.total);

    console.log('5) B 回抱 -> A 应收到...');
    const gotHug = waitFor(wsA, 'hug_incoming');
    wsB.send(JSON.stringify({ type: 'hug' }));
    const hug = await gotHug;
    console.log('   A 收到回抱来自:', hug.fromName);

    console.log('6) A 发表情 💖 -> B 应收到...');
    const gotReact = waitFor(wsB, 'react_incoming');
    wsA.send(JSON.stringify({ type: 'react', emoji: '💖' }));
    const react = await gotReact;
    console.log('   B 收到表情:', react.emoji);

    console.log('7) B 心情打卡...');
    const gotMood = waitFor(wsA, 'mood_incoming');
    wsB.send(JSON.stringify({ type: 'mood', mood: '开心', note: '想到你就开心' }));
    const mood = await gotMood;
    console.log('   A 收到 B 心情:', mood.mood, '-', mood.note);

    console.log('8) 查询统计 /api/stats...');
    const stats = await req('GET', `/api/stats/${code}`);
    console.log('   统计:', JSON.stringify(stats.stats.byWho), '总', stats.stats.total, '今日', stats.stats.todayCount, '连续', stats.stats.streak, '天');

    console.log('9) 设置一条“当前分钟”的定时情话，等待调度触发...');
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    await req('POST', '/api/schedule', { code, text: '测试定时情话：无论多忙，我都在想你 💕', time: hhmm, createdBy: 'A' });
    const gotSched = waitFor(wsA, 'scheduled', 40000);
    const sched = await gotSched;
    console.log('   A 收到定时情话:', sched.text);

    console.log('\n✅ 全部链路测试通过！');
    process.exit(0);
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    process.exit(1);
  }
})();
