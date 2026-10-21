const app = getApp();
const api = require('../../utils/api.js');
const EventBus = require('../../utils/event.js');

Page({
  data: {
    stats: { total: 0, avgPerDay: 0, todayCount: 0, streak: 0, days: 0, byWho: { A: 0, B: 0 }, hugs: { A: 0, B: 0 }, last14: [] },
    myName: '我',
    partnerName: 'TA',
    aPct: 0,
    bPct: 0,
  },
  _offs: [],

  onShow() {
    this.applyRoom();
    this.refresh();
    this._offs.push(EventBus.on('stats', (s) => this.applyStats(s)));
  },
  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() { (this._offs || []).forEach((f) => f()); this._offs = []; },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh(); },

  applyRoom() {
    const g = app.globalData;
    const room = g.room;
    if (room) {
      this.setData({
        myName: room.myName || '我',
        partnerName: room.partnerName || 'TA',
      });
    }
  },

  async refresh() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getStats(g.roomCode);
      if (res.ok) this.applyStats(res.stats);
    } catch (e) {}
  },

  applyStats(stats) {
    if (!stats) return;
    const a = stats.byWho.A || 0;
    const b = stats.byWho.B || 0;
    const maxWho = Math.max(a, b, 1);
    const maxC = Math.max(...stats.last14.map((x) => x.count), 1);
    const last14 = stats.last14.map((x) => ({ ...x, h: Math.round((x.count / maxC) * 170) + 4 }));
    this.setData({
      stats,
      last14,
      aPct: Math.round((a / maxWho) * 100),
      bPct: Math.round((b / maxWho) * 100),
    });
  },
});
