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

    _addCookie(m) {
      let h = this.resultHeaders();
      if (!h || !h['Set-Cookie']) {
        this.resultHeaders('Set-Cookie', [m]);
        return;
      }
      if (h['Set-Cookie'].indexOf(m) === -1) {
        h['Set-Cookie'].push(m);
      }
    }

    /*
     * Manually set a cookie's data with a given expiration time.
     * */
    setCookie(name, value, opt) {
      let cookieOpt = getCookieOptions();
      if (typeof opt === 'object' && opt) {
        cookieOpt = Object.assign({}, cookieOpt, opt);
      }
      if (typeof value === 'undefined') {
        cookieOpt.expires = new Date(1);
      }
      let m = cookie.serialize(name, value, cookieOpt);
      this._addCookie(m);
    }

    /*
    * Tries to return a given cookie by name
    * */
    getCookies(name) {
      let headers = this.client('headers');
      if (!headers['cookie']) return null;
      try {
        let p = cookie.parse(headers.cookie);
        if (typeof name === 'string') return p[name] || null;
        return p;
      } catch (e) {
        return null;
      }
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
        this._addCookie(delCookie);
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
          this._addCookie(reqCookie);
        }
        super.send.apply(this, args);
      });
    }

  }

  thorin.Intent = ThorinIntent;
};
