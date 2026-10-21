// utils/event.js —— 极简事件总线，用于跨页面/组件通信（如全局思念弹层）
const listeners = {};

const EventBus = {
  on(type, cb) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(cb);
    return () => EventBus.off(type, cb);
  },
  off(type, cb) {
    if (!listeners[type]) return;
    listeners[type] = listeners[type].filter((f) => f !== cb);
  },
  emit(type, payload) {
    (listeners[type] || []).forEach((cb) => {
      try { cb(payload); } catch (e) { console.error(e); }
    });
  },
};

module.exports = EventBus;
