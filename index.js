const opentracingMiddleware = require('./middleware');
const { opentracingBegin, opentracingEnd, opentracingError } = require('./hooks');

module.exports = {
  opentracingMiddleware,
  opentracingBegin,
  opentracingEnd,
  opentracingError,
};
