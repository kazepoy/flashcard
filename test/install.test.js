import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPlatform, separateStorage, weeklyWipe } from '../src/ui/install.js';

test("installation : famille d'appareil et de navigateur", () => {
  const ua = {
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
    iphoneChrome:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  };
  assert.equal(installPlatform(ua.iphone), 'ios');
  assert.equal(installPlatform(ua.iphoneChrome), 'ios', 'tout navigateur iOS : moteur Safari');
  assert.equal(installPlatform(ua.ipad, 5), 'ios', 'iPad : se présente comme un Mac tactile');
  assert.equal(installPlatform(ua.macSafari, 0), 'mac-safari');
  assert.equal(installPlatform(ua.macChrome, 0), 'chromium');
  assert.equal(installPlatform(ua.edge), 'chromium');
  assert.equal(installPlatform(ua.android), 'chromium');
  assert.equal(installPlatform(ua.firefoxAndroid), 'firefox-android');
  assert.equal(installPlatform(ua.firefox), 'firefox-desktop');
  assert.ok(weeklyWipe('ios') && weeklyWipe('mac-safari') && !weeklyWipe('chromium'));
  assert.ok(separateStorage('ios') && !separateStorage('firefox-android'));
});
