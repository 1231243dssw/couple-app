const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    name: '',
    mode: 'create', // create | join
    code: '',
    joinCode: '',
    bound: false,
  },
  _timer: null,

  onName(e) { this.setData({ name: e.detail.value }); },
  onJoinCode(e) { this.setData({ joinCode: e.detail.value }); },

  toggleMode() {
    this.setData({ mode: this.data.mode === 'join' ? 'create' : 'join' });
  },

  saveAndConnect(code, who, name) {
    const g = app.globalData;
    g.roomCode = code;
    g.who = who;
    g.myName = name;
    wx.setStorageSync('roomCode', code);
    wx.setStorageSync('who', who);
    wx.setStorageSync('myName', name);
    app.connectWS();
  },

  async onCreate() {
    const name = (this.data.name || '我').trim() || '我';
    wx.showLoading({ title: '生成中' });
    try {
      const res = await api.createRoom(name);
      wx.hideLoading();
      if (!res.ok) { wx.showToast({ title: res.error || '失败', icon: 'none' }); return; }
      this.saveAndConnect(res.code, 'A', name);
      this.setData({ code: res.code });
      this.pollBound(res.code);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，检查后端地址', icon: 'none' });
    }
  },

  pollBound(code) {
    this._timer = setInterval(async () => {
      try {
        const res = await api.getRoomState(code, 'A');
        if (res.ok && res.room.bound) {
          clearInterval(this._timer); this._timer = null;
          this.setData({ bound: true });
          setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 900);
        }
      } catch (e) {}
    }, 2000);
  },

  async onJoin() {
    const code = (this.data.joinCode || '').trim();
    const name = (this.data.name || 'TA').trim() || 'TA';
    if (code.length !== 6) { wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' }); return; }
    wx.showLoading({ title: '加入中' });
    try {
      const res = await api.joinRoom(code, name);
      wx.hideLoading();
      if (!res.ok) { wx.showToast({ title: res.error || '加入失败', icon: 'none' }); return; }
      this.saveAndConnect(code, 'B', name);
      wx.switchTab({ url: '/pages/home/home' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络错误，检查后端地址', icon: 'none' });
    }
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '已复制邀请码', icon: 'none' }),
    });
  },

  onUnload() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
});
