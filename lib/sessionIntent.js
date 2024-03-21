'use strict';
const cookie = require('cookie');
/**
 *
 * This extends the default thorin.Intent class to add a few properties to it.
 */
module.exports = function init(thorin, storeObj, opt) {

  let logger = thorin.logger(opt.logger);

  class ThorinIntent extends thorin.Intent {

    #session;
    #ignoreSave = false;

    get session() {
      return this.#session;
    }

    set session(v) {  // replacing the session is not cool.
      if (!this.#session) {
        this.#session = v;
      }
      return this;
    }

    set shouldSkipSave(v) {}

    get shouldSkipSave() {
      return this.#ignoreSave;
    }

    /**
     * Skips the save to the store
     * */
    skipSave() {
      this.#ignoreSave = true;
    }


    /**
     * Manually add individual cookies
     * */
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

    /**
     * Manually set a cookie's data with a given expiration time.
     * */
    setCookie(name, value, opt) {
      let cookieOpt = this.getCookieOptions();
      if (typeof opt === 'object' && opt) {
        cookieOpt = Object.assign({}, cookieOpt, opt);
      }
      if (typeof value === 'undefined') {
        value = '';
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


    /**
     * Override the default send() function to handle the session storing.
     * */
    send() {
      const args = [...arguments];
      const parentSend = super.send;
      if (!this.#session) {
        return parentSend.apply(this, args);
      }
      storeObj.__saveSession(this, () => parentSend.apply(this, args));
    }

    /**
     * Return cookie options based on the given opt.
     * */
    getCookieOptions(_opt = opt) {
      let cookieOpt = {
        httpOnly: true
      };
      if (_opt.cookieDomain) {
        cookieOpt.domain = _opt.cookieDomain;
      }
      if (_opt.secure) {
        cookieOpt.secure = true;
      }
      if (_opt.cookiePath) {
        cookieOpt.path = _opt.cookiePath;
      }
      if (_opt.sameSite) {
        cookieOpt.sameSite = typeof _opt.sameSite === 'string' ? _opt.sameSite : true;
      }
      return cookieOpt;
    }

  }

  thorin.Intent = ThorinIntent;
};
