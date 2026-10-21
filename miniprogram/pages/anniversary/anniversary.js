const app = getApp();
const api = require('../../utils/api.js');

const TYPES = [
  { k: 'love', label: '纪念日' },
  { k: 'birthday', label: '生日' },
  { k: 'other', label: '其它' },
];

function daysUntil(dateStr) {
  // dateStr: YYYY-MM-DD
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  let target = new Date(dateStr.replace(/-/g, '/'));
  let next = new Date(today.getFullYear(), target.getMonth(), target.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, target.getMonth(), target.getDate());
  const diff = Math.round((next - today) / 86400000);
  return diff;
}

Page({
  data: {
    loveDays: 0,
    togetherSince: '',
    list: [],
    types: TYPES,
    formShow: false,
    title: '',
    date: '',
    typeIndex: 0,
    today: '',
  },

  onShow() {
    const d = new Date();
    this.setData({ today: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    this.loadAll();
  },

  async loadAll() {
    const g = app.globalData;
    if (!g.roomCode) { wx.showToast({ title: '请先在首页绑定', icon: 'none' }); return; }
    try {
      const ck = await api.getCheckin(g.roomCode);
      if (ck.ok) {
        const since = ck.info.togetherSince || '';
        this.setData({ loveDays: ck.info.loveDays || 0, togetherSince: since ? this.fmtDate(since) : '' });
      }
    } catch (e) {}
    try {
      const res = await api.getAnniversaries(g.roomCode);
      if (res.ok) {
        const list = res.list.map((it) => {
          const dd = daysUntil(it.date);
          let cd;
          if (dd === 0) cd = '就是今天 🎉';
          else if (dd === 1) cd = '明天 💗';
          else cd = '还有 ' + dd + ' 天';
          return { ...it, cd };
        });
        this.setData({ list });
      }
    } catch (e) {}
  },

  openForm() {
    this.setData({ formShow: true, title: '', date: this.data.today, typeIndex: 0 });
  },
  closeForm() { this.setData({ formShow: false }); },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  onType(e) { this.setData({ typeIndex: Number(e.detail.value) }); },

  async save() {
    const g = app.globalData;
    const title = (this.data.title || '').trim();
    if (!title) { wx.showToast({ title: '写个名字吧', icon: 'none' }); return; }
    if (!this.data.date) { wx.showToast({ title: '选个日期', icon: 'none' }); return; }
    const type = TYPES[this.data.typeIndex].k;
    try {
      await api.addAnniversary(g.roomCode, title, this.data.date, type, g.who);
      this.setData({ formShow: false });
      wx.showToast({ title: '已记下 💕', icon: 'none' });
      this.loadAll();
    } catch (e) {
      wx.showToast({ title: '保存失败：' + (e.message || ''), icon: 'none' });
    }
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除这个日子？',
      content: name,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteAnniversary(id);
          this.loadAll();
        } catch (e) {}
      },
    });
  },

  fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  },

  noop() {},
});
