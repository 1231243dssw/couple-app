const app = getApp();
const api = require('../../utils/api.js');
const EventBus = require('../../utils/event.js');

Page({
  data: {
    tab: 'diary',
    items: [],
    who: 'A',
    partnerName: 'TA',
    form: false,
    formType: 'diary',
    fTitle: '',
    fBody: '',
  },
  _offs: [],

  onShow() {
    const g = app.globalData;
    this.setData({
      who: g.who,
      partnerName: (g.room && g.room.partnerName) || 'TA',
    });
    this.load();
    this._offs.push(EventBus.on('diary_new', () => {
      wx.showToast({ title: 'TA 给你写了点什么 💌', icon: 'none' });
      this.load();
    }));
  },
  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() { (this._offs || []).forEach((f) => f()); this._offs = []; },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t });
    this.load();
  },

  async load() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getDiaries(g.roomCode);
      if (res.ok) {
        const who = g.who;
        const items = res.list
          .filter((d) => d.type === this.data.tab)
          .map((d) => {
            const dt = new Date(d.createdAt);
            const timeText = `${dt.getMonth() + 1}月${dt.getDate()}日`;
            const unread = d.from !== who && !d.readBy.includes(who);
            return { ...d, timeText, unread };
          });
        this.setData({ items });
      }
    } catch (e) {}
  },

  openEntry(e) {
    const { id, from } = e.currentTarget.dataset;
    const who = app.globalData.who;
    if (from !== who) {
      api.markDiaryRead(app.globalData.roomCode, id, who);
      this.load();
    }
  },

  showForm() {
    const type = this.data.tab;
    this.setData({ form: true, formType: type, fTitle: '', fBody: '' });
  },
  hideForm() { this.setData({ form: false }); },
  noop() {},
  onFTitle(e) { this.setData({ fTitle: e.detail.value }); },
  onFBody(e) { this.setData({ fBody: e.detail.value }); },

  async submit() {
    const g = app.globalData;
    const body = this.data.fBody.trim();
    if (!body) { wx.showToast({ title: '写点什么吧～', icon: 'none' }); return; }
    wx.showLoading({ title: '送达中' });
    try {
      const res = await api.addDiary(g.roomCode, this.data.fTitle.trim(), body, g.who, this.data.formType);
      wx.hideLoading();
      if (res.ok) {
        this.setData({ form: false });
        this.load();
        wx.showToast({ title: '已送达 TA 💌', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },
});
