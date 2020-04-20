'use strict';
const fs = require('fs'),
  path = require('path');

/**
 * The simple file store.
 */
module.exports = function (thorin, rootPath, opt) {
  const CLEANUP_TIMER = 60 * 60 * 1000, // once an hour
    logger = thorin.logger(opt.logger),
    expireSec = opt.expire || 3600,
    fse = thorin.util.fs;

  try {
    fse.ensureDirSync(rootPath);
  } catch (e) {
    logger.warn(`Failed to create sessions directory in: ${rootPath}`, e);
  }

  /* the file session will try to delete any expired sessions once every x minutes. */
  async function verifyExpiration() {
    if (opt.removeExpired === false) return;
    let items = thorin.util.readDirectory(rootPath, {
      ext: '.sess'
    });
    let now = Date.now(),
      removes = 0;
    for (let i = 0, len = items.length; i < len; i++) {
      let fpath = items[i];
      try {
        let json = await fse.readJson(fpath);
        if (now < json.e) continue;
        // remove file.
        await fse.remove(fpath);
        removes++;
      } catch (e) {
        logger.warn(`Failed to cleanup session file [${fpath}].`, e);
      }
    }
    if (removes > 0) {
      logger.trace(`Removed ${removes} expired sessions.`);
    }
    setTimeout(verifyExpiration, CLEANUP_TIMER);
  }

  verifyExpiration();

  /* Returns the full path of a sess file. */
  function getSessPath(id) {
    return path.normalize(rootPath + '/' + id + '.sess');
  }

  const store = {};

  /* Read from store. */
  store.read = function Read(id, done) {
    fse.readJson(getSessPath(id), (e, json) => {
      if (e) {
        if (e.code === 'ENOENT') {
          return done(null, null);
        }
        return done(thorin.error(e));
      }
      if (Date.now() >= json.e) {
        store.destroy(id);
        return done(null, null);
      }
      done(null, json.d);
    });
  };

  /* Save changes */
  store.save = function Save(id, data, done) {
    if (data == null) return done();
    let toSave = {
      e: Date.now() + expireSec * 1000,
      d: (typeof data === 'object' ? JSON.stringify(data) : data)
    };
    fs.writeFile(getSessPath(id), JSON.stringify(toSave), { encoding: 'utf8' }, (e) => {
      if (e) return done(thorin(e));
      done();
    });
  };

  /* Destroy a session */
  store.destroy = function Destroy(id, done) {
    fse.remove(getSessPath(id), (e) => {
      if (e) {
        if (e.code === 'ENOENT') return done && done();
        return done && done(e);
      }
      return done && done();
    });
  };

  return store;
};
