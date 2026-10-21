const app = getApp();
const api = require('../../utils/api.js');
const EventBus = require('../../utils/event.js');

Page({
  data: {
    list: [],
    quotes: [],
    newText: '',
    newTime: '21:00',
  },
  _offs: [],

  onShow() {
    this.loadSchedules();
    this.loadQuotes();
  },

  async loadSchedules() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getSchedules(g.roomCode);
      if (res.ok) this.setData({ list: res.list });
    } catch (e) {}
  },
  async loadQuotes() {
    try {
      const res = await api.quotes();
      if (res.ok) this.setData({ quotes: res.list });
    } catch (e) {}
  },

  onText(e) { this.setData({ newText: e.detail.value }); },
  onTime(e) { this.setData({ newTime: e.detail.value }); },

  async onAdd() {
    const g = app.globalData;
    const text = this.data.newText.trim();
    if (!text) { wx.showToast({ title: '先写点话～', icon: 'none' }); return; }
    wx.showLoading({ title: '添加中' });
    try {
      const res = await api.addSchedule(g.roomCode, text, this.data.newTime, g.who);
      wx.hideLoading();
      if (res.ok) {
        this.setData({ newText: '' });
        this.loadSchedules();
        wx.showToast({ title: '已添加 ⏰', icon: 'none' });
      } else {
        wx.showToast({ title: '添加失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    const enabled = e.detail.value;
    await api.updateSchedule(id, { enabled });
    this.loadSchedules();
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条定时情话？',
      success: async (r) => {
        if (r.confirm) {
          await api.deleteSchedule(id);
          this.loadSchedules();
        }
      },
    });
  },

  copyQuote(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.q,
      success: () => wx.showToast({ title: '已复制，去发给 TA 吧', icon: 'none' }),
    });
  },
});
