const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    list: [],
    text: '',
    doneCount: 0,
  },

  onShow() { this.load(); },

  async load() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getWishes(g.roomCode);
      if (res.ok) {
        const list = res.list.map((it) => ({ ...it, byMe: it.by === g.who }));
        const doneCount = list.filter((x) => x.done).length;
        this.setData({ list, doneCount });
      }
    } catch (e) {}
  },

  onText(e) { this.setData({ text: e.detail.value }); },

  async add() {
    const g = app.globalData;
    const text = (this.data.text || '').trim();
    if (!text) { wx.showToast({ title: '写点什么吧', icon: 'none' }); return; }
    try {
      await api.addWish(g.roomCode, text, g.who);
      this.setData({ text: '' });
      this.load();
    } catch (e) {
      wx.showToast({ title: '添加失败：' + (e.message || ''), icon: 'none' });
    }
  },

  async toggle(e) {
    const id = e.currentTarget.dataset.id;
    const done = e.currentTarget.dataset.done;
    try {
      await api.updateWish(id, { done: !done });
      this.load();
    } catch (e) {}
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '放弃这个愿望？',
      success: async (r) => {
        if (!r.confirm) return;
        try { await api.deleteWish(id); this.load(); } catch (e) {}
      },
    });
  },
});
