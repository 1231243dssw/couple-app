const app = getApp();

Page({
  start() {
    const g = app.globalData;
    if (g.roomCode) {
      // 已绑定，直接进入主页
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      wx.navigateTo({ url: '/pages/pairing/pairing' });
    }
  },
});
