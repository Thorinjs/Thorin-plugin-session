'use strict';
/**
 * Created by Adrian on 09-Apr-16.
 */
const id = Symbol(),
  isNew = Symbol(),
  isDestroyed = Symbol(),
  customFields = Symbol(),  // custom fields are used with store=sql
  createdAt = Symbol(),
  initialData = Symbol(),
  skipSave = Symbol(),
  isCleared = Symbol();
module.exports = class ThorinSessionData {

  constructor(sessId, data) {
    this[id] = sessId;
    this[isNew] = true;
    this[isDestroyed] = false;
    if (typeof data === 'object' && data) {
      let createTs = data.__tca;
      if (!createTs) createTs = Date.now();
      this[createdAt] = createTs;
      Object.keys(data).forEach((key) => {
        if (key === '__tca') return;
        this[key] = data[key];
      });
      this[initialData] = JSON.stringify(this.getData());
    } else {
      this[createdAt] = Date.now();
    }
  }

  set id(v) {
    console.warn('Thorin.sessionData: the id field is reserved and cannot be used.');
    return this;
  }

  get id() {
    return this[id]
  }

  isNew(v) {
    if (typeof v === 'boolean') {
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

  /*
  * Skips session saving
  * */
  skipSave() {
    this[skipSave] = true;
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
    if (this[isCleared]) return d;
    Object.keys(this).forEach((key) => {
      if (typeof this[key] !== 'function') {
        d[key] = this[key];
      }
    });
    return d;
  }

  /* This will tell us if we save the session or not. */
  shouldSave() {
    if (this[skipSave] === true) return false;
    if (!this.isNew()) return true;
    let data = this.getData();
    delete data['__tca'];
    if (Object.keys(data).length === 0) return false;
    return true;
  };

  /* Checks if the session data has any changes */
  hasChanges() {
    let initData = this[initialData];
    if (!initData) return true;
    let currentData = JSON.stringify(this.getData());
    return (initData !== currentData);
  }

  /* Set custom fields for store=sql sessions */
  setField(key, val) {
    if (typeof this[customFields] === 'undefined') this[customFields] = {};
    this[customFields][key] = val;
    return this;
  }

  _setFields(d) {
    this[customFields] = d;
  }

  /* Returns any custom fields */
  getFields() {
    if (typeof this[customFields] === 'undefined') return null;
    return this[customFields] || null;
  }

};