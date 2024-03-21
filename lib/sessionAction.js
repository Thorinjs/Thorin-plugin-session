'use strict';
/**
 * This will extend the default thorin.Action
 */
module.exports = function (thorin, storeObj, opt) {
  const Action = thorin.Action;

  Action.HANDLER_TYPE.SESSION = "session";

  class ThorinAction extends Action {

    #disabled = false;

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

      if (this.#disabled === true) {
        intentObj.skipSave();
        return done();
      }
      storeObj.__readSession(intentObj, done);
    }

    /**
     * Marks the current intent action as not usable with sessions,
     * so we do not waste resources onto reading session information
     * */
    session(isEnabled) {
      this.#disabled = isEnabled === false;
      return this;
    }
  }


  thorin.Action = ThorinAction;

};
