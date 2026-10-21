const app = getApp();

Page({
  data: {
    myName: '',
    partnerName: '',
    code: '',
    serverUrl: '',
    wsUrl: '',
  },
  onShow() {
    const g = app.globalData;
    this.setData({
      myName: (g.room && g.room.myName) || wx.getStorageSync('myName') || '我',
      partnerName: (g.room && g.room.partnerName) || 'TA',
      code: g.roomCode,
      serverUrl: g.serverUrl,
      wsUrl: g.wsUrl,
    });
  },
  onServer(e) { this.setData({ serverUrl: e.detail.value }); },
  onWs(e) { this.setData({ wsUrl: e.detail.value }); },
  saveServer() {
    app.setServer(this.data.serverUrl.trim(), this.data.wsUrl.trim());
    app.connectWS();
    wx.showToast({ title: '已保存，重连中', icon: 'none' });
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
