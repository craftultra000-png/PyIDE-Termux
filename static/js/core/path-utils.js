/** Pure helpers for safe path composition and filename validation. */

/**
 * @param {string} directory
 * @param {string} name
 * @returns {string}
 */
export function joinPath(directory, name) {
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

/**
 * Return a parent constrained to the selected storage root.
 * @param {string} path
 * @param {string} rootPath
 * @returns {string}
 */
export function parentPath(path, rootPath) {
  if (path === rootPath) return rootPath;
  return path.slice(0, path.lastIndexOf('/')) || rootPath;
}

/**
 * Names are a single filesystem segment, never a raw path.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidName(value) {
  return Boolean(value && !/[\\/\0]/.test(value) && value !== '.' && value !== '..');
}

/**
 * @param {{ path: string }[]} roots
 * @param {string | null | undefined} path
 * @returns {{ path: string } | undefined}
 */
export function findRootForPath(roots, path) {
  return roots.find(root => path?.startsWith(root.path));
}
