const opentracing = require('opentracing');

const opentracingSetTags = () => {
  return async hook => {
    const { id, data, params } = hook;
    const { span, query } = params;

    if (id)
      span.setTag('id', id);

    if (data && Object.keys(data).length)
      span.setTag('data', data);

    if (query && Object.keys(query).length)
      span.setTag('query', query);

    return hook;
  };
};

const opentracingBegin = () => {
  return async hook => {
    const { path, method } = hook;
    const { rootSpan, firstEndpoint } = hook.params;
    const tracer = opentracing.globalTracer();
    const span = firstEndpoint ? rootSpan : tracer.startSpan(path, { childOf: rootSpan });

    if (!hook.params.firstEndpoint)
      span.logEvent('request_received');

    span.setOperationName(path);

    span.setTag('span.kind', 'service');
    span.setTag('service.method', method);

    hook.params.span = span;

    return hook;
  };
};

const opentracingEnd = () => {
  return async hook => {
    const { span } = hook.params;

    if (!hook.params.firstEndpoint) {
      span.logEvent('request_finished');
      span.finish();
    }

    return hook;
  };
};

const opentracingError = () => {
  return async hook => {
    const { span } = hook.params;
    const { code, message, stack } = hook.error;

    span.setTag('error', true);
    span.setTag('error.code', code);
    span.setTag('error.stack', stack);
    span.setTag('sampling.priority', 1);

    if (!hook.params.firstEndpoint) {
      span.logEvent('request_error', message);
      span.finish();
    }

    return hook;
  };
};

module.exports = {
  opentracingBegin,
  opentracingEnd,
  opentracingError,
  opentracingSetTags,
};
