import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import no from "./locales/no.json";
import en from "./locales/en.json";
import lt from "./locales/lt.json";
import lv from "./locales/lv.json";
import ru from "./locales/ru.json";

// Statically imported, not lazy-loaded: all five files together are a few kB, and a cleaner on a
// half-dead signal in a cold room shouldn't have a language switch fail on a network round-trip —
// this app already carries an offline queue for exactly that environment (offlineQueue.js).
const DICTS = { no, en, lt, lv, ru };

// Endonyms on purpose — someone looking for Lithuanian is scanning for "Lietuvių", not "Litauisk".
// Keep in sync with SUPPORTED_LANGUAGES in the backend's src/utils/languages.js.
export const LANGUAGES = [
  { code: "no", label: "Norsk" },
  { code: "en", label: "English" },
  { code: "lt", label: "Lietuvių" },
  { code: "lv", label: "Latviešu" },
  { code: "ru", label: "Русский" },
];

export const DEFAULT_LANGUAGE = "no";
const STORAGE_KEY = "rentlogg_language";

export function isSupported(code) {
  return LANGUAGES.some((l) => l.code === code);
}

// localStorage, deliberately unlike the auth/session state next door in App.jsx (sessionStorage).
// A language choice isn't a session secret and there's nothing to leak to the next person on a
// shared work phone — whereas losing it on every tab close would mean re-picking a language from
// a list you can't read, every single shift.
function storedLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isSupported(v) ? v : null;
  } catch {
    return null; // private browsing / storage disabled — fall through to the browser's own locale
  }
}

function browserLanguage() {
  for (const tag of navigator.languages || [navigator.language || ""]) {
    const base = String(tag).toLowerCase().split("-")[0];
    // The app's Norwegian covers both written standards, and the browser may report either.
    if (base === "nb" || base === "nn") return "no";
    if (isSupported(base)) return base;
  }
  return null;
}

// The logged-in account's stored choice wins over this device's, so someone who set their language
// once on their own phone gets it again on a borrowed one. Falls back to whatever this device last
// used, then to the browser's own locale, then Norwegian.
export function resolveLanguage(user) {
  if (user && isSupported(user.language)) return user.language;
  return storedLanguage() || browserLanguage() || DEFAULT_LANGUAGE;
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

const I18nContext = createContext(null);

// The one piece of module-level state in here, and deliberately so: api.js turns every failed
// response into an Error whose .message the whole app renders directly, and it has no React
// context to read from. Mirroring the active language here means a backend error code is
// translated once, at the fetch boundary, instead of at the ~40 places that render err.message.
// Kept in sync by the provider below on every language change.
let activeLanguage = DEFAULT_LANGUAGE;

// code -> translated sentence, falling back to whatever Norwegian text the backend also sent.
// A backend error the frontend has no string for yet stays readable (just untranslated) rather
// than rendering a bare "not_allowed" at someone mid-shift.
export function translateApiError(code, fallbackText) {
  if (!code) return fallbackText;
  const key = `error.${code}`;
  const dict = DICTS[activeLanguage] || DICTS[DEFAULT_LANGUAGE];
  return dict[key] ?? DICTS[DEFAULT_LANGUAGE][key] ?? fallbackText ?? key;
}

export function I18nProvider({ user, onLanguageChange, children }) {
  const [language, setLanguageState] = useState(() => resolveLanguage(user));

  // Set during render rather than in an effect: a fetch fired by a child's own render/effect can
  // reject before an effect here would have run, and an error message in the previous language
  // is exactly the confusing half-state this is meant to avoid.
  activeLanguage = language;

  // Whether the person has actually tapped the picker since this page was opened, as opposed to
  // just inheriting whatever this device or account was last set to. Used on login below.
  const pickedThisSession = useRef(false);

  const setLanguage = useCallback(
    (code) => {
      if (!isSupported(code)) return;
      pickedThisSession.current = true;
      setLanguageState(code);
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // Storage unavailable — the choice still applies for this session, it just won't persist.
      }
      // Applied locally first, then reported upwards to be saved on the account. The UI never
      // waits on that round-trip: a cleaner who taps their language on a bad signal should see the
      // app switch immediately, and it's already persisted on this device either way.
      onLanguageChange?.(code);
    },
    [onLanguageChange]
  );

  // Re-resolve when a different account takes over the tab (login, or a shared work phone being
  // handed on after a logout). Keyed on the user id rather than the whole object, so an unrelated
  // profile edit doesn't yank the language out from under someone mid-session.
  const lastUserId = useRef(user?.id ?? null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (id === lastUserId.current) return;
    const wasLoggedOut = lastUserId.current === null;
    lastUserId.current = id;

    // Someone who picked a language on the login screen and then logged in meant it — the account
    // value must not silently undo the choice they just made in front of them. Push the choice up
    // to the account instead, so the two stop disagreeing on the next login. Every other case (a
    // fresh open, or the next person on a shared work phone) defers to the account's own setting.
    if (id !== null && wasLoggedOut && pickedThisSession.current) {
      onLanguageChange?.(language);
      return;
    }
    pickedThisSession.current = false;
    setLanguageState(resolveLanguage(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const value = useMemo(() => {
    const dict = DICTS[language] || DICTS[DEFAULT_LANGUAGE];

    // Missing key -> Norwegian -> the key itself. Norwegian is the source language, so a key that
    // hasn't been translated yet renders as readable Norwegian rather than as a blank or a raw
    // dotted key; the key only surfaces if it's missing from no.json too, which is a real bug and
    // should look like one.
    function t(key, vars) {
      const text = dict[key] ?? DICTS[DEFAULT_LANGUAGE][key];
      if (text === undefined) {
        if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      return interpolate(text, vars);
    }

    // Plural forms via Intl, not an `n === 1` check — Russian, Lithuanian and Latvian all have
    // more than two categories (ru: one/few/many, lt: one/few/other, lv: zero/one/other), and
    // getting "3 rom" right in those languages is exactly the kind of thing that makes an app
    // read as machine-translated. Keys are written as "<key>.one", "<key>.few", "<key>.other".
    function tn(key, count, vars) {
      const category = new Intl.PluralRules(language === "no" ? "nb" : language).select(count);
      const withCount = { count, ...vars };
      const dictKey = `${key}.${category}`;
      if (dict[dictKey] ?? DICTS[DEFAULT_LANGUAGE][dictKey]) return t(dictKey, withCount);
      return t(`${key}.other`, withCount);
    }

    return { language, setLanguage, t, tn };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

// Convenience for the common case — `const t = useT()` reads better at the ~250 call sites this
// is about to gain than destructuring { t } everywhere.
export function useT() {
  return useI18n().t;
}
