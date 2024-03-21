'use strict';
const cookie = require('cookie'),
  SessionData = require('./sessionData');
const AUTHORIZATION_TYPE = 'SESSION';

/**
 * The function handles using JWT for sessions.
 * */
module.exports = function (thorin, opt) {
  const logger = thorin.logger(opt.logger);

  const JWT = opt.JWT;
  const JWT_ALG = 'HS256';
  const JWT_SECRET = thorin.util.sha2(opt.secret);
  const JWT_EXPIRE = opt.expire * 1000;
  const sess = {};

  /**
   * Reads the session based on the intentObject.
   * */
  sess.readSession = function (storeObj, intentObj, done) {
    if (intentObj.session) return done();
    let headers = intentObj.client().headers;
    let sessionData,
      createdAt;
    try {
      let cookies = cookie.parse(headers['cookie']);
      if (typeof cookies[opt.cookieName] === 'string' && cookies[opt.cookieName]) {
        let cookieData = cookies[opt.cookieName];
        let jwtData = JWT.verify(cookieData, JWT_SECRET);
        if (jwtData?.d && typeof jwtData.d === 'object') {
          sessionData = jwtData.d;
          createdAt = jwtData.iat * 1000;
        }
      }
    } catch (e) {
    }
    intentObj.session = new SessionData('jwt', sessionData, createdAt);
    if (!sessionData) {
      intentObj.session.isNew(true);
    }
    if (!headers['authorization']) {
      intentObj._setAuthorization(AUTHORIZATION_TYPE, 'jwt');
    }
    done();
  }

  /**
   * Saves the session as a JWT
   * */
  sess.saveSession = function (storeObj, intentObj, done) {
    const session = intentObj.session;
    if (!session) return done();
    const cookieOpt = intentObj.getCookieOptions();
    if (session.isDestroyed()) {  // if the session is destroyed, we have to remove it.
      cookieOpt.expires = new Date(1);  //old expiration
      let delCookie = cookie.serialize(opt.cookieName, '', cookieOpt);
      intentObj._addCookie(delCookie);
      return done();
    }
    if (intentObj.shouldSkipSave || !session.shouldSave() || !session.hasChanges()) {
      return done();
    }

    const sessionData = session.getData(true);
    let jwtSessionToken;
    try {
      const jwtOpt = {
        algorithm: JWT_ALG,
        expiresIn: JWT_EXPIRE
      };
      jwtSessionToken = JWT.sign({
        d: sessionData
      }, JWT_SECRET, jwtOpt);
    } catch (e) {
      logger.warn(`Could not generate JWT for session - ${e.message}`);
      return done();
    }
    cookieOpt.expires = new Date(Date.now() + JWT_EXPIRE);
    let reqCookie = cookie.serialize(opt.cookieName, jwtSessionToken, cookieOpt);
    intentObj._addCookie(reqCookie);
    done();
  }

  return sess;
}
