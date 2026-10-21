const app = getApp();
const api = require('../../utils/api.js');
const EventBus = require('../../utils/event.js');

Page({
  data: {
    partnerName: '',
    partnerInitial: '♡',
    online: false,
    greeting: '你好',
    pressing: false,
    burst: [],
    stats: { todayCount: 0, total: 0, streak: 0 },
    quote: '想你的时候，风都变得温柔。',
  },
  _offs: [],

  onShow() {
    this.syncFromGlobal();
    this.refreshState();
    this.refreshQuote();
    this._offs.push(EventBus.on('stats', (s) => this.setData({ stats: s })));
    this._offs.push(EventBus.on('state', (m) => this.applyRoom(m.room)));
    this._offs.push(EventBus.on('presence', (o) => this.setData({ online: !!o && !!o[app.globalData.who === 'A' ? 'B' : 'A'] })));
  },

  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() {
    (this._offs || []).forEach((f) => f());
    this._offs = [];
  },

  syncFromGlobal() {
    const g = app.globalData;
    if (g.room) this.applyRoom(g.room);
    if (g.stats) this.setData({ stats: g.stats });
    const who = g.who;
    const online = g.room && g.room.online && g.room.online[who === 'A' ? 'B' : 'A'];
    if (typeof online === 'boolean') this.setData({ online });
  },

  applyRoom(room) {
    if (!room) return;
    const who = app.globalData.who;
    const partnerName = room.partnerName || 'TA';
    this.setData({
      partnerName,
      partnerInitial: (partnerName[0] || '♡'),
      online: !!(room.online && room.online[who === 'A' ? 'B' : 'A']),
    });
  },

  async refreshState() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getRoomState(g.roomCode, g.who);
      if (res.ok) {
        g.room = res.room; g.stats = res.stats;
        this.applyRoom(res.room);
        this.setData({ stats: res.stats });
      }
    } catch (e) {}
  },

  greetingText() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早安';
    if (h < 14) return '午安';
    if (h < 18) return '下午好';
    if (h < 22) return '晚上好';
    return '夜深了';
  },

  onMiss() {
    const ok = app.sendMiss();
    this.setData({ pressing: true });
    setTimeout(() => this.setData({ pressing: false }), 160);
    this.spawnBurst();
    wx.vibrateShort();
    if (!ok) {
      wx.showToast({ title: '连接中，稍后再试', icon: 'none' });
      return;
    }
    // 乐观更新
    const s = this.data.stats;
    this.setData({
      stats: { ...s, todayCount: (s.todayCount || 0) + 1, total: (s.total || 0) + 1 },
    });
    wx.showToast({ title: '思念已送达 💗', icon: 'none' });
  },

  spawnBurst() {
    const arr = [];
    for (let i = 0; i < 8; i++) {
      arr.push({ id: Date.now() + i, left: 250 + (Math.random() * 200 - 100), delay: (Math.random() * 0.5).toFixed(2) });
    }
    this.setData({ burst: arr });
    setTimeout(() => this.setData({ burst: [] }), 2000);
  },

  async refreshQuote() {
    this.setData({ greeting: this.greetingText() });
    try {
      const res = await api.randomQuote();
      if (res.ok) this.setData({ quote: res.text });
    } catch (e) {}
  },

  toSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); },
  toInteract() { wx.switchTab({ url: '/pages/interact/interact' }); },
  toDiary() { wx.switchTab({ url: '/pages/diary/diary' }); },
  toWords() { wx.switchTab({ url: '/pages/words/words' }); },
  toStats() { wx.switchTab({ url: '/pages/stats/stats' }); },
  toToken() { wx.navigateTo({ url: '/pages/token/token' }); },
});
