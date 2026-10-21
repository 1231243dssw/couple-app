const app = getApp();
const api = require('../../utils/api.js');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    loveDays: 0,
    myStreak: 0,
    partnerStreak: 0,
    checkedToday: false,
    myLast: '',
    partnerLast: '',
    today: '',
  },

  onShow() {
    this.setData({ today: todayStr() });
    this.load();
  },

  async load() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getCheckin(g.roomCode);
      if (res.ok) {
        const info = res.info;
        const who = g.who;
        const other = who === 'A' ? 'B' : 'A';
        this.setData({
          loveDays: info.loveDays || 0,
          myStreak: (info[who] && info[who].streak) || 0,
          partnerStreak: (info[other] && info[other].streak) || 0,
          checkedToday: !!(info[who] && info[who].last === this.data.today),
          myLast: (info[who] && info[who].last) || '',
          partnerLast: (info[other] && info[other].last) || '',
        });
      }
    } catch (e) {}
  },

  async doCheckin() {
    const g = app.globalData;
    try {
      const res = await api.checkin(g.roomCode, g.who);
      if (res.ok) {
        wx.showToast({ title: '打卡成功 ☀️', icon: 'none' });
        this.load();
      }
    } catch (e) {
      wx.showToast({ title: '打卡失败：' + (e.message || ''), icon: 'none' });
    }
  },
});
