const opentracing = require('opentracing');
const Url = require('url');
const { tagDefaults, mask } = require('./utils');

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

  if (skip)
    return;

  const tracer = opentracing.globalTracer();
  const wire = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers);
  const span = tracer.startSpan(path, { childOf: wire });

  span.log({ event: 'request_received' });

  if (options.tag.headers && req.headers && Object.keys(req.headers).length)
    span.setTag('http.headers', mask(req.headers, options.mask));

  // set trace response headers
  const responseHeaders = {};
  tracer.inject(span, opentracing.FORMAT_TEXT_MAP, responseHeaders);
  Object.keys(responseHeaders).forEach(key => {
    const cookieName = key.replace('uber', 'X').replace(/\b\w/g, l => l.toUpperCase());
    res.setHeader(cookieName, responseHeaders[key]);
  });

  const finishSpan = () => {
    if (res.statusCode >= 400)
      span.log({ event: 'request_error', message: res.statusMessage });
    else
      span.log({ event: 'request_finished' });

    span.setTag('http.status_code', res.statusCode);
    span.setTag('http.method', req.method);

    span.finish();
  };

  res.on('close', finishSpan);
  res.on('finish', finishSpan);

  req.feathers.rootSpan = span;
  req.feathers.firstEndpoint = true;
};
