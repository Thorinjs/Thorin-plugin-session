'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function(thorin, redisStoreObj, opt) {

  const store = {};

  function getKey(id) { // returns the redis key.
    return opt.namespace + ":" + id;
  }
  /* Read from store. */
  store.read = function Read(id, done) {
    redisStoreObj.exec('GET', getKey(id), (e, res) => {
      if(e) return done(e);
      if(typeof res === 'string') {
        try {
          res = JSON.parse(res);
        } catch(e) {}
      }
      done(null, res || null);
    });
  };

  /* Save changes */
  store.save = function Save(id, data, done) {
    if(data == null) return done();
    if(typeof data === 'object') {
      try {
        data = JSON.stringify(data);
      } catch(e) {
        return done(thorin.error('SESSION.SAVE','Could not persist session data', e));
      }
    }
    redisStoreObj.exec('SETEX', getKey(id), opt.expire || 3600, data, done);
  };

  /* Destroy a session */
  store.destroy = function Destroy(id, done) {
    redisStoreObj.exec('DEL', getKey(id), done);
  };

  return store;
};