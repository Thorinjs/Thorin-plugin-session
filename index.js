'use strict';
const path = require('path');
/**
 * Created by Adrian on 08-Apr-16.
 *
 * The Thorin Session plugin will extend the default thorin.Intent
 * Plugin options:
 *  - cookieName: the cookie name, defaults to "tps"
 *  - cookieDomain: '.' -> which domain to apply the cookie
 *  - sameSite: true -> if set to true, add the SameSite option
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
const initSessionIntent = require('./lib/sessionIntent'),
  initSessionAction = require('./lib/sessionAction'),
  initModel = require('./lib/initModels'),
  initSessionStore = require('./lib/sessionStore');
module.exports = function init(thorin, opt, pluginName) {
  let storeInfo,
    sessionStoreObj;
  if (!opt.store) opt.store = 'file';
  if (opt.store) {
    storeInfo = opt.store;
    delete opt.store;
  }
  opt = thorin.util.extend({
    //store: 'file',      // file, memory, redis, sql, jwt
    debug: false,
    cookiePrefix: '',     // should we add a prefix to the cookie key?
    cookieName: 'tps',    // the default cookie name that we're going to use.
    cookiePath: '/',      // the default cookie path that we're going to use.
    secure: false,        // will the cookie work only on HTTPS?
    encrypt: true,        // should we encrypt the session data?
    sameSite: false,      // set to true to add SameSite option
    authorization: true,  // should it add itself as an authorization source? This will attach the plain session id to intentObj.authorization, if found empty
    secret: false,        // will we use a server secret to sign the cookie id?
    // JWT: require('jsonwebtoken;);  // for when store.mode=jwt - the JSON Web Token instance to work with.
    logger: pluginName || 'session',
    expire: 3600 * 24,    // the number of seconds a session is active.
    removeExpired: true,  // only applicable for store type sql and file. If set to true, we will not perform the cleanup.
    namespace: 'session',  // the default namespace that we're going to use in the store.
    attributes: []          // a list of attributes (while store='sql') we're using for session. This should not be used generally
  }, opt);
  thorin.config(`plugin.${pluginName}`, opt);
  const logger = thorin.logger(opt.logger);
  // At this point: we need to check the JWT configuration.
  if (storeInfo === 'jwt') {
    opt.encrypt = false;
    if (!opt.secret) {
      logger.fatal(`thorin-plugin-session: jwt mode requires a "secret" to be specified in "plugin.session" configuration.`);
      return process.exit(1);
    }
    let JWT = opt.JWT;
    if (!JWT) {
      try {
        JWT = require('jsonwebtoken');
      } catch (e) {
        logger.fatal(`thorin-plugin-session: jwt mode requires module jsonwebtoken. Please run "npm i jsonwebtoken"`);
        return process.exit(1);
      }
    }
    opt.JWT = JWT;
  }
  let SessionStore = initSessionStore(thorin, opt, storeInfo);
  sessionStoreObj = new SessionStore(opt);

  // bind the init of the store.
  if (storeInfo === 'file') {
    sessionStoreObj.store = {
      type: 'file',
      path: opt.path || path.normalize(thorin.root + '/sessions')
    }
  } else if (storeInfo === 'memory') {
    sessionStoreObj.store = {
      type: 'memory'
    };
  } else if (storeInfo === 'jwt') {
    sessionStoreObj.store = {
      type: 'jwt'
    };
  } else if (typeof storeInfo === 'string') {
    if (storeInfo !== 'file') {
      let _timer = setTimeout(() => {
        logger.warn(`Thorin session did not receive a store yet. Please check that the store "${storeInfo}" is registered.`);
      }, 4000); // if we haven't booted the app in 5seconds, we warn.
      thorin.on(thorin.EVENT.INIT, 'store.' + storeInfo, (storeObj) => {
        clearTimeout(_timer);
        sessionStoreObj.store = storeObj;
        if (storeInfo === 'sql') {
          initModel(thorin, storeObj, opt);
        }
      });
    }
  } else if (storeInfo instanceof thorin.Interface.Store) {
    sessionStoreObj.store = storeInfo;
  } else {
    console.error('Thorin plugin session requires a store to work.');
  }

  initSessionIntent(thorin, sessionStoreObj, opt);
  initSessionAction(thorin, sessionStoreObj, opt);
  sessionStoreObj.name = opt.logger;

  if (storeInfo === 'sql') {
    sessionStoreObj.run = async (allDone) => {
      const storeObj = thorin.store(storeInfo),
        modelName = opt.namespace;
      if (!storeObj) return allDone();
      if (typeof storeObj.settingUp !== 'boolean') return allDone(); // not setting up.
      try {
        logger.info(`Setting up session models`);
        const logging = opt.debug ? (msg) => logger.trace(msg) : false;
        await storeObj.sync(modelName, {
          logging
        });
        allDone();
      } catch (e) {
        logger.warn(`Could not sync db with session model ${modelName}`, e);
        allDone(e);
      }
    }
  }

  /* Returns the actual parsed options. */
  sessionStoreObj.options = opt;
  return sessionStoreObj;
};
module.exports.publicName = 'session';
