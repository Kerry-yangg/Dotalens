export const DEFAULT_MATCH_LIMIT = 20;
export const MATCH_LIMIT_MIN = 1;
export const MATCH_LIMIT_MAX = 500;
export const MATCH_LIMIT_STORAGE_KEY = "dota-lens-match-limit-v1";

export function normalizeMatchLimit(value, fallback = DEFAULT_MATCH_LIMIT) {
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isInteger(fallbackNumber)
    ? Math.min(MATCH_LIMIT_MAX, Math.max(MATCH_LIMIT_MIN, fallbackNumber))
    : DEFAULT_MATCH_LIMIT;
  if (value == null || String(value).trim() === "") return safeFallback;
  const number = Number(value);
  if (!Number.isInteger(number)) return safeFallback;
  return Math.min(MATCH_LIMIT_MAX, Math.max(MATCH_LIMIT_MIN, number));
}

export function playerMatchesPath(accountId, limit = DEFAULT_MATCH_LIMIT) {
  const normalizedAccountId = encodeURIComponent(String(accountId || "").trim());
  return `/players/${normalizedAccountId}/matches?limit=${normalizeMatchLimit(limit)}`;
}
