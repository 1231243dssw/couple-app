const app = getApp();
const api = require('../../utils/api.js');
const EventBus = require('../../utils/event.js');

Page({
  data: {
    qr: '',
    genLoading: false,
    reveal: null,
    done: false,
    cards: [],
    collectedCount: 0,
    total: 12,
  },
  _offs: [],

  onShow() {
    this.loadCards();
    this._offs.push(EventBus.on('card_unlocked', () => this.loadCards()));
  },
  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() { (this._offs || []).forEach((f) => f()); this._offs = []; },

  async loadCards() {
    const g = app.globalData;
    if (!g.roomCode) return;
    try {
      const res = await api.getCollected(g.roomCode, g.who);
      if (res.ok) {
        this.setData({
          cards: res.cards,
          collectedCount: res.collectedCount,
          total: res.total,
          done: res.collectedCount >= res.total,
        });
      }
    } catch (e) {}
  },

  async genToken() {
    const g = app.globalData;
    if (!g.roomCode) return;
    this.setData({ genLoading: true });
    try {
      const res = await api.getToken(g.roomCode);
      if (res.ok) this.setData({ qr: res.qr });
      else wx.showToast({ title: '生成失败', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ genLoading: false });
    }
  },

  saveQr() {
    const base64 = this.data.qr.split(',')[1];
    if (!base64) return;
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/token_${Date.now()}.png`;
    fs.writeFile({
      filePath: path,
      data: base64,
      encoding: 'base64',
      success: () => {
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'none' }),
          fail: () => wx.showToast({ title: '保存失败，请授权相册', icon: 'none' }),
        });
      },
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' }),
    });
  },

  scan() {
    const g = app.globalData;
    wx.scanCode({
      scanType: ['qrCode'],
      success: async (r) => {
        try {
          const res = await api.unlock(g.roomCode, g.who, r.result);
          if (res.ok && res.card) {
            this.setData({ reveal: res.card, done: false });
            this.loadCards();
            wx.vibrateShort();
          } else if (res.ok && res.done) {
            this.setData({ reveal: null, done: true });
            this.loadCards();
          } else if (res.error === 'invalid_token') {
            wx.showToast({ title: '这不是你们的信物码', icon: 'none' });
          } else {
            wx.showToast({ title: '解锁失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
      fail: () => {},
    });
  },
});
