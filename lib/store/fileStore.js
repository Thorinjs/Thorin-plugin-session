'use strict';
const writeFileAtomic = require('write-file-atomic'),
  path = require('path');

/**
 * Created by Adrian on 09-Apr-16.
 */
module.exports = function(thorin, rootPath, opt) {
  const CLEANUP_TIMER = 60 * 60 * 1000, // once an hour
    logger = thorin.logger(opt.logger),
    expireSec = opt.expire || 3600,
    fse = thorin.util.fs,
    async = thorin.util.async;

  try {
    fse.ensureDirSync(rootPath);
  } catch(e) {
    logger.fatal('Failed to create sessions directory in: ' + rootPath, e);
  }

  /* the file session will try to delete any expired sessions once every x minutes. */
  function verifyExpiration() {
    let items = thorin.util.readDirectory(rootPath, {
      ext: '.sess'
    });
    let calls = [],
      removes = 0,
      now = Date.now();
    items.forEach((fpath) => {
      calls.push((done) => {
        fse.readJson(fpath, (e, json) => {
          if(e) {
            logger.warn('Failed to lookup session file [%s] for cleaning.', fpath, e);
            return done();
          }
          if(now < json.e) return done();
          // remove the file.
          fse.remove(fpath, (e) => {
            if(e && e.code !== 'ENOENT') {
              logger.warn(`Failed to remove expired session file ${fpath}.`, e);
            } else {
              removes++;
            }
            return done();
          });
        });
      });
    });
    async.series(calls, () => {
      if(removes > 0) {
        logger.trace(`Removed ${removes} expired sessions.`);
      }
      setTimeout(verifyExpiration, CLEANUP_TIMER);
    });
  }

  setTimeout(verifyExpiration, CLEANUP_TIMER);
  verifyExpiration();

  /* Returns the full path of a sess file. */
  function getSessPath(id) {
    return path.normalize(rootPath + '/' + id + '.sess');
  }

  const store = {};

  /* Read from store. */
  store.read = function Read(id, done) {
    fse.readJson(getSessPath(id), (e, json) => {
      if(e) {
        if(e.code === 'ENOENT') {
          return done(null, null);
        }
        return done(thorin.error(e));
      }
      if(Date.now() >= json.e) {
        store.destroy(id);
        return done(null, null);
      }
      done(null, json.d);
    });
  };

  /* Save changes */
  store.save = function Save(id, data, done) {
    if(data == null) return done();
    let toSave = {
      e: Date.now() + expireSec * 1000,
      d: (typeof data === 'object' ? JSON.stringify(data) : data)
    };
    writeFileAtomic(getSessPath(id), JSON.stringify(toSave), (e) => {
      if(e) return done(thorin(e));
      done();
    });
  };

  /* Destroy a session */
  store.destroy = function Destroy(id, done) {
    fse.remove(getSessPath(id), (e) => {
      if(e) {
        if(e.code === 'ENOENT') return done && done();
        return done && done(e);
      }
      return done && done();
    });
  };

  return store;
};