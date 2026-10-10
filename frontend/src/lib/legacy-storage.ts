/** Before the Audira rename, local keys were prefixed "bnb:". Move them once so nobody is signed out or loses a draft. */
let migrated = false;

export function migrateLegacyStorage() {
  if (migrated || typeof window === "undefined") return;
  migrated = true;
  try {
    const store = window.localStorage;
    const legacy = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((key): key is string => Boolean(key?.startsWith("bnb:")));
    for (const key of legacy) {
      const next = `audira:${key.slice(4)}`;
      const value = store.getItem(key);
      if (value !== null && store.getItem(next) === null) store.setItem(next, value);
      store.removeItem(key);
    }
  } catch {
    // Storage can be blocked (private mode, quota). The app works without the old values.
  }
}
