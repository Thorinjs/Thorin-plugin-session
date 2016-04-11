'use strict';
const cookie = require('cookie'),
  SessionData = require('./sessionData');
/**
 * Created by Adrian on 08-Apr-16.
 * This extends the default thorin.Intent class to add a few properties to it.
 */
const AUTHORIZATION_TYPE = 'SESSION';
module.exports = function(thorin, storeObj, opt) {
  let session = Symbol(),
    logger = thorin.logger(opt.logger);

  /* Returns the cookie options. */
  function getCookieOptions() {
    let cookieOpt = {
      httpOnly: true
    };
    if(opt.cookieDomain) {
      cookieOpt.domain = opt.cookieDomain;
    }
    if(opt.secure) {
      cookieOpt.secure = true;
    }
    if(opt.cookiePath) {
      cookieOpt.path = opt.cookiePath;
    }
    return cookieOpt;
  }

  class ThorinIntent extends thorin.Intent {

    get session() {
      return this[session];
    }
    set session(v) {  // replacing the session is not cool.
      if(!this[session]) {
        this[session] = v;
      }
      return this;
    }

    /*
    * This is executed right when the intent is created, so we can add some things such as session id and such.
    * */
    runCreate() {
      let headers = this.client().headers;
      let sessId;
      try {
        let cookies = cookie.parse(headers['cookie']);
        if(typeof cookies[opt.cookieName] === 'string') {
          let tmp = storeObj.verifySignature(cookies[opt.cookieName]);
          if(tmp) {
            sessId = tmp;
          }
        }
      } catch(e) {
      }
      // IF we don't have a session, we don't have what to read.
      if(!sessId) {
        sessId = storeObj.generateId();
        if(opt.authorization && !this.authorization) {
          this._setAuthorization(AUTHORIZATION_TYPE, sessId);
          this.authorization = sessId;
        }
        this.session = new SessionData(sessId);
        this.session.isNew(true);
        return super.runCreate.apply(this, arguments);
      }
      // otherwise, we have to retrieve it.
      storeObj.readSession(sessId, (err, data) => {
        // if we failed tor ead from store, empty session.
        if(err) {
          if(err.ns !== 'SESSION') {
            logger.warn('Failed to read session data for sid ' + sessId, err);
          }
          this.session = new SessionData(sessId);
          this.session.isNew(true);
        } else {
          // if there is no session data, we have a new session.
          if(typeof data !== 'object' || !data) {
            this.session = new SessionData(sessId);
            this.session.isNew(true);
          } else {
            this.session = new SessionData(sessId, data);
            this.session.isNew(false);
          }
        }
        if(opt.authorization && !this.authorization) {
          this._setAuthorization(AUTHORIZATION_TYPE, sessId);
        }
        super.runCreate.apply(this, arguments);
      }, false);
    }

    /*
    * Override the default send() function to handle the session storing.
    * */
    send() {
      let session = this.session,
        sessId = session.id,
        cookieSessionId = storeObj.signId(sessId),
        cookieOpt = getCookieOptions();
      if(session.isDestroyed()) { // if the session is destroyed, we have to remove it.
        cookieOpt.expires = new Date(1);  //old expiration
        let delCookie = cookie.serialize(opt.cookieName, cookieSessionId, cookieOpt);
        this.resultHeaders('Set-Cookie', delCookie);
        storeObj.destroySession(sessId, (e) => {
          if(e && e.ns !== 'SESSION') logger.warn('Failed to remove session ' + sessId + ' from store.');
        });
        session.clear();
        return super.send.apply(this, arguments);
      }
      // save it.
      let args = arguments;
      storeObj.saveSession(session, (e, wasSaved) => {
        if(e && e.ns !== 'SESSION') {
          logger.warn('Failed to store session ' + sessId + ' to store.', e);
        }
        if(wasSaved) {
          cookieOpt.expires = new Date(Date.now() + opt.expire * 1000);
          let reqCookie = cookie.serialize(opt.cookieName, cookieSessionId, cookieOpt);
          this.resultHeaders('Set-Cookie', reqCookie);
        }
        super.send.apply(this, args);
      });
    }

  }

  thorin.Intent = ThorinIntent;
};