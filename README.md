# OpenTracing integration for FeathersJS services

This module contains a set of Express middleware and FeathersJS hooks to automate distributed tracing for FeathersJS services using OpenTracing and your preferred Tracer (e.g. Jaeger).

When a new request reaches a server, the middleware will start a root span that will be shared by the target FeathersJS service. Inner service calls will be nested under this root span, as long as you pass it to them.

With Jaeger tracer, the `X-Trace-Id` response header contains the trace ID that can be passed as `uber-trace-id` request header to other external services.
When a request is received with `uber-trace-id` header, service spans will be nested under the span of that trace ID.

Use `hook.params.span` inside FeathersJS services to set custom tags or log custom events. for example:
```javascript
hook.params.span.setTag('some.tag', value);
hook.params.span.log({ event: 'some_event', data: 'some data' });
```

* [feathers-distributed](https://github.com/kalisio/feathers-distributed) is supported

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
        "id": false, // optional. default: true - tag `hook.id`
        "data": false, // optional. default: true - tag `hook.data`
        "query": false, // optional. default: true - tag `hook.params.query`
        "result": true // optional. default: false - tag `hook.dispatch` if set in the first service call or `hook.result` otherwise
      },
      "mask": { // optional. default: mask is off
        "blacklist": ["password"], // Mask values of all properties named 'password' from `hook.data` & `hook.params.query` (supports nested objects)
        "ignoreCase": true, // optional. default: false - Whether to ignore case sensitivity when matching keys
        "replacement": "***" // optional. default: '__MASKED__' - The default value to replace
      },
      "hideErrors": { // optional. default: all errors will be tagged with error=true
        "users": [404, 409] // optional. tag specific errors of selected services with error=false. i.e. hide 404 & 409 errors of the `users` service
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
await hook.app.service('users').get(id, {
  rootSpan: hook.params.rootSpan,
});
```

## Mac OS X
Run once `sudo sysctl -w net.inet.udp.maxdgram=65535` to prevent UDP buffer size errors.
