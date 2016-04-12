'use strict';
/**
 * Created by Adrian on 12-Apr-16.
 */
module.exports = function(thorin, storeObj, opt) {
  /*
   * Step one: define our session model. This is the table where we store our stuff.
   * */
  const modelName = opt.namespace;
  storeObj.addModel((modelObj, Seq) => {
    /* Define our SQL Store model. */
    modelObj.tableName = modelName;
    modelObj.options.updatedAt = false;
    modelObj
      .field('id', Seq.PRIMARY)
      .field('sid', Seq.STRING(100))
      .field('data', Seq.TEXT)
      .field('expire_at', Seq.DATE);

    modelObj.index('sid', {
      unique: true
    });
  }, {
    code: modelName
  });

};