const app = getApp();

Page({
  data: {
    myName: '',
    partnerName: '',
    code: '',
    serverUrl: '',
    wsUrl: '',
    shareCode: '',
    connStatus: '未连接 💔',
    connClass: 'bad',
    health: '',
  },

  onShow() {
    const g = app.globalData;
    this.setData({
      myName: (g.room && g.room.myName) || wx.getStorageSync('myName') || '我',
      partnerName: (g.room && g.room.partnerName) || 'TA',
      code: g.roomCode,
      serverUrl: g.serverUrl,
      wsUrl: g.wsUrl,
      shareCode: g.shareCode || '',
    });
    this.refreshConn();
    // 持续反映实时连接状态
    this.timer = setInterval(() => this.refreshConn(), 800);
  },

  onHide() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  onUnload() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  refreshConn() {
    const ok = !!app.globalData.wsReady;
    this.setData({
      connStatus: ok ? '已连接 💚' : '未连接 💔',
      connClass: ok ? 'ok' : 'bad',
    });
  },

  onServer(e) { this.setData({ serverUrl: e.detail.value }); },
  onWs(e) { this.setData({ wsUrl: e.detail.value }); },
  onShare(e) { this.setData({ shareCode: e.detail.value }); },

  saveServer() {
    const s = (this.data.serverUrl || '').trim();
    const w = (this.data.wsUrl || '').trim();
    const sc = (this.data.shareCode || '').trim();
    if (!s || !w) {
      wx.showToast({ title: '地址不能为空', icon: 'none' });
      return;
    }
    app.setServer(s, w, sc);
    app.connectWS();
    wx.showToast({ title: '已保存，重连中', icon: 'none' });
    setTimeout(() => this.refreshConn(), 1200);
  },

  resetDefault() {
    const d = app.resetToDefault();
    this.setData({ serverUrl: d.serverUrl, wsUrl: d.wsUrl, shareCode: d.shareCode });
    app.connectWS();
    wx.showToast({ title: '已恢复默认配置', icon: 'none' });
    setTimeout(() => this.refreshConn(), 1200);
  },

  testConn() {
    const s = (this.data.serverUrl || '').trim();
    const sc = (this.data.shareCode || '').trim();
    if (!s) { wx.showToast({ title: '请先填写 HTTP 地址', icon: 'none' }); return; }
    this.setData({ health: '测试中…' });
    const sep = s.indexOf('?') >= 0 ? '&' : '?';
    wx.request({
      url: s + '/api/health' + sep + 'sharecode=' + encodeURIComponent(sc),
      method: 'GET',
      success: (res) => {
        this.setData({ health: res.statusCode === 200 ? '✅ 后端可达（状态码 200）' : '❌ 状态码 ' + res.statusCode });
      },
      fail: (err) => {
        this.setData({ health: '❌ 连接失败：' + (err.errMsg || '未知错误') });
      },
    });
  },

  copyCode() {
    wx.setClipboardData({ data: this.data.code, success: () => wx.showToast({ title: '已复制邀请码', icon: 'none' }) });
  },

  unbind() {
    wx.showModal({
      title: '解除绑定？',
      content: '本机将退出绑定，TA 那端不受影响。',
      success: (r) => {
        if (!r.confirm) return;
        wx.removeStorageSync('roomCode');
        wx.removeStorageSync('who');
        wx.removeStorageSync('myName');
        app.globalData.roomCode = '';
        app.globalData.who = 'A';
        app.globalData.room = null;
        if (app.globalData.wsTask) { try { app.globalData.wsTask.close(); } catch (e) {} }
        app.globalData.wsTask = null;
        wx.reLaunch({ url: '/pages/splash/splash' });
      },
    });
  },
});
