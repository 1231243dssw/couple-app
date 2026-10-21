// components/miss-overlay/miss-overlay.js
const EventBus = require('../../utils/event.js');
const app = getApp();

Component({
  data: {
    visible: false,
    type: '',
    fromName: '',
    text: '',
    emoji: '',
    hearts: [],
  },
  lifetimes: {
    attached() {
      this._offs = [];
      this._offs.push(EventBus.on('miss', (m) => this.show('miss', { fromName: m.fromName || 'TA' })));
      this._offs.push(EventBus.on('scheduled', (m) => this.show('scheduled', { text: m.text || '' })));
      this._offs.push(EventBus.on('hug', (m) => this.show('hug', { fromName: m.fromName || 'TA' }, true)));
      this._offs.push(EventBus.on('react', (m) => this.show('react', { fromName: m.fromName || 'TA', emoji: m.emoji || '💖' }, true)));
    },
    detached() {
      (this._offs || []).forEach((off) => off());
    },
  },
  methods: {
    spawnHearts() {
      const hearts = [];
      for (let i = 0; i < 18; i++) {
        hearts.push({
          id: i,
          left: Math.floor(Math.random() * 700),
          delay: (Math.random() * 1.6).toFixed(2),
        });
      }
      this.setData({ hearts });
    },
    show(type, extra, light) {
      this.setData({
        visible: true,
        type,
        fromName: extra.fromName || '',
        text: extra.text || '',
        emoji: extra.emoji || '',
      });
      if (!light) this.spawnHearts();
    },
    close() {
      this.setData({ visible: false, hearts: [] });
    },
    noop() {},
    onHugBack() {
      app.sendHug();
      wx.showToast({ title: '抱抱已送达 🤗', icon: 'none' });
      this.close();
    },
    onMissBack() {
      app.sendMiss();
      wx.showToast({ title: '思念已回传 💗', icon: 'none' });
      this.close();
    },
  },
});
