const { cloneDeepWith, isObject, toLower, some, map } = require('lodash');

const tagDefaults = { requestHeaders: true, responseHeaders: true ,id: true, data: true, query: true, result: false };
const maskDefaults = { blacklist: [], ignoreCase: false, replacement: '__MASKED__' };

const tagObject = (tag, obj, span, options = {}) => {
  const maskOptions = { ...maskDefaults, ...options.mask };
  const normalizedTag = camelCase(tag);
  const tagSettings = options.tag[normalizedTag];
  const index = Boolean(tagSettings && tagSettings.index);
  const maskEnabled = Boolean(maskOptions.blacklist.length);

  if (!index && !maskEnabled) {
    span.setTag(tag, obj);

    return;
  }

  const clonedObj = processObject(tag, obj, span, index, maskEnabled, maskOptions);

  if (!index)
    span.setTag(tag, clonedObj);
};

const processObject = (tag, obj, span, index, maskEnabled, { blacklist, ignoreCase, replacement }) => {
  const nestedStack = [{ key: tag, value: obj }];

  return cloneDeepWith(obj, (value, key, object) => {
    if (index) {
      if (Array.isArray(value)) {
        const arr = [];

        for (const [idx, val] of Object.entries(value))
          arr.push(processObject(getKeyName(`${key || tag}[${idx}]`, nestedStack), val, span, index, maskEnabled, { blacklist, ignoreCase, replacement }));

        return arr;
      }

      let lastObject = nestedStack[nestedStack.length - 1].value;

      while (lastObject !== (object || obj)) {
        nestedStack.pop();
        lastObject = nestedStack[nestedStack.length - 1].value;
      }
    }

    if (isObject(value) && !value.toISOString && !Buffer.isBuffer(value)) {
      if (index && key && Object.keys(value).length)
        nestedStack.push({ key, value });

      return; // eslint-disable-line
    }

    if (maskEnabled && key !== undefined && some(blacklist, item => ignoreCase ? toLower(key) === toLower(item) : key === item)) {
      if (index)
        span.setTag(getKeyName(key, nestedStack), replacement);

      return replacement;
    }

    let strValue = null;

    if (isObject(value)) {
      if (value.toISOString)
        strValue = value.toISOString();

      if (Buffer.isBuffer(value))
        strValue = value.toString();
    }

    if (index)
      span.setTag(getKeyName(key, nestedStack), strValue || value);

    return strValue || value;
  });
};

const getKeyName = (key, nestedStack) => {
  return `${map(nestedStack, val => val.key).join('.')}${key ? '.' + key : ''}`;
};

const camelCase = input => {
  return input.toLowerCase().replace(/\.(.)/g, (match, group1) => group1.toUpperCase());
};

module.exports = {
  tagDefaults,
  tagObject,
};
