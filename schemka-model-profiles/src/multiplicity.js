import { LIMITS } from '../../schemka-model-core/src/json.js';

const evidence = Object.freeze({
  forms: 'archimate4-section-5.6-p47-pdf65',
  oneOrMore: 'archimate4-example-5-16-p48-pdf66',
});
const result = (status, reason, sourceEvidence = null) => Object.freeze({ status, reason, sourceEvidence });

/**
 * Read-only syntax evidence for one raw end value, not model conformance.
 * Storage accepts any bounded string. This helper never trims or rewrites it.
 */
export function assessMultiplicity(raw, defined = raw !== undefined) {
  if (defined === false) return result('ABSENT', 'not-specified');
  if (defined !== true || typeof raw !== 'string') return result('UNVERIFIED', 'non-string-input');
  if (raw.length > LIMITS.multiplicity) return result('UNVERIFIED', 'local-input-limit');
  if (raw.includes('...')) return result('UNVERIFIED', 'unrecognized-text');
  if (raw === '*' || raw === '0..*') return result('CONFIRMED_SYNTAX', 'unbounded', evidence.forms);
  if (raw === '1..*') return result('CONFIRMED_SYNTAX', 'one-or-more-example', evidence.oneOrMore);
  if (/^\s|\s$|^\+|\.\.\+|(?!(?:[0-9]))\p{Nd}/u.test(raw) ||
      (/\s/.test(raw) && /^[\p{Nd}.*+\-/\s]+$/u.test(raw)) ||
      /^(?:-?0\d+)(?:\.\.(?:-?\d+|\*))?$/.test(raw) || /^-?\d+\.\.-?0\d+$/.test(raw)) {
    return result('UNVERIFIED', 'unverified-numeric-spelling');
  }
  if (/^\d+$/.test(raw)) {
    return BigInt(raw) > 0n ? result('CONFIRMED_SYNTAX', 'positive-integer', evidence.forms)
      : result('UNVERIFIED', 'zero-singleton-not-established');
  }
  const bounded = /^(\d+)\.\.(\d+)$/.exec(raw);
  if (bounded) {
    const lower = BigInt(bounded[1]), upper = BigInt(bounded[2]);
    if (upper > lower) return result('CONFIRMED_SYNTAX', 'ascending-bounded-range', evidence.forms);
    return result('INVALID_SYNTAX', upper === lower ? 'equal-range' : 'descending-range', evidence.forms);
  }
  if (/^\d+\.\.\*$/.test(raw)) return result('UNVERIFIED', 'local-unbounded-generalization');
  // Recognize only numeric-looking negative/fractional forms. Arbitrary raw
  // text remains UNVERIFIED, never an invented global prohibition.
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+)(?:\.\.(?:-?(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+)|\*))?$/.test(raw)) {
    return result('INVALID_SYNTAX', /(^|\.\.)-/.test(raw) ? 'negative-number' : 'fractional-number', evidence.forms);
  }
  return result('UNVERIFIED', raw === '' ? 'empty-text' : 'unrecognized-text');
}
