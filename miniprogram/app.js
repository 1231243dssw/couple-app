// app.js —— 全局状态、WebSocket 实时通道、事件总线
const EventBus = require('./utils/event.js');

App({
  // 微信订阅消息模板 ID（在「微信公众平台-功能-订阅消息」申请一次性订阅模板后填到这里）
  // 模板需含字段：thing1（提醒事项）、thing2（内容）、time3（时间）
  WX_SUBSCRIBE_TMPL_ID: '',
  globalData: {
    // 正式云后端（Railway 部署，https+wss，任何网络可用）
    serverUrl: 'https://couple-miss-backend-production.up.railway.app',
    wsUrl: 'wss://couple-miss-backend-production.up.railway.app',
    shareCode: '',
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
    // 弃用旧缓存：localhost / 平台旧域名 / 局域网 IP（10.15.20.x、172.20.10.x），统一切到云后端
    if (s && (s.indexOf('localhost') >= 0 || s.indexOf('app.workbuddy.host') >= 0 ||
        s.indexOf('10.15.20.') >= 0 || s.indexOf('172.20.10.') >= 0)) {
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

  // 恢复为云后端默认配置（一键修复地址填错的情况）
  resetToDefault() {
    const d = {
      serverUrl: 'https://couple-miss-backend-production.up.railway.app',
      wsUrl: 'wss://couple-miss-backend-production.up.railway.app',
      shareCode: '',
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
    if (g._noReconnect) return;
    if (g._reconnectTimer) return;
    g._reconnectTimer = setTimeout(() => {
      g._reconnectTimer = null;
      if (g.roomCode && !g._noReconnect) this.connectWS();
    }, 3000);
  },

  // 房间不存在等情况：清掉本地绑定回到配对页，停止重连
  clearRoomAndRestart() {
    const g = this.globalData;
    g._noReconnect = true;
    if (g.wsTask) { try { g.wsTask.close(); } catch (e) {} }
    g.wsTask = null;
    g.wsReady = false;
    g.roomCode = '';
    g.room = null;
    wx.removeStorageSync('roomCode');
    wx.removeStorageSync('who');
    wx.removeStorageSync('myName');
    wx.reLaunch({ url: '/pages/splash/splash' });
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
      case 'rps_result':
        wx.vibrateShort();
        EventBus.emit('rps_result', msg);
        break;
      case 'rps_wait':
        EventBus.emit('rps_wait', msg);
        break;
      case 'error':
        // 房间不存在（多半是旧缓存邀请码在云端已不存在）：清掉本地绑定回到配对页，避免死循环重连
        if (msg.error && /房间/.test(msg.error)) {
          this.clearRoomAndRestart();
        }
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
