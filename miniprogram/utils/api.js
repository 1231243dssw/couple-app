// utils/api.js —— REST 封装
// 兜底真值：与 app.js 的默认配置保持一致（已上线的公网后端，需带 sharecode）
const APP_DEFAULT = {
  serverUrl: 'http://172.20.10.2:3000',
  wsUrl: 'ws://172.20.10.2:3000',
  shareCode: '',
};

function getApp_() {
  return getApp();
}

// 拼接 sharecode 访问令牌
function withShare(path, shareCode) {
  if (!shareCode) return path;
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + shareCode;
}

function activeServerUrl() {
  return getApp_().globalData.serverUrl || APP_DEFAULT.serverUrl;
}
function activeShareCode() {
  return getApp_().globalData.shareCode || APP_DEFAULT.shareCode;
}

// 把正确的默认配置写回，避免每次请求都走一次回退重试
function healToDefault() {
  const app = getApp_();
  app.globalData.serverUrl = APP_DEFAULT.serverUrl;
  app.globalData.wsUrl = APP_DEFAULT.wsUrl;
  app.globalData.shareCode = APP_DEFAULT.shareCode;
  wx.setStorageSync('serverUrl', APP_DEFAULT.serverUrl);
  wx.setStorageSync('wsUrl', APP_DEFAULT.wsUrl);
  wx.setStorageSync('shareCode', APP_DEFAULT.shareCode);
}

// 真正发一次请求
function doRequest(url, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject({ statusCode: res.statusCode, data: res.data });
          return;
        }
        // 返回的是字符串（多半是“链接不完整”那种 HTML 页）= 地址或令牌不对
        if (typeof res.data === 'string') {
          reject({ statusCode: 0, html: true, data: res.data });
          return;
        }
        resolve(res.data);
      },
      fail: (err) => reject({ netError: (err && err.errMsg) || '网络错误，检查服务器地址' }),
    });
  });
}

function request(method, path, data) {
  const url1 = activeServerUrl() + withShare(path, activeShareCode());
  return doRequest(url1, method, data).catch((err) => {
    // 命中“缺/错令牌”类失败（平台返回 403 或 HTML 页）：自动用默认配置重试一次
    const isTokenFail =
      err.statusCode === 403 || err.html === true || /链接不完整/.test(String(err.data || ''));
    if (isTokenFail) {
      const url2 = APP_DEFAULT.serverUrl + withShare(path, APP_DEFAULT.shareCode);
      return doRequest(url2, method, data).then((ok) => {
        healToDefault(); // 顺手修好本地配置，下次不再重试
        return ok;
      }).catch((e2) => {
        if (e2.netError) throw new Error('【甲】网络错误：请求没发出去，多半是没勾「不校验合法域名」');
        if (e2.html) throw new Error('【乙】返回了网页不是数据，地址填错');
        throw new Error('【丙】自愈重试仍403：模拟器请求被平台拦了，需换本地后端或真实AppID');
      });
    }
    if (err.netError) throw new Error('【甲】网络错误：请求没发出去，多半是没勾「不校验合法域名」');
    if (err.html) throw new Error('【乙】返回了网页不是数据，地址填错');
    throw new Error('【丁】HTTP ' + (err.statusCode || '?') + '：其它异常');
  });
}

module.exports = {
  createRoom(name) {
    return request('POST', '/api/room/create', { name });
  },
  joinRoom(code, name) {
    return request('POST', '/api/room/join', { code, name });
  },
  getRoomState(code, who) {
    return request('GET', `/api/room/${code}/state?who=${who}`);
  },
  getStats(code) {
    return request('GET', `/api/stats/${code}`);
  },
  getSchedules(code) {
    return request('GET', `/api/schedule/${code}`);
  },
  addSchedule(code, text, time, createdBy) {
    return request('POST', '/api/schedule', { code, text, time, createdBy });
  },
  updateSchedule(id, patch) {
    return request('PUT', '/api/schedule', { id, patch });
  },
  deleteSchedule(id) {
    return request('DELETE', `/api/schedule/${id}`);
  },
  getDiaries(code) {
    return request('GET', `/api/diary/${code}`);
  },
  addDiary(code, title, body, from, type) {
    return request('POST', '/api/diary', { code, title, body, from, type });
  },
  markDiaryRead(code, id, who) {
    return request('POST', '/api/diary/read', { code, id, who });
  },
  randomQuote() {
    return request('GET', '/api/quote/random');
  },
  quotes() {
    return request('GET', '/api/quotes');
  },
  // 信物 & 卡片
  getToken(code) {
    return request('GET', `/api/room/${code}/token`);
  },
  getCollected(code, who) {
    return request('GET', `/api/room/${code}/cards?who=${who}`);
  },
  unlock(code, who, token) {
    return request('POST', `/api/room/${code}/unlock`, { who, token });
  },
  cardDeck() {
    return request('GET', `/api/cards`);
  },
};
