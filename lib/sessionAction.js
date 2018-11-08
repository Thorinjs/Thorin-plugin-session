'use strict';
const cookie = require('cookie'),
  SessionData = require('./sessionData');
const AUTHORIZATION_TYPE = 'SESSION';

/**
 * This will extend the default thorin.Action
 */
module.exports = function (thorin, storeObj, opt) {
  const logger = thorin.logger(opt.logger),
    disabled = Symbol(),
    Action = thorin.Action;

  Action.HANDLER_TYPE.SESSION = "session";

  class ThorinAction extends Action {

    constructor(name) {
      super(name);
      this.stack.splice(0, 0, {
        type: thorin.Action.HANDLER_TYPE.SESSION
      });
    }

    _runCustomType(intentObj, handler, done) {
      if (handler.type !== Action.HANDLER_TYPE.SESSION) {
        return super._runCustomType.apply(this, arguments);
      }

      if (this[disabled] === true) {
        intentObj.skipSave();
        return done();
      }
      /* Read the session */
      readSession(intentObj, done);
    }

    /**
     * Marks the current intent action as not usable with sessions,
     * so we do not waste resources onto reading session information
     * */
    session(isEnabled) {
      this[disabled] = isEnabled === false;
      return this;
    }
  }

  /*
  * Read the session from the store.
  * */
  function readSession(intentObj, next) {
    let headers = intentObj.client().headers;
    let sessId;
    try {
      let cookies = cookie.parse(headers['cookie']);
      if (typeof cookies[opt.cookieName] === 'string') {
        let tmp = storeObj.verifySignature(cookies[opt.cookieName]);
        if (tmp) {
          sessId = tmp;
        }
      }
    } catch (e) {
    }
    if (!sessId) sessId = storeObj.readCustomSource(intentObj);
    // IF we don't have a session, we don't have what to read.
    if (!sessId) {
      sessId = storeObj.generateId();
      if (opt.authorization && !intentObj.authorization) {
        intentObj._setAuthorization(AUTHORIZATION_TYPE, sessId);
      }
      intentObj.session = new SessionData(sessId);
      intentObj.session.isNew(true);
      return next();
    }
    if (intentObj.session && intentObj.session.id === sessId) {
      return next();
    }
    // otherwise, we have to retrieve it.
    storeObj.readSession(sessId, (err, data, custom) => {
      // if we failed tor ead from store, empty session.
      if (err) {
        if (err.ns !== 'SESSION') {
          logger.warn('Failed to read session data for sid ' + sessId, err);
        }
        intentObj.session = new SessionData(sessId);
        intentObj.session.isNew(true);
      } else {
        // if there is no session data, we have a new session.
        if (typeof data !== 'object' || !data) {
          intentObj.session = new SessionData(sessId);
          intentObj.session.isNew(true);
        } else {
          intentObj.session = new SessionData(sessId, data);
          intentObj.session.isNew(false);
        }
      }
      if (custom && intentObj.session._setFields) {
        intentObj.session._setFields(custom);
      }
      if (opt.authorization && !intentObj.authorization) {
        intentObj._setAuthorization(AUTHORIZATION_TYPE, sessId);
      }
      next();
    }, false);
  }


  thorin.Action = ThorinAction;

};
