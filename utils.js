const { cloneDeepWith, isObject, toLower, some } = require('lodash');

const tagDefaults = { requestHeaders: true, responseHeaders: true ,id: true, data: true, query: true };
const maskDefaults = { blacklist: [], ignoreCase: false, replacement: '__MASKED__' };

const mask = (values, options = {}) => {
  options = { ...maskDefaults, ...options };
  const { blacklist, ignoreCase, replacement } = options;

  if (!blacklist.length)
    return values;

  return cloneDeepWith(values, (value, key) => {
    if (some(blacklist, item => ignoreCase ? toLower(key) === toLower(item) : key === item))
      return replacement;

    if (isObject(value))
      return;

    return value;
  });
};

module.exports = {
  tagDefaults,
  mask,
};
