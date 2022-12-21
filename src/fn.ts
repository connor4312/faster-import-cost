const unset = Symbol("unset");

export const once = <T>(fn: () => T) => {
  let value: typeof unset | T = unset;
  const wrapped = function () {
    if (value === unset) {
      value = fn();
    }
    return value;
  };

  wrapped.forget = () => {
    value = unset;
  };

  return wrapped;
};

export const debounce = (duration: number, fn: () => void) => {
  let timeout: NodeJS.Timeout | undefined;
  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(fn, duration);
  };
};
