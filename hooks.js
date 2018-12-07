const opentracing = require('opentracing');
const { tagDefaults, mask } = require('./utils');

const UBER_TRACE_ID = 'uber-trace-id';

const opentracingBegin = (options = {}) => {
  return async context => {
    const { path, method, id, data, params, service } = context;
    const tracer = opentracing.globalTracer();

    if (service.remote) {
      const remoteHeaders = {};
      tracer.inject(params.rootSpan, opentracing.FORMAT_TEXT_MAP, remoteHeaders);
      params.rootSpan = remoteHeaders[UBER_TRACE_ID];

      return context;
    }

    options.tag = { ...tagDefaults, ...options.tag };

    const { rootSpan, firstEndpoint, query } = params;
    let span = null;

    if (typeof rootSpan === 'string') {
      const wire = tracer.extract(opentracing.FORMAT_TEXT_MAP, { [UBER_TRACE_ID]: rootSpan });
      span = tracer.startSpan(path, { childOf: wire });
    } else {
      span = firstEndpoint ? rootSpan : tracer.startSpan(path, { childOf: rootSpan });
    }

    if (!params.firstEndpoint) {
      span.log({ event: 'request_received' });
      span.setOperationName(path);

      if (options.debug)
        span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1);

      span.setTag(opentracing.Tags.SPAN_KIND, 'service');
    }

    span.setTag('service.method', method);

    if (options.tag.id && id)
      span.setTag('id', id);

    if (options.tag.data && data && Object.keys(data).length)
      span.setTag('data', options.mask ? mask(data, options.mask) : data);

    if (options.tag.query && query && Object.keys(query).length)
      span.setTag('query', options.mask ? mask(query, options.mask) : query);

    params.span = span;

    return context;
  };
};

const opentracingEnd = (options = {}) => {
  return async context => {
    if (context.service.remote)
      return context;

    options.tag = { ...tagDefaults, ...options.tag };

    const { params, result, dispatch } = context;
    const { span } = params;

    if (options.tag.result) {
      if (params.firstEndpoint && dispatch && Object.keys(dispatch).length)
        span.setTag('result', options.mask ? mask(dispatch, options.mask) : dispatch);
      else if (result && Object.keys(result).length)
        span.setTag('result', options.mask ? mask(result, options.mask) : result);
    }

    if (!params.firstEndpoint) {
      span.log({ event: 'request_finished' });
      span.finish();
    }

    return context;
  };
};

const opentracingError = (options = {}) => {
  return async context => {
    if (context.service.remote)
      return context;

    const { code, message, stack } = context.error;
    const { path, params } = context;
    let { span } = params;

    if (!span) {
      opentracingBegin(options)(context);
      span = params.span;
    }

    if (options.hideErrors && options.hideErrors[path] && options.hideErrors[path].includes(code)) {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0);
      span.setTag(opentracing.Tags.ERROR, false);
    } else {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1);
      span.setTag(opentracing.Tags.ERROR, true);
    }

    span.setTag('error.code', code);
    span.setTag('error.stack', stack);

    if (!params.firstEndpoint) {
      span.log({ event: 'request_error', message });
      span.finish();
    }

    return context;
  };
};

module.exports = {
  opentracingBegin,
  opentracingEnd,
  opentracingError,
};
