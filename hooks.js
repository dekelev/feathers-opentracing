const opentracing = require('opentracing');
const { tagDefaults, mask } = require('./utils');

const opentracingBegin = (options = {}) => {
  return async context => {
    options.tag = { ...tagDefaults, ...options.tag };

    const { path, method, id, data, params } = context;
    const { rootSpan, firstEndpoint, query } = params;
    const tracer = opentracing.globalTracer();
    const span = firstEndpoint ? rootSpan : tracer.startSpan(path, { childOf: rootSpan });

    if (!params.firstEndpoint) {
      span.log({ event: 'request_received' });
      span.setOperationName(path);
    }

    if (options.debug)
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1);

    span.setTag('span.kind', 'service');
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

const opentracingError = () => {
  return async context => {
    const { params } = context;
    const { span } = params;
    const { code, message, stack } = context.error;

    span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1);
    span.setTag(opentracing.Tags.ERROR, true);
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
