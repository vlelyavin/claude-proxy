export function applyRulesToString(value, rules = []) {
  return rules.reduce((currentValue, [find, replace]) => currentValue.split(find).join(replace), value);
}

export function applyRulesDeep(value, rules = []) {
  if (typeof value === 'string') {
    return applyRulesToString(value, rules);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => applyRulesDeep(entry, rules));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, applyRulesDeep(entry, rules)]),
    );
  }

  return value;
}
