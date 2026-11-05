import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const DOC_REF = 'appSettings/theme';

// Two independent dials now instead of one: hue picks the color itself,
// intensity picks how vivid it is — 0 sits in soft pastel territory,
// 100 is full neon. Saturation and lightness both move with intensity
// so the whole range stays coherent rather than just fading to gray.
const DEFAULT_HUE = 189; // cyan — matches the default accent, var(--neon)
const DEFAULT_INTENSITY = 78;

function intensityToSL(intensity, dark) {
  const t = intensity / 100;
  const saturation = 35 + t * 55; // 35% (soft pastel) → 90% (full neon)
  // Glass is a light theme (Nov 2026): the accent has to be dark enough to
  // read as text on white, so it runs 44% → 30% instead of 78% → 54%.
  // In dark mode it runs light instead (66% → 54%) so it reads on dark glass.
  const lightness = dark ? 66 - t * 12 : 44 - t * 14;
  return { saturation, lightness };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Relative luminance (WCAG) decides dark-vs-white text on the accent —
// necessary now more than ever, since pastel colors at low intensity are
// much lighter overall than the vivid end of the range.
function textColorFor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.42 ? '#0A0A0B' : '#FFFFFF';
}

const ThemeContext = createContext(undefined);

// Appearance (Nov 2026): each person picks Light, Dark or Match device on
// their Profile. Kept on this device (like the iPhone's own setting), and
// read before the page draws by the little script in index.html.
const APPEARANCE_KEY = 'hubAppearance';
const readAppearance = () => {
  try { return localStorage.getItem(APPEARANCE_KEY) || 'light'; } catch { return 'light'; }
};
const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [hue, setHue] = useState(DEFAULT_HUE);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);
  const [appearance, setAppearanceState] = useState(readAppearance);
  const [sysDark, setSysDark] = useState(systemDark);
  const dark = appearance === 'dark' || (appearance === 'auto' && sysDark);

  // "Match device" follows the computer or phone when it switches.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0E1118' : '#EDF1F6');
  }, [dark]);

  const setAppearance = (next) => {
    setAppearanceState(next);
    try { localStorage.setItem(APPEARANCE_KEY, next); } catch { /* private window: this visit only */ }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, DOC_REF), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setHue(typeof data.hue === 'number' ? data.hue : DEFAULT_HUE);
      setIntensity(typeof data.intensity === 'number' ? data.intensity : DEFAULT_INTENSITY);
    },
      (err) => console.error('[Theme listener] ' + err.code + ': ' + err.message)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const { saturation, lightness } = intensityToSL(intensity, dark);
    const hex = hslToHex(hue, saturation, lightness);
    const textColor = textColorFor(hex);
    document.documentElement.style.setProperty('--neon', hex);
    document.documentElement.style.setProperty('--neon-text', textColor);
    document.documentElement.style.setProperty('--accent-hue', hue);
  }, [hue, intensity, dark]);

  // Admin-only in the UI, but this itself has no permission check — the
  // Firestore rule on appSettings/* (admin-write, signed-in-read) is the
  // real enforcement.
  const setAccentTheme = async (nextHue, nextIntensity, updatedByName) => {
    await setDoc(doc(db, DOC_REF), {
      hue: nextHue,
      intensity: nextIntensity,
      updatedAt: Date.now(),
      updatedBy: updatedByName,
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        hue,
        intensity,
        setAccentTheme,
        previewHue: setHue,
        previewIntensity: setIntensity,
        appearance,
        setAppearance,
        dark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
