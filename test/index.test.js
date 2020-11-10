/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const assert = require('assert');
const sinon = require('sinon');
const opentracing = require('opentracing');
const {
  opentracingMiddleware,
  opentracingBegin,
  opentracingEnd,
  opentracingError,
  setOpentracingError
} = require('../lib');

const TRACE_HEADER_NAME = 'X-Trace-Id';
const UBER_TRACE_ID = 'uber-trace-id';

describe('Feathers Cassandra service', () => {
  let context, req, res, options, span;

  before(() => {
    const tracer = opentracing.globalTracer();

    sinon.replace(tracer, 'startSpan', function (path, options) {
      span.path = path;
      span.options = options;

      return span;
    });

    sinon.replace(tracer, 'inject', function (span, format, object) {
      object[UBER_TRACE_ID] = span.context().toTraceId();
    });

    sinon.replace(tracer, 'extract', function (format, object) {
      return object[UBER_TRACE_ID];
    });
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    context = {
      id: 1,
      method: 'get',
      service: {
        remote: false
      },
      params: {
        query: {
          name: 'Dave'
        }
      },
      data: {
        name: 'John'
      }
    };

    req = {
      route: {
        path: 'v1/users'
      },
      url: 'http://localhost/v1/users',
      headers: {
        'x-forwarded-for': '1.2.3.4'
      },
      method: 'get',
      hostname: 'localhost',
      feathers: {}
    };

    res = {
      setHeader: (name, value) => {
        res.headers[name] = value;
      },
      getHeaders: () => res.headers,
      on: (event, callback) => {
        res.events[event] = callback;
      },
      headers: {},
      events: {},
      statusCode: 200,
      statusMessage: ''
    };

    options = {};

    span = {
      id: 'span:id',
      context: () => {
        return {
          toTraceId: () => span.id
        };
      },
      setOperationName: path => {
        span.operationName = path;
      },
      log: data => {
        span.logs.push(data);
      },
      logs: [],
      setTag: (name, value) => {
        span.tags[name] = value;
      },
      tags: {},
      finish: () => {
        span.finished = true;
      },
      finished: false
    };
  });

  describe('Initialization', () => {
    it('is CommonJS compatible', () => {
      assert.strictEqual(typeof opentracingMiddleware, 'function');
      assert.strictEqual(typeof opentracingBegin, 'function');
      assert.strictEqual(typeof opentracingEnd, 'function');
      assert.strictEqual(typeof opentracingError, 'function');
      assert.strictEqual(typeof setOpentracingError, 'function');
    });
  });

  describe('opentracingMiddleware', () => {
    it('without options', () => {
      opentracingMiddleware(req, res);

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.path).to.equal('v1/users');
      expect(req.feathers.rootSpan.operationName).to.equal('v1/users');
      expect(req.feathers.rootSpan.tags[opentracing.Tags.SPAN_KIND]).to.equal('request');
      expect(req.feathers.rootSpan.logs.length).to.equal(1);
      expect(req.feathers.rootSpan.logs[0]).to.deep.equal({ event: 'request_received' });
      expect(req.feathers.firstEndpoint).to.equal(true);
      expect(res.headers[TRACE_HEADER_NAME]).to.be.ok;
    });

    it('with path prefixed & suffixed by slash', () => {
      req.route.path = '/v1/users/';

      opentracingMiddleware(req, res);

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.path).to.equal('v1/users');
      expect(req.feathers.rootSpan.operationName).to.equal('v1/users');
    });

    it('without route', () => {
      delete req.route;

      opentracingMiddleware(req, res);

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.path).to.equal('v1/users');
      expect(req.feathers.rootSpan.operationName).to.equal('v1/users');
    });

    it('without path', () => {
      delete req.route.path;

      opentracingMiddleware(req, res);

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.path).to.equal('v1/users');
      expect(req.feathers.rootSpan.operationName).to.equal('v1/users');
    });

    it('when span finished with close callback', () => {
      opentracingMiddleware(req, res);

      res.events.close();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.finished).to.equal(true);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.SPAN_KIND]).to.equal('request');
      expect(req.feathers.rootSpan.tags[opentracing.Tags.HTTP_STATUS_CODE]).to.equal(res.statusCode);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.HTTP_METHOD]).to.equal(req.method);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.PEER_HOSTNAME]).to.equal(req.hostname);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.PEER_ADDRESS]).to.equal(req.headers['x-forwarded-for']);
      expect(req.feathers.rootSpan.logs.length).to.equal(2);
      expect(req.feathers.rootSpan.logs[1]).to.deep.equal({ event: 'request_finished' });
      expect(req.feathers.firstEndpoint).to.equal(true);
      expect(res.headers[TRACE_HEADER_NAME]).to.be.ok;
    });

    it('when span finished with finish callback', () => {
      opentracingMiddleware(req, res);

      res.events.finish();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.finished).to.equal(true);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.SPAN_KIND]).to.equal('request');
      expect(req.feathers.rootSpan.tags[opentracing.Tags.HTTP_STATUS_CODE]).to.equal(res.statusCode);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.HTTP_METHOD]).to.equal(req.method);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.PEER_HOSTNAME]).to.equal(req.hostname);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.PEER_ADDRESS]).to.equal(req.headers['x-forwarded-for']);
      expect(req.feathers.rootSpan.logs.length).to.equal(2);
      expect(req.feathers.rootSpan.logs[1]).to.deep.equal({ event: 'request_finished' });
      expect(req.feathers.firstEndpoint).to.equal(true);
      expect(res.headers[TRACE_HEADER_NAME]).to.be.ok;
    });

    it('expect span to finish once when ExpressJS triggers both finish & close events', () => {
      opentracingMiddleware(req, res);

      res.events.finish();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.finished).to.equal(true);

      req.feathers.rootSpan.finished = false;

      res.events.close();

      expect(req.feathers.rootSpan.finished).to.equal(false);
    });

    it('with includedPrefixes option and no matching route', () => {
      options.includedPrefixes = ['v0'];

      opentracingMiddleware(req, res, options);

      expect(req.feathers.rootSpan).to.be.undefined;
    });

    it('with includedPrefixes option and matching route', () => {
      options.includedPrefixes = ['v1'];

      opentracingMiddleware(req, res, options);

      expect(req.feathers.rootSpan).to.be.ok;
    });

    it('with debug option', () => {
      options.debug = true;

      opentracingMiddleware(req, res, options);

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.tags[opentracing.Tags.SAMPLING_PRIORITY]).to.equal(1);
    });

    it('with tag.requestHeaders option', () => {
      options.tag = { requestHeaders: true };

      opentracingMiddleware(req, res, options);
      res.events.finish();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.tags['request.headers']).to.equal(req.headers);
    });

    it('with tag.responseHeaders option', () => {
      options.tag = { responseHeaders: true };

      opentracingMiddleware(req, res, options);
      res.events.finish();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.tags['response.headers']).to.equal(res.headers);
    });

    it('with error response', () => {
      res.statusCode = 400;
      res.statusMessage = 'error';

      opentracingMiddleware(req, res);
      res.events.finish();

      expect(req.feathers.rootSpan).to.be.ok;
      expect(req.feathers.rootSpan.logs.length).to.equal(2);
      expect(req.feathers.rootSpan.logs[1]).to.deep.equal({ event: 'request_error', message: res.statusMessage });
    });
  });

  describe('opentracingBegin', () => {
    it('without options', () => {
      opentracingBegin()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags[opentracing.Tags.SPAN_KIND]).to.equal('service');
      expect(context.params.span.tags['service.method']).to.equal(context.method);
      expect(context.params.span.tags.id).to.equal(1);
      expect(context.params.span.tags.data).to.equal(context.data);
      expect(context.params.span.tags.query).to.equal(context.params.query);
      expect(context.params.span.logs.length).to.equal(1);
      expect(context.params.span.logs[0]).to.deep.equal({ event: 'request_received' });
    });

    it('without tag.id, tag.data & tag.query options', () => {
      options.tag = {
        id: false,
        data: false,
        query: false
      };

      opentracingBegin(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.id).to.be.undefined;
      expect(context.params.span.tags.data).to.be.undefined;
      expect(context.params.span.tags.query).to.be.undefined;
    });

    it('with nested data', () => {
      context.data = {
        obj: {
          nested: true,
          arr: [
            1,
            2
          ],
          date: new Date(0),
          buffer: Buffer.from('test')
        }
      };

      opentracingBegin()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.data).to.deep.equal(context.data);
    });

    it('with nested data and index true', () => {
      options.tag = {
        data: {
          index: true
        }
      };

      context.data = {
        obj: {
          nested: true,
          arr: [
            1,
            2
          ],
          date: new Date(0),
          buffer: Buffer.from('test')
        }
      };

      opentracingBegin(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags['data.obj.nested']).to.equal(true);
      expect(context.params.span.tags['data.obj.arr[0]']).to.equal(1);
      expect(context.params.span.tags['data.obj.arr[1]']).to.equal(2);
      expect(context.params.span.tags['data.obj.date']).to.equal('1970-01-01T00:00:00.000Z');
      expect(context.params.span.tags['data.obj.buffer']).to.equal('test');
    });

    it('with mask.blacklist option', () => {
      options.mask = {
        blacklist: ['password']
      };

      options.tag = {
        result: true
      };

      context.params.query = context.data = context.result = {
        Password: true,
        obj: {
          password: true,
          arr: [
            {
              password: true
            }
          ]
        }
      };

      opentracingBegin(options)(context);
      opentracingEnd(options)(context);

      const masked = '__MASKED__';

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.query.Password).to.equal(true);
      expect(context.params.span.tags.query.obj.password).to.equal(masked);
      expect(context.params.span.tags.query.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.data.Password).to.equal(true);
      expect(context.params.span.tags.data.obj.password).to.equal(masked);
      expect(context.params.span.tags.data.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.result.Password).to.equal(true);
      expect(context.params.span.tags.result.obj.password).to.equal(masked);
      expect(context.params.span.tags.result.obj.arr[0].password).to.equal(masked);
    });

    it('with mask.blacklist option and mask.ignoreCase true', () => {
      options.mask = {
        blacklist: ['password'],
        ignoreCase: true
      };

      options.tag = {
        result: true
      };

      context.params.query = context.data = context.result = {
        Password: true,
        obj: {
          password: true,
          arr: [
            {
              password: true
            }
          ]
        }
      };

      opentracingBegin(options)(context);
      opentracingEnd(options)(context);

      const masked = '__MASKED__';

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.query.Password).to.equal(masked);
      expect(context.params.span.tags.query.obj.password).to.equal(masked);
      expect(context.params.span.tags.query.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.data.Password).to.equal(masked);
      expect(context.params.span.tags.data.obj.password).to.equal(masked);
      expect(context.params.span.tags.data.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.result.Password).to.equal(masked);
      expect(context.params.span.tags.result.obj.password).to.equal(masked);
      expect(context.params.span.tags.result.obj.arr[0].password).to.equal(masked);
    });

    it('with mask.blacklist option and custom mask.replacement', () => {
      options.mask = {
        blacklist: ['password'],
        replacement: '__REDACTED__'
      };

      options.tag = {
        result: true
      };

      context.params.query = context.data = context.result = {
        Password: true,
        obj: {
          password: true,
          arr: [
            {
              password: true
            }
          ]
        }
      };

      opentracingBegin(options)(context);
      opentracingEnd(options)(context);

      const masked = '__REDACTED__';

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.query.Password).to.equal(true);
      expect(context.params.span.tags.query.obj.password).to.equal(masked);
      expect(context.params.span.tags.query.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.data.Password).to.equal(true);
      expect(context.params.span.tags.data.obj.password).to.equal(masked);
      expect(context.params.span.tags.data.obj.arr[0].password).to.equal(masked);
      expect(context.params.span.tags.result.Password).to.equal(true);
      expect(context.params.span.tags.result.obj.password).to.equal(masked);
      expect(context.params.span.tags.result.obj.arr[0].password).to.equal(masked);
    });

    it('when firstEndpoint is true', () => {
      opentracingMiddleware(req, res);

      context.params = req.feathers;

      opentracingBegin()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags[opentracing.Tags.SPAN_KIND]).to.be.equal('request');
      expect(context.params.span.logs.length).to.equal(1);
    });

    it('with remote service', () => {
      context.service.remote = true;

      opentracingMiddleware(req, res);

      context.params = req.feathers;

      opentracingBegin(options)(context);

      expect(context.params.rootSpan).to.equal(span.context().toTraceId());
    });

    it('from remote service', () => {
      const id = span.id = 'from:remote:service';

      opentracingBegin(options)(context);

      expect(context.params.span.context().toTraceId()).to.equal(id);
    });

    it('with debug option', () => {
      options.debug = true;

      opentracingBegin(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags[opentracing.Tags.SAMPLING_PRIORITY]).to.equal(1);
    });

    it('with rootSpan', () => {
      opentracingMiddleware(req, res, options);

      context.params.rootSpan = req.feathers.rootSpan;

      opentracingBegin(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.options.childOf.context().toTraceId()).to.equal(span.context().toTraceId());
    });

    it('with string rootSpan', () => {
      opentracingMiddleware(req, res, options);

      context.params.rootSpan = req.feathers.rootSpan.context().toTraceId();

      opentracingBegin(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.options.childOf).to.equal(span.context().toTraceId());
    });
  });

  describe('opentracingEnd', () => {
    it('without options', () => {
      opentracingBegin()(context);
      opentracingEnd()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.result).to.be.undefined;
      expect(context.params.span.logs.length).to.equal(2);
      expect(context.params.span.logs[1]).to.deep.equal({ event: 'request_finished' });
      expect(context.params.span.finished).to.equal(true);
    });

    it('when firstEndpoint is true', () => {
      opentracingMiddleware(req, res);

      context.params = req.feathers;

      opentracingBegin()(context);
      opentracingEnd()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.logs.length).to.equal(1);
      expect(context.params.span.finished).to.equal(false);
    });

    it('with remote service', () => {
      context.service.remote = true;

      opentracingMiddleware(req, res);

      context.params = req.feathers;

      opentracingBegin()(context);
      opentracingEnd()(context);

      expect(context.params.span).to.be.undefined;
    });

    it('with tag.result option', () => {
      options.tag = { result: true };

      opentracingBegin(options)(context);

      context.result = { test: true };
      context.dispatch = { test: false };

      opentracingEnd(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.result.test).to.equal(true);
    });

    it('with tag.result option and firstEndpoint true', () => {
      options.tag = { result: true };

      opentracingMiddleware(req, res, options);

      context.params = req.feathers;

      opentracingBegin(options)(context);

      context.result = { test: true };

      opentracingEnd(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.result.test).to.equal(true);
    });

    it('with tag.result option, firstEndpoint true and context.dispatch', () => {
      options.tag = { result: true };

      opentracingMiddleware(req, res, options);

      context.params = req.feathers;

      opentracingBegin(options)(context);

      context.result = { test: true };
      context.dispatch = { test: false };

      opentracingEnd(options)(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags.result.test).to.equal(false);
    });

    it('when finish span throws exception', () => {
      span.finish = () => {
        throw new Error('test');
      };

      opentracingBegin()(context);
      opentracingEnd()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.finished).to.equal(false);
    });
  });

  describe('opentracingError', () => {
    beforeEach(() => {
      const error = new Error('test');

      error.code = 400;

      context.error = error;
    });

    it('without options', () => {
      opentracingBegin()(context);
      opentracingError()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags[opentracing.Tags.SAMPLING_PRIORITY]).to.equal(1);
      expect(context.params.span.tags[opentracing.Tags.ERROR]).to.equal(true);
      expect(context.params.span.tags['error.code']).to.equal(context.error.code);
      expect(context.params.span.tags['error.stack']).to.equal(context.error.stack);
      expect(context.params.span.logs.length).to.equal(2);
      expect(context.params.span.logs[1]).to.deep.equal({ event: 'request_error', message: context.error.message });
      expect(context.params.span.finished).to.equal(true);
    });

    it('without opentracingBegin', () => {
      opentracingError()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.tags[opentracing.Tags.SAMPLING_PRIORITY]).to.equal(1);
      expect(context.params.span.tags[opentracing.Tags.ERROR]).to.equal(true);
      expect(context.params.span.tags['error.code']).to.equal(context.error.code);
      expect(context.params.span.tags['error.stack']).to.equal(context.error.stack);
      expect(context.params.span.logs[1]).to.deep.equal({ event: 'request_error', message: context.error.message });
      expect(context.params.span.finished).to.equal(true);
    });

    it('when firstEndpoint is true', () => {
      opentracingMiddleware(req, res);

      context.params = req.feathers;

      opentracingBegin()(context);
      opentracingError()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.logs.length).to.equal(1);
      expect(context.params.span.finished).to.equal(false);
    });

    it('with remote service', () => {
      context.service.remote = true;

      opentracingError()(context);

      expect(context.params.span).to.be.undefined;
    });

    it('when finish span throws exception', () => {
      span.finish = () => {
        throw new Error('test');
      };

      opentracingError()(context);

      expect(context.params.span).to.be.ok;
      expect(context.params.span.finished).to.equal(false);
    });
  });

  describe('setOpentracingError', () => {
    it('set span with error', () => {
      const error = new Error('Test');

      error.code = 400;

      opentracingMiddleware(req, res);

      expect(req.feathers.rootSpan).to.be.ok;

      setOpentracingError(req.feathers.rootSpan, error);

      expect(req.feathers.rootSpan.tags[opentracing.Tags.SAMPLING_PRIORITY]).to.equal(1);
      expect(req.feathers.rootSpan.tags[opentracing.Tags.ERROR]).to.equal(true);
      expect(req.feathers.rootSpan.tags['error.code']).to.equal(error.code);
      expect(req.feathers.rootSpan.tags['error.stack']).to.equal(error.stack);
    });
  });
});
