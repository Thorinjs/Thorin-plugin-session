'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function (thorin, storeObj, opt) {

  const CLEANUP_TIMER = 60 * 60 * 1000, // once an hour
    logger = thorin.logger(opt.logger),
    modelName = opt.namespace,
    expireSec = opt.expire || 3600,
    logging = opt.debug ? (msg) => logger.trace(msg) : false;

  function getExpiredDate() {
    let expiredCreatedAt = Date.now() + expireSec * 1000;
    expiredCreatedAt = new Date(expiredCreatedAt);
    return expiredCreatedAt;
  }

  /* Step two, once every few hours, we delete the expired sessions. */
  async function verifyExpiration(initialStart) {
    if (initialStart && global.THORIN_SETUP) return;
    if (opt.removeExpired === false) return;
    let now = new Date(),
      Session = storeObj.model(modelName);
    try {
      let count = await Session.destroy({
        where: {
          expire_at: {
            $lte: now
          }
        },
        logging
      });
      if (count > 0 && opt.debug) {
        logger.trace(`Removed ${count} expired sessions.`);
      }
    } catch (e) {
      logger.warn('Failed to perform session cleanup', e);
      if (opt.debug) {
        logger.trace(e.message);
      }
    }
    setTimeout(() => verifyExpiration(), CLEANUP_TIMER)
  }

  thorin.on(thorin.EVENT.RUN, 'store.' + storeObj.name, () => {
    verifyExpiration(true);
  });

  const store = {};
  /**
   * Query the db for a single sessid
   * */
  store.read = async function Read(id, done) {
    let Session = storeObj.model(modelName),
      now = Date.now();
    let qry = {
      where: {
        sid: id
      },
      limit: 1,
      logging,
      raw: true
    };
    if (opt.attributes && opt.attributes.length > 0) {
      qry.attributes = opt.attributes;
    }
    try {
      let sess = await Session.findOne(qry);
      if (!sess) {
        return done(null, null);
      }
      let expireAt = new Date(sess.expire_at).getTime();
      if (expireAt <= now) {
        // expired
        await destroySession(id);
        return done(null, null);
      }
      let customData = null;
      let keys = Object.keys(sess);
      for (let i = 0; i < keys.length; i++) {
        let name = keys[i];
        if (name === 'sid' || name === 'id' || name === 'data' || name === 'expire_at' | name === 'created_at') continue;
        if (!customData) customData = {};
        customData[name] = sess[name];
      }
      return done(null, sess.data, customData);
    } catch (e) {
      logger.warn(`Could not read session [${id}]`);
      if (opt.debug) logger.trace(e);
      return done(thorin.error(e));
    }
  };

  /**
   * Save the given data to the db
   * */
  store.save = async function Save(id, data, done, sessionObj) {
    const Session = storeObj.model(modelName),
      customFields = sessionObj.getFields();
    let sessObj = Session.build({
      sid: id
    });
    if (!sessionObj.isNew()) {
      if (!sessionObj._changed) sessionObj._changed = new Set();
      if (sessionObj._changed.clear) {
        sessObj._changed.clear();
      } else {
        sessObj._changed = {};
      }
      sessObj.isNewRecord = false;
    }
    if (sessionObj.hasChanges()) {
      sessObj.set('data', data);
    }
    sessObj.set('expire_at', getExpiredDate());
    if (customFields) {
      Object.keys(customFields).forEach((keyName) => {
        sessObj.set(keyName, customFields[keyName]);
      });
    }
    try {
      await sessObj.save({
        logging
      });
      done();
    } catch (e) {
      logger.warn(`Could not store sess [${id}]`);
      if (opt.debug) logger.trace(e);
      return done(e);
    }
  }

  /**
   * Destroy a session from the db
   * */
  store.destroy = async function Destroy(id, done) {
    await destroySession(id);
    done();
  }

  /**
   * Manually destroy a session
   * */
  async function destroySession(id) {
    const Session = storeObj.model(modelName);
    try {
      await Session.destroy({
        where: {
          sid: id
        },
        logging,
        limit: 1
      });
      return true;
    } catch (e) {
      logger.warn(`Could not delete session [${id}]`);
      if (opt.debug) logger.trace(e);
      return false;
    }
  }

  return store;

};
