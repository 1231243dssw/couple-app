const app = getApp();
const EventBus = require('../../utils/event.js');

const CHOICES = [
  { k: 'rock', e: '✊', label: '石头' },
  { k: 'scissors', e: '✌️', label: '剪刀' },
  { k: 'paper', e: '✋', label: '布' },
];

Page({
  data: {
    choices: CHOICES,
    myChoice: '',
    status: 'idle', // idle | waiting | result
    statusText: '选一个，和 TA 来一局',
    resultText: '',
    resultClass: '',
    partnerChose: false,
  },
  _offs: [],

  onShow() {
    this._offs.push(EventBus.on('rps_result', (m) => this.onResult(m)));
    this._offs.push(EventBus.on('rps_wait', () => this.onWait()));
    if (!app.globalData.roomCode) {
      wx.showToast({ title: '请先绑定房间', icon: 'none' });
    }
  },
  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() { (this._offs || []).forEach((f) => f()); this._offs = []; },

  onWait() {
    // 收到 rps_wait 说明对方已出拳，在等我
    if (this.data.status === 'idle') {
      this.setData({ partnerChose: true, statusText: 'TA 已出拳，快出拳！' });
    }
  },

  choose(e) {
    const k = e.currentTarget.dataset.k;
    if (this.data.status === 'waiting') return;
    const ok = app.sendWS({ type: 'rps', choice: k });
    if (!ok) {
      wx.showToast({ title: '连接中，稍后再试', icon: 'none' });
      return;
    }
    this.setData({ myChoice: k, status: 'waiting', statusText: '已出拳，等 TA…', partnerChose: false });
    wx.vibrateShort();
  },

  onResult(m) {
    const g = app.globalData;
    const who = g.who;
    let text, cls;
    if (m.winner === 'tie') {
      text = '平局，再来一局！';
      cls = 'tie';
    } else if (m.winner === who) {
      text = '你赢啦 🎉';
      cls = 'win';
    } else {
      text = 'TA 赢了，不服来战';
      cls = 'lose';
    }
    const myLabel = CHOICES.find((c) => c.k === m[who.toLowerCase()]).e;
    const opLabel = CHOICES.find((c) => c.k === m[who === 'A' ? 'b' : 'a']).e;
    this.setData({
      status: 'result',
      statusText: `你${myLabel} · TA${opLabel}`,
      resultText: text,
      resultClass: cls,
    });
    wx.vibrateLong();
  },

  again() {
    this.setData({ myChoice: '', status: 'idle', statusText: '选一个，和 TA 来一局', resultText: '', resultClass: '', partnerChose: false });
  },
});
