const app = getApp();
const EventBus = require('../../utils/event.js');

const MOODS = [
  { k: 'happy', e: '😊', label: '开心' },
  { k: 'calm', e: '😌', label: '平静' },
  { k: 'miss', e: '🥺', label: '想念' },
  { k: 'sad', e: '😢', label: '难过' },
  { k: 'tired', e: '😪', label: '疲惫' },
  { k: 'excited', e: '🤩', label: '兴奋' },
];

Page({
  data: {
    emojis: ['💖', '😘', '🤗', '🌹', '✨', '😍', '🐱', '🌈'],
    moods: MOODS,
    mood: '',
    moodLabel: '',
    moodNote: '',
    partnerMood: null,
  },
  _offs: [],

  onShow() {
    this._offs.push(EventBus.on('mood', (m) => this.onPartnerMood(m)));
  },
  onHide() { this._unsub(); },
  onUnload() { this._unsub(); },
  _unsub() { (this._offs || []).forEach((f) => f()); this._offs = []; },

  onHug() {
    if (app.sendHug()) wx.showToast({ title: '拥抱已送达 🤗', icon: 'none' });
    else wx.showToast({ title: '连接中，稍后再试', icon: 'none' });
  },
  onReact(e) {
    const emoji = e.currentTarget.dataset.e;
    if (app.sendReact(emoji)) {
      wx.showToast({ title: '已发送 ' + emoji, icon: 'none' });
    } else {
      wx.showToast({ title: '连接中，稍后再试', icon: 'none' });
    }
  },
  pickMood(e) {
    this.setData({ mood: e.currentTarget.dataset.k, moodLabel: e.currentTarget.dataset.label });
  },
  onMoodNote(e) { this.setData({ moodNote: e.detail.value }); },
  sendMood() {
    if (!this.data.mood) { wx.showToast({ title: '先选一个心情', icon: 'none' }); return; }
    const ok = app.sendMood(this.data.moodLabel, this.data.moodNote);
    if (ok) {
      wx.showToast({ title: '心情已告诉 TA 💕', icon: 'none' });
      this.setData({ mood: '', moodLabel: '', moodNote: '' });
    } else {
      wx.showToast({ title: '连接中，稍后再试', icon: 'none' });
    }
  },
  onPartnerMood(m) {
    const map = {};
    MOODS.forEach((x) => (map[x.label] = x.e));
    const d = new Date(m.ts);
    const timeText = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    this.setData({
      partnerMood: { emoji: map[m.mood] || '💭', label: m.mood, note: m.note, timeText },
    });
    wx.showToast({ title: 'TA 分享了心情', icon: 'none' });
  },
});
