const opentracing = require('opentracing');
const requestIp = require('request-ip');
const Url = require('url');
const { tagDefaults, tagObject } = require('./utils');

module.exports = function (req, res, options = {}) {
  options.tag = { ...tagDefaults, ...options.tag };

  const path = ((req.route && req.route.path) || Url.parse(req.url).pathname).replace(/^\/|\/$/g, '');
  let skip = true;

  if (!options.includedPrefixes || !options.includedPrefixes.length) {
    skip = false;
  } else {
    for (const prefix of options.includedPrefixes) {
      if (path.startsWith(prefix)) {
        skip = false;
        break;
      }
    }
  }

  if (skip) { return; }

  const tracer = opentracing.globalTracer();
  const wire = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);
  const span = tracer.startSpan(path, { childOf: wire });

  span.log({ event: 'request_received' });
  span.setOperationName(path);

  if (options.debug) { span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1); }

  span.setTag(opentracing.Tags.SPAN_KIND, 'request');

  // set trace response headers
  const responseHeaders = {};
  tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
  Object.keys(responseHeaders).forEach(key => {
    const cookieName = key.replace('uber', 'X').replace(/\b\w/g, l => l.toUpperCase());
    res.setHeader(cookieName, responseHeaders[key]);
  });

  const finishSpan = () => {
    if (res.statusCode >= 400) { span.log({ event: 'request_error', message: res.statusMessage }); } else { span.log({ event: 'request_finished' }); }

    span.setTag(opentracing.Tags.HTTP_STATUS_CODE, res.statusCode);
    span.setTag(opentracing.Tags.HTTP_METHOD, req.method);
    span.setTag(opentracing.Tags.PEER_HOSTNAME, req.hostname);
    span.setTag(opentracing.Tags.PEER_ADDRESS, requestIp.getClientIp(req));

    if (options.tag.requestHeaders && req.headers && Object.keys(req.headers).length) { tagObject('request.headers', req.headers, span, options); }

    if (options.tag.responseHeaders) {
      const resHeaders = res.getHeaders();

      if (resHeaders && Object.keys(resHeaders).length) { tagObject('response.headers', resHeaders, span, options); }
    }

    try {
      if (span._duration === undefined) {
        span.finish();
      }
    } catch (err) {}
  };

  res.on('close', finishSpan);
  res.on('finish', finishSpan);

  req.feathers.rootSpan = span;
  req.feathers.firstEndpoint = true;
};
