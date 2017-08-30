'use strict';
const cookie = require('cookie');
/**
 * Created by Adrian on 08-Apr-16.
 * This extends the default thorin.Intent class to add a few properties to it.
 */
module.exports = function (thorin, storeObj, opt) {
  let session = Symbol(),
    logger = thorin.logger(opt.logger),
    ignoreSave = Symbol();

  /* Returns the cookie options. */
  function getCookieOptions() {
    let cookieOpt = {
      httpOnly: true
    };
    if (opt.cookieDomain) {
      cookieOpt.domain = opt.cookieDomain;
    }
    if (opt.secure) {
      cookieOpt.secure = true;
    }
    if (opt.cookiePath) {
      cookieOpt.path = opt.cookiePath;
    }
    return cookieOpt;
  }

  class ThorinIntent extends thorin.Intent {

    get session() {
      return this[session] || {};
    }

    set session(v) {  // replacing the session is not cool.
      if (!this[session]) {
        this[session] = v;
      }
      return this;
    }

    /* Skips the save to the store. */
    skipSave() {
      this[ignoreSave] = true;
    }


    /*
    * Override the default send() function to handle the session storing.
    * */
    send() {
      let session = this.session;
      if (!session || !session.isDestroyed) {
        return super.send.apply(this, arguments);
      }
      let sessId = session.id,
        cookieSessionId = storeObj.signId(sessId),
        cookieOpt = getCookieOptions();
      if (session.isDestroyed()) { // if the session is destroyed, we have to remove it.
        cookieOpt.expires = new Date(1);  //old expiration
        let delCookie = cookie.serialize(opt.cookieName, cookieSessionId, cookieOpt);
        this.resultHeaders('Set-Cookie', delCookie);
        storeObj.destroySession(sessId, (e) => {
          if (e && e.ns !== 'SESSION') logger.warn('Failed to remove session ' + sessId + ' from store.');
        });
        session.clear();
        return super.send.apply(this, arguments);
      }
      if (this[ignoreSave]) {
        return super.send.apply(this, arguments);
      }
      // save it.
      let args = arguments;
      storeObj.saveSession(session, (e, wasSaved) => {
        if (e && e.ns !== 'SESSION') {
          logger.warn('Failed to store session ' + sessId + ' to store.', e);
        }
        if (wasSaved) {
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