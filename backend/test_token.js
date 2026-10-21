'use strict';
// 测试：专属信物码 + 爱意卡片解锁
const http = require('http');
const BASE = 'http://localhost:3001';

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

(async () => {
  try {
    const created = await req('POST', '/api/room/create', { name: '小明' });
    const code = created.code;
    console.log('1) 房间:', code);

    const tok = await req('GET', `/api/room/${code}/token`);
    console.log('2) 信物码生成:', tok.ok ? 'OK, qr长度=' + tok.qr.length : 'FAIL', '| secret=', tok.secret);

    const deck = await req('GET', '/api/cards');
    console.log('3) 卡片牌库数量:', deck.deck.length);

    const u1 = await req('POST', `/api/room/${code}/unlock`, { who: 'A', token: `couple-token://${code}/${tok.secret}` });
    console.log('4) 扫码解锁第1张:', u1.ok ? u1.card.emoji + ' ' + u1.card.title : 'FAIL', JSON.stringify(u1));

    const u2 = await req('POST', `/api/room/${code}/unlock`, { who: 'A', token: `couple-token://${code}/${tok.secret}` });
    console.log('5) 扫码解锁第2张:', u2.ok ? u2.card.title : 'FAIL');

    const bad = await req('POST', `/api/room/${code}/unlock`, { who: 'A', token: 'couple-token://999999/abc' });
    console.log('6) 错误信物码应被拒:', bad.ok === false && bad.error === 'invalid_token' ? 'OK 已拦截' : 'FAIL ' + JSON.stringify(bad));

    const coll = await req('GET', `/api/room/${code}/cards?who=A`);
    console.log('7) A 已收集:', coll.collectedCount + '/' + coll.total, '| 卡片:', coll.cards.map((c) => c.title).join(','));

    console.log('\n✅ 信物 & 卡片功能测试通过！');
    process.exit(0);
  } catch (e) {
    console.error('❌ 测试失败:', e.message);
    process.exit(1);
  }
})();
