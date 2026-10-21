const app = getApp();

Page({
  data: {
    items: [
      { key: 'anni', emoji: '💕', name: '纪念日 · 倒数日', desc: '记下滑过的每一个重要日子', url: '/pages/anniversary/anniversary' },
      { key: 'checkin', emoji: '☀️', name: '每日打卡', desc: '每天说早安，连在一起就是爱', url: '/pages/checkin/checkin' },
      { key: 'wish', emoji: '🌟', name: '愿望清单', desc: '一起攒下想做的事', url: '/pages/wish/wish' },
      { key: 'game', emoji: '🎮', name: '双人小游戏', desc: '远程也能一起玩猜拳', url: '/pages/game/game' },
      { key: 'travel', emoji: '📍', name: '旅游打卡', desc: '带着定位与照片留住风景', url: '/pages/travel/travel' },
      { key: 'notify', emoji: '🔔', name: '微信提醒', desc: '在微信里直接收到 TA 的思念', url: '/pages/settings/settings' },
    ],
  },
  open(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (url.indexOf('/pages/settings') >= 0) {
      wx.navigateTo({ url });
    } else {
      wx.navigateTo({ url });
    }
  },
  back() { wx.navigateBack({ delta: 1 }); },
});
