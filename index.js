const opentracingMiddleware = require('./middleware');
const { opentracingBegin, opentracingEnd, opentracingError, opentracingSetTags } = require('./hooks');

module.exports = {
  opentracingMiddleware,
  opentracingBegin,
  opentracingEnd,
  opentracingError,
  opentracingSetTags,
};
