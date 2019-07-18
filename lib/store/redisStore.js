'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function (thorin, redisStoreObj, opt) {

  const store = {},
    logger = thorin.logger(opt.logger);

  function getKey(id) { // returns the redis key.
    return opt.namespace + ":" + id;
  }

  /* Read from store. */
  store.read = function Read(id, done) {
    let sid = getKey(id);
    if (opt.debug === true) logger.debug(`GET ${sid}`);
    redisStoreObj.exec('GET', sid, (e, res) => {
      if (e) return done(e);
      if (typeof res === 'string') {
        try {
          res = JSON.parse(res);
        } catch (e) {
        }
      }
      done(null, res || null);
    });
  };

  /* Save changes */
  store.save = function Save(id, data, done) {
    if (data == null) return done();
    if (typeof data === 'object') {
      try {
        data = JSON.stringify(data);
      } catch (e) {
        return done(thorin.error('SESSION.SAVE', 'Could not persist session data', e));
      }
    }
    let sid = getKey(id);
    if (opt.debug === true) {
      logger.debug(`SET ${sid}`, data);
    }
    redisStoreObj.exec('SETEX', sid, opt.expire || 3600, data, done);
  };

  /* Destroy a session */
  store.destroy = function Destroy(id, done) {
    let sid = getKey(id);
    if (opt.debug === true) {
      logger.debug(`DEL ${sid}`);
    }
    redisStoreObj.exec('DEL', sid, done);
  };

  return store;
};