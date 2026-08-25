/**
 * Lightweight HTTP client for PyIDE's local API.
 * The server always returns JSON, including errors.
 */

/** @typedef {{ error?: string, [key: string]: unknown }} ApiResponse */

/**
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<ApiResponse>}
 */
export async function api(path, options = {}) {
  const response = await fetch(path, options);
  return response.json();
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @returns {Promise<ApiResponse>}
 */
export function apiPost(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
