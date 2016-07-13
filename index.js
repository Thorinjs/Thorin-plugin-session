'use strict';
const path = require('path');
/**
 * Created by Adrian on 08-Apr-16.
 *
 * The Thorin Session plugin will extend the default thorin.Intent
 * Plugin options:
 *  - cookieName: the cookie name, defaults to "tps"
 *  - cookieDomain: '.' -> which domain to apply the cookie
 *  - secure: false -> is the cookie for https only?
 *  - expire=24h - the number of ms till we expire the sessions.
 *  - namespace: the namespace we'll use in the store.
 *  - store: (string, or a thorin store object) -> the store that we will use to
 *            persist our sessions. This should be used in production.
 *      OR
 *  - path: (string, the absolute folder path to use to store sessions as files.) This should be used in dev.
 *
 *  --setup=plugin.session
 */
const sessionIntentInit = require('./lib/sessionIntent'),
  initModel = require('./lib/initModels'),
  sessionStoreInit = require('./lib/sessionStore');
module.exports = function(thorin, opt, pluginName) {
  let storeInfo, sessionStoreObj;
  if(!opt.store) opt.store = 'file';
  if (opt.store) {
    storeInfo = opt.store;
    delete opt.store;
  }
  opt = thorin.util.extend({
    //store: 'file',      // the default storage is the file system.
    cookiePrefix: '',     // should we add a prefix to the cookie key?
    cookieName: 'tps',    // the default cookie name that we're going to use.
    cookiePath: '/',      // the default cookie path that we're going to use.
    secure: false,        // will the cookie work only on HTTPS?
    encrypt: true,        // should we encrypt the session data?
    authorization: true,  // should it add itself as an authorization source? This will attach the plain session id to intentObj.authorization, if found empty
    secret: false,        // will we use a server secret to sign the cookie id?
    logger: pluginName || 'session',
    expire: 3600 * 24,    // the number of seconds a session is active.
    namespace: 'session'  // the default namespace that we're going to use in the store.
  }, opt);
  let SessionStore = sessionStoreInit(thorin, opt),
    logger = thorin.logger(opt.logger);
  sessionStoreObj = new SessionStore(opt);

  // bind the init of the store.
  if (storeInfo === 'file') {
    sessionStoreObj.store = {
      type: 'file',
      path: opt.path || path.normalize(thorin.root + '/sessions')
    }
  }
  if (typeof storeInfo === 'string') {
    if(storeInfo !== 'file') {
      let _timer = setTimeout(() => {
        logger.warn(`Thorin session did not receive a store yet. Please check that the store "${storeInfo}" is registered.`);
      }, 4000); // if we haven't booted the app in 5seconds, we warn.
      thorin.on(thorin.EVENT.INIT, 'store.' + storeInfo, (storeObj) => {
        clearTimeout(_timer);
        sessionStoreObj.store = storeObj;
        if(storeInfo === 'sql') {
          initModel(thorin, storeObj, opt);
        }
      });
    }
  } else if (storeInfo instanceof thorin.Interface.Store) {
    sessionStoreObj.store = storeInfo;
  } else {
    console.error('Thorin plugin session requires a store to work.');
  }

  // TODO: add the setup() function
  sessionIntentInit(thorin, sessionStoreObj, opt);
  sessionStoreObj.name = opt.logger;

  sessionStoreObj.setup = function DoSetup(done) {
    if(storeInfo !== 'sql') { return done(); }
    thorin.on(thorin.EVENT.RUN, 'store.' + storeInfo, (storeObj) => {
      let modelName = opt.namespace;
      storeObj.sync(modelName).catch((e) => {
        logger.warn(`Could not sync db with session model ${modelName}`, e);
      });
    });
    done();
  };

  /* Returns the actual parsed options. */
  sessionStoreObj.options = opt;
  return sessionStoreObj;
};
module.exports.publicName = 'session';