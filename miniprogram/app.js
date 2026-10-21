// app.js —— 全局状态、WebSocket 实时通道、事件总线
const EventBus = require('./utils/event.js');

App({
  globalData: {
    // 已上线的公网后端（WorkBuddy 应用发布平台），所有请求需带 sharecode 访问令牌
    serverUrl: 'https://couple-miss-backend.app.workbuddy.host',
    wsUrl: 'wss://couple-miss-backend.app.workbuddy.host',
    shareCode: 'U7W3ROOKF2',
    userId: '',
    roomCode: '',
    who: 'A',
    room: null,
    stats: null,
    wsTask: null,
    wsReady: false,
    _reconnectTimer: null,
  },

  onLaunch() {
    const s = wx.getStorageSync('serverUrl');
    const ws = wx.getStorageSync('wsUrl');
    const sc = wx.getStorageSync('shareCode');
    // 弃用指向 localhost（本机调试残留）或 app.workbuddy.host 的旧缓存，统一用内置默认公网配置
    if (s && (s.indexOf('localhost') >= 0 || s.indexOf('app.workbuddy.host') >= 0)) {
      wx.removeStorageSync('serverUrl');
      wx.removeStorageSync('wsUrl');
      wx.removeStorageSync('shareCode');
    } else {
      if (s) this.globalData.serverUrl = s;
      if (ws) this.globalData.wsUrl = ws;
      if (sc) this.globalData.shareCode = sc;
    }

    let uid = wx.getStorageSync('userId');
    if (!uid) {
      uid = 'u_' + Math.random().toString(36).slice(2, 12);
      wx.setStorageSync('userId', uid);
    }
    this.globalData.userId = uid;
    this.globalData.roomCode = wx.getStorageSync('roomCode') || '';
    this.globalData.who = wx.getStorageSync('who') || 'A';

    if (this.globalData.roomCode) {
      this.connectWS();
    }
    this.globalData.EventBus = EventBus;
  },

  genId() {
    return 'u_' + Math.random().toString(36).slice(2, 12);
  },

  // 设置服务器地址（可附带 sharecode 访问令牌）
  setServer(httpUrl, wsUrl, shareCode) {
    this.globalData.serverUrl = httpUrl;
    this.globalData.wsUrl = wsUrl;
    wx.setStorageSync('serverUrl', httpUrl);
    wx.setStorageSync('wsUrl', wsUrl);
    if (shareCode) {
      this.globalData.shareCode = shareCode;
      wx.setStorageSync('shareCode', shareCode);
    }
  },

  // 恢复为已上线的公网默认配置（一键修复地址/令牌填错的情况）
  resetToDefault() {
    const d = {
      serverUrl: 'https://couple-miss-backend.app.workbuddy.host',
      wsUrl: 'wss://couple-miss-backend.app.workbuddy.host',
      shareCode: 'U7W3ROOKF2',
    };
    this.globalData.serverUrl = d.serverUrl;
    this.globalData.wsUrl = d.wsUrl;
    this.globalData.shareCode = d.shareCode;
    wx.setStorageSync('serverUrl', d.serverUrl);
    wx.setStorageSync('wsUrl', d.wsUrl);
    wx.setStorageSync('shareCode', d.shareCode);
    return d;
  },

  connectWS() {
    const g = this.globalData;
    if (!g.roomCode) return;
    if (g.wsTask) {
      try { g.wsTask.close(); } catch (e) {}
    }
    if (g._reconnectTimer) { clearTimeout(g._reconnectTimer); g._reconnectTimer = null; }

    const url = `${g.wsUrl}/ws?code=${g.roomCode}&who=${g.who}&userId=${g.userId}&sharecode=${g.shareCode}`;
    const task = wx.connectSocket({ url, fail: () => {} });
    g.wsTask = task;

    task.onOpen(() => {
      g.wsReady = true;
      EventBus.emit('ws', { type: 'open' });
    });
    task.onMessage((res) => {
      let msg;
      try { msg = JSON.parse(res.data); } catch (e) { return; }
      this.handleMsg(msg);
    });
    task.onClose(() => {
      g.wsReady = false;
      this.scheduleReconnect();
    });
    task.onError(() => {
      g.wsReady = false;
    });
  },

  scheduleReconnect() {
    const g = this.globalData;
    if (g._reconnectTimer) return;
    g._reconnectTimer = setTimeout(() => {
      g._reconnectTimer = null;
      if (g.roomCode) this.connectWS();
    }, 3000);
  },

  sendWS(obj) {
    const g = this.globalData;
    if (g.wsTask && g.wsReady) {
      g.wsTask.send({ data: JSON.stringify(obj) });
      return true;
    }
    return false;
  },

  handleMsg(msg) {
    const g = this.globalData;
    switch (msg.type) {
      case 'welcome':
        g.room = msg.room;
        g.stats = msg.stats;
        EventBus.emit('state', msg);
        break;
      case 'presence':
        if (g.room) g.room.online = msg.online;
        EventBus.emit('presence', msg.online);
        break;
      case 'miss_incoming':
        g.stats = msg.stats;
        wx.vibrateLong();
        EventBus.emit('miss', msg);
        break;
      case 'hug_incoming':
        wx.vibrateShort();
        EventBus.emit('hug', msg);
        break;
      case 'react_incoming':
        wx.vibrateShort();
        EventBus.emit('react', msg);
        break;
      case 'mood_incoming':
        EventBus.emit('mood', msg);
        break;
      case 'scheduled':
        wx.vibrateLong();
        EventBus.emit('scheduled', msg);
        break;
      case 'stats':
        g.stats = msg.stats;
        EventBus.emit('stats', msg.stats);
        break;
      case 'diary_new':
        EventBus.emit('diary_new', msg);
        break;
      case 'card_unlocked':
        wx.vibrateShort();
        wx.showToast({ title: (msg.fromName || 'TA') + ' 解锁了一张爱意卡片 💌', icon: 'none' });
        EventBus.emit('card_unlocked', msg);
        break;
      default:
        break;
    }
  },

  // 供页面统一发“思念”
  sendMiss() {
    return this.sendWS({ type: 'miss' });
  },
  sendHug() {
    return this.sendWS({ type: 'hug' });
  },
  sendReact(emoji) {
    return this.sendWS({ type: 'react', emoji });
  },
  sendMood(mood, note) {
    return this.sendWS({ type: 'mood', mood, note });
  },
});
