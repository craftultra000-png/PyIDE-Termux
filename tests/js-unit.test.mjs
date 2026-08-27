import assert from 'node:assert/strict';
import { findRootForPath, isValidName, joinPath, parentPath } from '../static/js/core/path-utils.js';
import { I18N, RTL_LOCALES, translate } from '../static/js/core/i18n.js';

const roots = [
  { id: 'termux', path: '/data/data/com.termux/files/home' },
  { id: 'shared', path: '/sdcard' },
];

assert.equal(joinPath('/sdcard/', 'main.py'), '/sdcard/main.py');
assert.equal(joinPath('/sdcard', 'project'), '/sdcard/project');
assert.equal(parentPath('/sdcard/project/src', '/sdcard'), '/sdcard/project');
assert.equal(parentPath('/sdcard', '/sdcard'), '/sdcard');
assert.equal(isValidName('main.py'), true);
assert.equal(isValidName('../escape'), false);
assert.equal(isValidName('.'), false);
assert.deepEqual(findRootForPath(roots, '/sdcard/Projects/app.py'), roots[1]);
assert.equal(findRootForPath(roots, '/not-allowed'), undefined);
assert.equal(translate('ar', 'run'), 'تشغيل');
assert.equal(translate('en', 'run'), 'Run');
assert.equal(translate('ar', 'closeFile'), 'إغلاق الملف');
assert.equal(translate('en', 'pasteHere'), 'Paste here');
assert.equal(translate('ar', 'projectSearch'), 'بحث في المشروع');
assert.equal(translate('en', 'runSettings'), 'Run settings');
assert.equal(translate('en', 'completionHint').startsWith('Local Python completion'), true);
assert.equal(translate('de', 'missing-key'), 'missing-key');
assert.equal(RTL_LOCALES.has('ar'), true);
assert.equal(RTL_LOCALES.has('en'), false);
for (const locale of Object.keys(I18N)) {
  const missing = Object.keys(I18N.ar).filter(key => !(key in I18N[locale]));
  assert.deepEqual(missing, [], `${locale} must translate every interface key`);
}

console.log('JS unit tests: OK');
