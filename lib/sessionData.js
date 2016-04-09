'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
const id = Symbol(),
  isNew = Symbol(),
  isDestroyed = Symbol(),
  createdAt = Symbol(),
  isCleared = Symbol();
module.exports = class ThorinSessionData {

  constructor(sessId, data) {
    this[id] = sessId;
    this[isNew] = true;
    this[isDestroyed] = false;
    if(typeof data === 'object' && data) {
      let createTs = data.__tca;
      if(!createTs) createTs = Date.now();
      this[createdAt] = createTs;
      Object.keys(data).forEach((key) => {
        if(key === '__tca') return;
        this[key] = data[key];
      });
    } else {
      this[createdAt] = Date.now();
    }
  }

  set id(v) {
    console.warn('Thorin.sessionData: the id field is reserved and cannot be used.');
    return this;
  }
  get id() { return this[id] }

  isNew(v) {
    if(typeof v === 'boolean') {
      this[isNew] = v;
      return this;
    }
    return this[isNew];
  }

  isDestroyed() {
    return this[isDestroyed];
  }

  createdAt() {
    return this[createdAt];
  }

  destroy() {
    this[isDestroyed] = true;
    return this;
  }

  /* Clears the session data */
  clear() {
    this[isCleared] = true;
    return this;
  }

  /* Returns the data that will be persist */
  getData() {
    let d = {};
    d['__tca'] = this[createdAt];
    if(this[isCleared]) return d;
    Object.keys(this).forEach((key) => {
      d[key] = this[key];
    });
    return d;
  }

  /* This will tell us if we save the session or not. */
  shouldSave() {
    if(!this.isNew()) return true;
    let data = this.getData();
    delete data['__tca'];
    if(Object.keys(data).length === 0) return false;
    return true;
  };

};