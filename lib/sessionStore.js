'use strict';
/**
 * Created by Adrian on 08-Apr-16.
 * This is the sessionStore wrapper, that works
 * with a thorin store. It only exposes
 * get,
 * set
 */
const RedisStore = require('./store/redisStore'),
  FileStore = require('./store/fileStore'),
  SqlStore = require('./store/sqlStore'),
  MemStore = require('./store/memoryStore'),
  SessionData = require('./sessionData');

module.exports = function init(thorin, opt) {

  const ERROR_NOT_READY = thorin.error('SESSION.NOT_READY', 'Session storage is not ready.', 502),
    ERROR_INVALID = thorin.error('SESSION.INVALID', 'The session data is not valid');

  const logger = thorin.logger(opt.logger);
  const SID_SPLIT = '.',
    ENC_SPLIT = '#';


  class ThorinSessionStore {

    #store = null;
    #customSource = null;

    constructor() {
      this.expire = opt.expire;
    }

    set store(storeObj) {
      if (this.#store) return;
      this.#store = this.#createStore(storeObj);
    }

    get store() {
      return null;
    }  // we do not expose the store.

    /**
     * Register a custom session id source to use,
     * when cookie is not present.
     * */
    customSource(fn) {
      if (typeof fn !== 'function' || !fn) {
        logger.warn('Thorin: sessionStore.customSource() requires a fn');
        return false;
      }
      this.#customSource = fn;
    }

    readCustomSource(intentObj) {
      if (!this.#customSource) return null;
      try {
        return this.#customSource(intentObj);
      } catch (e) {
        logger.warn(`Thorin.session: customSource() threw an error`);
        logger.debug(e);
      }
    }

    /**
     * This is the session store's ID generator.
     * Default size: 48 chars
     * */
    generateId() {
      let id = thorin.util.uuid.v4().replace(/-/g, ''),
        rand = thorin.util.randomString(8),
        hash = thorin.util.sha2(id + '' + Date.now());
      hash = hash.substr(0, 8);
      let k = rand + id + hash;
      if (opt.cookiePrefix && opt.cookiePrefix !== '') {
        k = opt.cookiePrefix + k;
      }
      return k;
    }

    /**
     * Signs the generated cookie ID
     * */
    signId(sid) {
      if (!opt.secret) return sid;
      if (typeof sid !== 'string') return false;
      // if it's already signed, we return it as is.
      let tmp = sid.split(SID_SPLIT);
      if (tmp.length !== 1) return sid;
      let sign = thorin.util.hmac(sid, opt.secret, 'sha1');
      sid = sid + SID_SPLIT + sign;
      return sid;
    }

    /**
     * Verifies the cookie's signature
     * */
    verifySignature(sid) {
      if (!opt.secret) return sid;
      let tmp = sid.split(SID_SPLIT);
      if (tmp.length !== 2) return false;
      let sessId = tmp[0],
        sign = tmp[1];
      let verifySign = thorin.util.hmac(sessId, opt.secret, 'sha1');
      if (thorin.util.compare(verifySign, sign)) {
        return sessId;
      }
      return false;
    }

    /**
     * Saves the given session ID with the attached data.
     * NOTE: when we store session ids, we do not store the actual sess ID as a key,
     * we hash it like a password, so that session stealing is less likely if someone
     * gains access to the session store.
     * */
    saveSession(sessionObj, done) {
      done = (typeof done === 'function' ? done : noop);
      if (!this.#store) {
        logger.warn('Session storage is not ready for saveSession.');
        return done(ERROR_NOT_READY);
      }
      if (!(sessionObj instanceof SessionData)) {
        logger.warn('saveSession(sessObj, done), sessObj must be an instance of sessionPlugin.SessionData');
        return done(ERROR_INVALID);
      }
      let data = sessionObj.getData(),
        id = sessionObj.id;
      if (typeof id !== 'string' || typeof data === 'undefined' || data == null) {
        return done(null, false);
      }
      let shouldSave = sessionObj.shouldSave();
      if (!shouldSave) {
        return done(null, false);
      }
      sessionObj._setSaved();
      this.#store.save(this.#getSecureSid(id), this.#encryptData(id, data), (e) => {
        if (e) return done && done(e);
        done(null, true);
      }, sessionObj);
    }

    /**
     * Destroys a session by its id.
     * */
    destroySession(id, done) {
      done = (typeof done === 'function' ? done : noop);
      if (!this.#store) {
        logger.warn('Session storage is not ready for destroySession.');
        return done(ERROR_NOT_READY);
      }
      if (id instanceof SessionData) {
        id = id.id;
      }
      this.#store.destroy(this.#getSecureSid(id), done);
    }

    /**
     * Tries to retrieve a session, by its id.
     * */
    readSession(id, done, shouldBuildObject) {
      done = (typeof done === 'function' ? done : noop);
      if (!this.#store) {
        logger.warn('Session storage is not ready for readSession.');
        return done(ERROR_NOT_READY);
      }
      if (id instanceof SessionData) {
        id = id.id;
      }
      if (id.indexOf(SID_SPLIT) !== -1) {
        id = this.verifySignature(id);
      }
      if (id === false) {
        return done(null, null);
      }
      this.#store.read(this.#getSecureSid(id), (e, data, _custom) => {
        if (e) return done(e);
        data = this.#decryptData(id, data);
        let res;
        if (data && shouldBuildObject !== false) {
          res = new SessionData(id, data);
          if (_custom) {
            res._setFields(_custom);
          }
        } else {
          res = data;
        }
        done(null, res, _custom);
      });
    }

    /**
     * If we have encryption enabled, we hash the sessid and encrypt the content with the sid.
     *
     * */
    #getSecureSid = (sid) => {
      if (!opt.encrypt) return sid;
      return thorin.util.sha2(sid);
    }

    /**
     * If encryption is enabled, it tries to encrypt the data.
     * */

    #encryptData = (sid, data) => {
      if (typeof data !== 'object' || data === null) return "";
      data = JSON.stringify(data);
      if (!opt.encrypt) return data;
      let encrypted = thorin.util.encrypt(data, sid);
      if (!encrypted) {
        return data;
      }
      encrypted = ENC_SPLIT + encrypted;
      return encrypted;
    }

    /**
     * Tries to decrypt the session data
     * */
    #decryptData = (sid, data) => {
      if (typeof data !== 'string') return data;
      if (data.charAt(0) !== ENC_SPLIT) {
        try {
          data = JSON.parse(data);
        } catch (e) {
        }
        return data;
      } else {
        data = data.substr(1);
      }
      let decrypted = thorin.util.decrypt(data, sid);
      if (decrypted === false) {
        logger.warn('Failed to decrypt session data for sid ' + sid);
        return {};
      }
      try {
        data = JSON.parse(decrypted);
      } catch (e) {
        logger.warn('Failed to parse decrypted data for sid ' + sid);
        return decrypted;
      }
      return data;
    }

    /**
     * Manually create the correct session store
     * */
    #createStore = (storeObj) => {
      switch (storeObj.type) {
        case 'redis':
          return RedisStore(thorin, storeObj, opt);
        case 'sql':
          return SqlStore(thorin, storeObj, opt);
        case 'file':
          return FileStore(thorin, storeObj.path, opt);
        case 'memory':
          return MemStore(thorin, opt);
        default:
          throw thorin.error('PLUGIN_SESSION', `Invalid session store ${storeObj.type} for the session plugin.`);
      }
    }

  }


  function noop() {
  }

  return ThorinSessionStore;
};
