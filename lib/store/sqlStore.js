'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function (thorin, storeObj, opt) {

  const CLEANUP_TIMER = 60 * 60 * 1000, // once an hour
    logger = thorin.logger(opt.logger),
    modelName = opt.namespace,
    expireSec = opt.expire || 3600;

  function getExpiredDate() {
    let expiredCreatedAt = Date.now() + expireSec * 1000;
    expiredCreatedAt = new Date(expiredCreatedAt);
    return expiredCreatedAt;
  }

  /* Step two, once every few hours, we delete the expired sessions. */
  function verifyExpiration(initialStart) {
    if (initialStart && global.THORIN_SETUP) return;
    if (opt.removeExpired === false) return;
    let now = new Date(),
      Session = storeObj.model(modelName);
    Session.destroy({
      where: {
        expire_at: {
          lte: now
        }
      },
      logging: false
    }).then((count) => {
      if (count > 0) {
        logger.trace(`Removed ${count} expired sessions.`);
      }
    }).catch((e) => {
      logger.warn('Failed to perform session cleanup', e);
      logger.trace(e.message);
    }).finally(() => setTimeout(() => verifyExpiration(), CLEANUP_TIMER));
  }

  thorin.on(thorin.EVENT.RUN, 'store.' + storeObj.name, () => {
    verifyExpiration(true);
  });

  const store = {};
  /* Read from the store. */
  store.read = function Read(id, done) {
    let Session = storeObj.model(modelName),
      now = Date.now();
    let qry = {
      where: {
        sid: id
      },
      limit: 1,
      logging: false,
      raw: true
    };
    if (opt.attributes && opt.attributes.length > 0) {
      qry.attributes = opt.attributes;
    }
    Session.findOne(qry).then((sess) => {
      if (!sess) {
        done(null, null);
        return null;
      }
      let expireAt = new Date(sess.expire_at).getTime(),
        customData = null;
      let keys = Object.keys(sess);
      for (let i = 0; i < keys.length; i++) {
        let name = keys[i];
        if (name === 'sid' || name === 'id' || name === 'data' || name === 'expire_at' | name === 'created_at') continue;
        if (!customData) customData = {};
        customData[name] = sess[name];
      }
      if (expireAt <= now) {
        // expired
        Session.destroy({
          where: {
            sid: id
          },
          logging: false,
          limit: 1
        }).then(() => {
          done(null, null);
        }).catch((e) => {
          logger.warn(`Could not destroy expired session`);
          logger.debug(e);
          return done(thorin.error('SESSION.DATA', 'Could not read session'));
        });
        return null;
      }
      done(null, sess.data, customData);
      return null;
    }).catch((e) => {
      done(thorin.error(e));
      return null;
    });
  };

  /* Save */
  store.save = function Save(id, data, done, sessionObj) {
    let Session = storeObj.model(modelName),
      calls = [],
      customFields = sessionObj.getFields(),
      sessObj;
    // step two, update or save.
    calls.push(() => {
      sessObj = Session.build({
        sid: id
      });
      if (!sessionObj.isNew()) {
        sessObj._changed = {};
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
      return sessObj.save({
        logging: false
      });
    });

    thorin.series(calls, (e) => {
      if (e) return done(thorin.error(e));
      done();
      return null;
    });
  };

  /* Destroy */
  store.destroy = function Destroy(id, done) {
    let Session = storeObj.model(modelName);
    Session.destroy({
      where: {
        sid: id
      },
      logging: false,
      limit: 1
    }).then(() => done())
      .catch((e) => {
        logger.warn(`Could not delete session ${id}`);
        logger.debug(e);
        next(e);
      });
  };

  return store;

};
