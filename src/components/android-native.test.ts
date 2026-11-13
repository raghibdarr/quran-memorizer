// android-native package (all-in-one spec 3.3, 3.4, 6, 12): the parts of the native work that
// can be checked without an Android SDK. Compiling and running the Java is the Actions
// assembleDebug run's job; alarm delivery, chime playback and widget refresh are device checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { widgetData } from './widget-sync';
import * as chime from '../../scripts/build-chime.mjs';

const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const javaDir = ['android', 'app', 'src', 'main', 'java', 'app', 'takrar', 'quran'];

describe('widgetData', () => {
  const base = { due: { '2026-11-13': 3 }, streak: 4, khatm: '' };

  it('keeps the v1 shape when there is no place', () => {
    expect(widgetData(base, null, 'Europe/London')).toEqual(base);
    expect(widgetData(base, { prayers: [] }, 'Europe/London')).toEqual(base);
  });

  it('adds the prayers and the place zone', () => {
    const prayers = [{ name: 'Asr', at: 1_763_048_520_000 }, { name: 'Maghrib', at: 1_763_053_000_000 }];
    expect(widgetData(base, { prayers }, 'Europe/London')).toEqual({ ...base, prayers, prayerTz: 'Europe/London' });
    expect(widgetData(base, { prayers })).toEqual({ ...base, prayers });
  });
});

describe('prayer chime', () => {
  it('is a 2 s, 16-bit mono WAV that starts and ends in silence', () => {
    const wav = chime.buildChimeWav();
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(chime.SAMPLE_RATE);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(chime.SAMPLE_RATE * chime.DURATION_S * 2);
    const s = chime.synthChime();
    expect(s[0]).toBe(0);
    expect(Math.abs(s[s.length - 1])).toBeLessThanOrEqual(1);
    const peak = s.reduce((m: number, v: number) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.55 * 32767);
    expect(peak).toBeLessThan(0.65 * 32767); // headroom: never clips
  });

  it('is deterministic and matches the committed resource', () => {
    expect(chime.buildChimeWav().equals(chime.buildChimeWav())).toBe(true);
    expect(chime.matchesChime(readFileSync(chime.CHIME_PATH))).toBe(true);
    // Android raw resource names: lowercase letters, digits and underscores only
    expect(chime.CHIME_PATH).toMatch(/[\\/]res[\\/]raw[\\/]takrar_chime\.wav$/);
  });

  it('is recorded as our own work', () => {
    expect(read('data-sources', 'licenses.d', '25-chime.txt')).toMatch(/^=== /);
    expect(read('data-sources', 'chime', 'SOURCE.md')).toContain('scripts/build-chime.mjs');
  });
});

describe('Android manifest', () => {
  const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const permissionLines = (name: string) => manifest.split('\n').filter((l) => l.includes('<uses-permission') && l.includes(`"android.permission.${name}"`));

  it('declares SCHEDULE_EXACT_ALARM and never USE_EXACT_ALARM', () => {
    const exact = permissionLines('SCHEDULE_EXACT_ALARM');
    expect(exact).toHaveLength(1);
    expect(exact[0]).not.toContain('tools:node');
    expect(permissionLines('USE_EXACT_ALARM')).toHaveLength(0);
  });

  it('asks for coarse location only', () => {
    expect(permissionLines('ACCESS_COARSE_LOCATION')).toHaveLength(1);
    expect(permissionLines('ACCESS_BACKGROUND_LOCATION')).toHaveLength(0);
    for (const line of permissionLines('ACCESS_FINE_LOCATION')) expect(line).toContain('tools:node="remove"');
  });
});

describe('AdhanHealth plugin', () => {
  const java = read(...javaDir, 'AdhanHealthPlugin.java');

  it('implements every method src/lib/native-plugins.ts calls', () => {
    const ts = read('src', 'lib', 'native-plugins.ts');
    const iface = ts.match(/export interface AdhanHealthPlugin \{([\s\S]*?)\n\}/)![1];
    const methods = [...iface.matchAll(/^\s+(\w+)\??\(/gm)].map((m) => m[1]);
    expect(methods).toEqual(expect.arrayContaining(['isIgnoringBatteryOptimizations', 'openBatterySettings', 'openExactAlarmSettings']));
    for (const m of methods) expect(java).toMatch(new RegExp(`@PluginMethod\\s+public void ${m}\\(PluginCall call\\)`));
    expect(java).toContain('@CapacitorPlugin(name = "AdhanHealth")');
    expect(ts).toContain("registerPlugin<AdhanHealthPlugin>('AdhanHealth')");
  });

  it('is registered before the bridge starts', () => {
    const main = read(...javaDir, 'MainActivity.java');
    expect(main.indexOf('registerPlugin(AdhanHealthPlugin.class)')).toBeGreaterThan(-1);
    expect(main.indexOf('registerPlugin(AdhanHealthPlugin.class)')).toBeLessThan(main.indexOf('super.onCreate'));
  });

  it('opens the system list, never the restricted one-app exemption request', () => {
    expect(java).toContain('ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    expect(java).not.toContain('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
    expect(read('android', 'app', 'src', 'main', 'AndroidManifest.xml')).not.toContain('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
  });
});

describe('widget v2', () => {
  it('has a "Next" prayer line the provider fills', () => {
    const layout = read('android', 'app', 'src', 'main', 'res', 'layout', 'takrar_widget.xml');
    const provider = read(...javaDir, 'widget', 'TakrarWidgetProvider.java');
    expect(layout).toContain('@+id/widget_prayer');
    expect(provider).toContain('R.id.widget_prayer');
    expect(provider).toContain('"Next: "');
    // Self-refresh is inexact and non-waking: no exact-alarm or wakeup call in the widget
    expect(provider).not.toMatch(/setExact|setAlarmClock|RTC_WAKEUP/);
  });

  it('reads the keys the app writes, and old payloads still draw', () => {
    const provider = read(...javaDir, 'widget', 'TakrarWidgetProvider.java');
    const plugin = read(...javaDir, 'widget', 'TakrarWidgetPlugin.java');
    const sent = widgetData({ due: {}, streak: 1, khatm: 'x' }, { prayers: [{ name: 'Asr', at: 1 }] }, 'Europe/London');
    for (const key of Object.keys(sent)) expect(provider).toContain(`"${key}"`);
    for (const key of Object.keys(sent.prayers![0])) {
      expect(provider).toContain(`"${key}"`);
      expect(plugin).toContain(`"${key}"`);
    }
    // No prayers array: the line is hidden and the title comes back
    expect(provider).toContain('if (prayers == null) return null');
    expect(provider).toContain('R.id.widget_title, prayerLine.isEmpty() ? View.VISIBLE : View.GONE');
  });

  it('refreshes itself after the next prayer within a bounded window, and stops with the last widget', () => {
    const provider = read(...javaDir, 'widget', 'TakrarWidgetProvider.java');
    expect(provider).toContain('am.setWindow(AlarmManager.RTC, ');
    expect(provider.slice(provider.indexOf('void onDisabled'))).toContain('scheduleRefresh(context, null)');
    // The alarm targets this app's own receiver and can't be altered by others
    expect(provider).toContain('new Intent(context, TakrarWidgetProvider.class).setAction(ACTION_REFRESH)');
    expect(provider).toContain('getBroadcast(context, 2, intent, PendingIntent.FLAG_IMMUTABLE');
  });
});

describe('iOS Info.plist', () => {
  it('explains the one-off location use', () => {
    const plist = read('ios', 'App', 'App', 'Info.plist');
    expect(plist).toMatch(/<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>Used once to work out prayer times on your phone\. Your location is never sent anywhere\.<\/string>/);
    expect(plist).not.toContain('NSLocationAlways');
  });
});
