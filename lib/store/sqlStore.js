'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function(thorin, storeObj, opt) {

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
  function verifyExpiration() {
    let now = new Date(),
      Session = storeObj.model(modelName);
    Session.destroy({
      where: {
        expire_at: {
          lte: now
        }
      }
    }).then((count) => {
      if(count > 0) {
        logger.trace(`Removed ${count} expired sessions.`);
      }
    }).catch((e) => {
      logger.warn('Failed to perform session cleanup', e);
    }).finally(() => setTimeout(verifyExpiration, CLEANUP_TIMER));
  }
  thorin.on(thorin.EVENT.RUN, 'store.' + storeObj.name, () => {
    setTimeout(verifyExpiration, CLEANUP_TIMER);
    verifyExpiration();
  });

  const store = {};

  /* Read from the store. */
  store.read = function Read(id, done) {
    let Session = storeObj.model(modelName);
    Session.find({
      where: {
        sid: id,
        expire_at: {
          gt: Date.now()
        }
      },
      attributes: ['id', 'data'],
      raw: true
    }).then((sess) => {
      if (!sess) return done(null, null);
      done(null, sess.data);
    }).catch((e) => done(thorin.error(e)));
  };

  /* Save */
  store.save = function Save(id, data, done) {
    let Session = storeObj.model(modelName),
      calls = [],
      sessObj;
    // step one, read if we have one.
    calls.push(() => {
      return Session.find({
        where: {
          sid: id
        }
      }).then((sObj) => {
        if (sObj) {
          sessObj = sObj;
        }
      });
    });
    // step two, update or save.
    calls.push(() => {
      if (!sessObj) {
        sessObj = Session.build({
          sid: id
        });
      }
      sessObj.set('data', data);
      sessObj.set('expire_at', getExpiredDate());
      return sessObj.save();
    });

    thorin.series(calls, (e) => {
      if (e) return done(thorin(e));
      done();
    });
  };

  /* Destroy */
  store.destroy = function Destroy(id, done) {
    console.log("DESTROY", id);
    return done && done();
  };

  return store;

};