// src/review.ts
// One polite App Store review ask, right after a log event saves — the moment
// the app has just done its job. Eligible only when:
//   - at least 20 events (feeds + sleeps + diapers) have ever been logged, and
//   - the local hour is 9:00-20:59 — never prompt a 3am parent.
// Asks at most once ever (kv flag; Apple further rate-limits on their side).
// Fail-open: if the native module is missing or throws, nothing happens.
// NOT a pure module (expo imports); keep it out of dbCore's test surface.

import Storage from 'expo-sqlite/kv-store';
import { countEvents } from './db';

const ASKED_KEY = 'dreamfeed.review-asked.v1';
const MIN_EVENTS = 20;
const DAY_START_HOUR = 9; // earliest local hour we will ever prompt
const DAY_END_HOUR = 21; // from this hour on, no prompts (exclusive bound)

function getStoreReview(): any | null {
  // Do NOT rely on try/catch around require() for fail-open here: when a
  // module's factory throws (native half missing from the binary), Metro's
  // guardedLoadModule reports it as a FATAL error itself — the exception
  // never reaches this catch, and a release build aborts. This bricked a
  // Number Nine device build on 2026-07-27. Check the native registry BEFORE
  // requiring so the factory can't throw.
  const native = (globalThis as any).expo?.modules?.ExpoStoreReview;
  if (!native) return null;
  try {
    const mod = require('expo-store-review');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

/** Request a review if eligible and never asked before. Safe to call often. */
export function maybeAskForReview(): void {
  try {
    const hour = new Date().getHours();
    if (hour < DAY_START_HOUR || hour >= DAY_END_HOUR) return;
    if (Storage.getItemSync(ASKED_KEY)) return;
    if (countEvents() < MIN_EVENTS) return;
    const SR = getStoreReview();
    if (!SR) return;
    Storage.setItemSync(ASKED_KEY, String(Date.now()));
    // isAvailableAsync + requestReview both resolve quietly; the OS decides
    // whether anything is actually shown.
    SR.isAvailableAsync?.()
      .then((ok: boolean) => {
        if (ok) SR.requestReview?.();
      })
      .catch(() => {});
  } catch {
    /* fail open */
  }
}
