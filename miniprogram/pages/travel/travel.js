const app = getApp();
const api = require('../../utils/api.js');

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

Page({
  data: {
    list: [],
    formShow: false,
    name: '',
    note: '',
    lat: null,
    lng: null,
    located: false,
    photo: '',        // base64（去前缀）
    photoPreview: '', // 临时预览路径
    uploading: false,
  },

  onShow() { this.load(); },

  async load() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getTravels(g.roomCode);
      if (res.ok) {
        const base = g.serverUrl;
        const list = res.list.map((it) => ({
          ...it,
          photoUrl: it.photo ? `${base}/photos/${it.photo}` : '',
          timeText: fmtTime(it.ts),
          byMe: it.who === g.who,
        }));
        this.setData({ list });
      }
    } catch (e) {}
  },

  openForm() {
    this.setData({ formShow: true, name: '', note: '', lat: null, lng: null, located: false, photo: '', photoPreview: '', uploading: false });
  },
  closeForm() { this.setData({ formShow: false }); },
  noop() {},
  onName(e) { this.setData({ name: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ lat: res.latitude, lng: res.longitude, located: true });
        wx.showToast({ title: '已定位 📍', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '定位失败，可手动填写地点', icon: 'none' });
      },
    });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: file.tempFilePath,
          encoding: 'base64',
          success: (r) => {
            this.setData({ photo: r.data, photoPreview: file.tempFilePath });
          },
          fail: () => wx.showToast({ title: '读取照片失败', icon: 'none' }),
        });
      },
    });
  },

  async submit() {
    const g = app.globalData;
    if (!this.data.photo) { wx.showToast({ title: '先选一张照片吧', icon: 'none' }); return; }
    this.setData({ uploading: true });
    try {
      await api.addTravel(g.roomCode, g.who, this.data.lat, this.data.lng, this.data.name, this.data.note, this.data.photo);
      this.setData({ formShow: false, uploading: false });
      wx.showToast({ title: '打卡成功 📍', icon: 'none' });
      this.load();
    } catch (e) {
      this.setData({ uploading: false });
      wx.showToast({ title: '上传失败：' + (e.message || ''), icon: 'none' });
    }
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条打卡？',
      success: async (r) => {
        if (!r.confirm) return;
        try { await api.deleteTravel(id); this.load(); } catch (e) {}
      },
    });
  },
});
