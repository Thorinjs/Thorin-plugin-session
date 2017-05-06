'use strict';

/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function (thorin, opt) {
  const CLEANUP_TIMER = 60 * 60 * 1000, // once an hour
    logger = thorin.logger(opt.logger),
    expireSec = opt.expire || 3600;
  const SESSION_STORE = {};

  /* the file session will try to delete any expired sessions once every x minutes. */
  function verifyExpiration() {
    if (opt.removeExpired === false) return;
    let now = Date.now();
    Object.keys(SESSION_STORE).forEach((id) => {
      let item = SESSION_STORE[id];
      if (!item) return;
      if (now < item.e) return;
      delete SESSION_STORE[id];
    });
  }

  setTimeout(verifyExpiration, CLEANUP_TIMER);
  verifyExpiration();

  const store = {};

  /* Read from store. */
  store.read = function Read(id, done) {
    let json = SESSION_STORE[id];
    if (!json) return done(null, null);
    if (Date.now() >= json.e) {
      store.destroy(id);
      return done(null, null);
    }
    done(null, json.d);
  };

  /* Save changes */
  store.save = function Save(id, data, done) {
    if (data == null) return done();
    let toSave = {
      e: Date.now() + expireSec * 1000,
      d: (typeof data === 'object' ? JSON.stringify(data) : data)
    };
    SESSION_STORE[id] = toSave;
    done();
  };

  /* Destroy a session */
  store.destroy = function Destroy(id, done) {
    delete SESSION_STORE[id];
    done();
  };

  return store;
};