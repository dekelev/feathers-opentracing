# OpenTracing integration for FeathersJS services

[![Build Status](https://travis-ci.org/dekelev/feathers-opentracing.svg?branch=master)](https://travis-ci.org/dekelev/feathers-opentracing)
[![Coverage Status](https://coveralls.io/repos/github/dekelev/feathers-opentracing/badge.svg?branch=master)](https://coveralls.io/github/dekelev/feathers-opentracing?branch=master)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/standard/semistandard)
[![Dependency Status](https://img.shields.io/david/dekelev/feathers-opentracing.svg)](https://david-dm.org/dekelev/feathers-opentracing)
[![npm](https://img.shields.io/npm/v/feathers-opentracing.svg?maxAge=3600)](https://www.npmjs.com/package/feathers-opentracing)

This module contains a set of Express middleware and FeathersJS hooks to automate distributed tracing for FeathersJS services using OpenTracing and your preferred Tracer (e.g. Jaeger).

When a new request reaches a server, the middleware will start a root span that will be shared by the target FeathersJS service. Inner service calls will be nested under this root span, as long as you pass it to them.

With Jaeger tracer, the `X-Trace-Id` response header contains the trace ID that can be passed as `uber-trace-id` request header to other external services.
When a request is received with `uber-trace-id` header, service spans will be nested under the span of that trace ID.

Use `context.params.span` inside FeathersJS services to set custom tags or log custom events. for example:
```javascript
context.params.span.setTag('some.tag', value);
context.params.span.log({ event: 'some_event', data: 'some data' });
```

Supported FeathersJS distributed modules:
* [feathers-http-distributed](https://github.com/dekelev/feathers-http-distributed)
* [feathers-distributed](https://github.com/kalisio/feathers-distributed)

# Install

```npm install --save feathers-opentracing```


## Add Tracer (e.g. Jaeger)

For example:

```javascript
// config/default.json

{
  "opentracing": {  
    "serviceName": "app",  
    "host": "localhost",
    "options": {
      "includedPrefixes": ["v1/", "v2/"], // optional. default: trace all requests - Trace only requests with path prefixed by specified strings, i.e. v1/ & v2/
      "tag": { // optional
        "requestHeaders": false, // optional. default: true - tag `req.headers`
        "responseHeaders": false, // optional. default: true - tag `res.getHeaders()`
        "id": false, // optional. default: true - tag `context.id`
        "data": { // optional. default: true - tag `context.data`
          "index": true // optional. default: false - break JSON object or array to multiple tags. this option can be set for any JSON tag
        },
        "query": false, // optional. default: true - tag `context.params.query`
        "result": true // optional. default: false - tag `context.dispatch` if set in the first service call or `context.result` otherwise
      },
      "mask": { // optional. default: mask is off
        "blacklist": ["password"], // Mask values of all properties named 'password' from `context.data` & `context.params.query` (supports nested objects)
        "ignoreCase": true, // optional. default: false - Whether to ignore case sensitivity when matching keys
        "replacement": "***" // optional. default: '__MASKED__' - The default value to replace
      },
      "hideErrors": { // optional. default: all errors will be tagged with error=true and set with sampling priority 1
        "users": [404, 409] // optional. don't tag selected services errors with error=true and don't set their sampling priority to 1. i.e. hide 404 & 409 errors of the `users` service
      },
      "debug": true  // optional. default: false - Sets sampling priority to 1 to force sampling of all requests
    } 
  }
}
```

```javascript
// src/opentracing.js

const opentracing = require('opentracing');  
const initTracer = require('jaeger-client').initTracer;  
const logger = require('winston');  
const config = require('config');  
  
module.exports = function () {  
  opentracing.initGlobalTracer(initTracer({  
    serviceName: config.opentracing.serviceName,  
  }, {  
    host: config.opentracing.host,  
    logger,
  }));  
};
```

```javascript
// src/app.js

const opentracing = require('./opentracing');

opentracing();  

const app = express(feathers());
```

## Add middleware

```javascript
// src/middleware/index.js

const { opentracingMiddleware } = require('feathers-opentracing');
const config = require('config');

module.exports = function () {  
  ...
  app.use((req, res, next) => {  
    opentracingMiddleware(req, res, config.opentracing.options);  
    next();  
  });
  ...
};
```

## Add hooks

```javascript
// src/app.hooks.js

const { opentracingBegin, opentracingEnd, opentracingError } = require('feathers-opentracing');

module.exports = {
  before: {
    all: [
      opentracingBegin(config.opentracing.options),
      ...
    ],
  },
  
  after: {
    all: [
      ...
      opentracingEnd(config.opentracing.options),
    ]
  },
  
  error: {
    all: [
      ...
      opentracingError(config.opentracing.options),
    ]
  },
};
```

## Pass root span to inner service calls

```javascript
await context.app.service('users').get(id, {
  rootSpan: context.params.rootSpan,
});
```

## Set error on span
Use the `setOpentracingError` method when error is not thrown, but span should still be set with error.
```javascript
const { setOpentracingError } = require('feathers-opentracing');

setOpentracingError(span, new Error('error message'));
```

## Mac OS X
Run once `sudo sysctl -w net.inet.udp.maxdgram=65535` to prevent UDP buffer size errors.
