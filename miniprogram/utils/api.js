// utils/api.js —— REST 封装
function base() {
  const app = getApp();
  return app.globalData.serverUrl;
}

// 发布平台要求每个请求都带 sharecode 访问令牌
function withShare(path) {
  const app = getApp();
  const sc = app.globalData.shareCode;
  if (!sc) return path;
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + sc;
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: base() + withShare(path),
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success: (res) => resolve(res.data),
      fail: (err) => reject(err),
    });
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
    return request('GET', '/api/cards');
  },
};
