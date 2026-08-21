import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const DOC_REF = 'appSettings/theme';

// Two independent dials now instead of one: hue picks the color itself,
// intensity picks how vivid it is — 0 sits in soft pastel territory,
// 100 is full neon. Saturation and lightness both move with intensity
// so the whole range stays coherent rather than just fading to gray.
const DEFAULT_HUE = 189; // cyan — matches the default accent, #22D3EE
const DEFAULT_INTENSITY = 78;

function intensityToSL(intensity) {
  const t = intensity / 100;
  const saturation = 35 + t * 55; // 35% (soft pastel) → 90% (full neon)
  const lightness = 78 - t * 24; // 78% (pale) → 54% (vivid)
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

export function ThemeProvider({ children }) {
  const [hue, setHue] = useState(DEFAULT_HUE);
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, DOC_REF), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setHue(typeof data.hue === 'number' ? data.hue : DEFAULT_HUE);
      setIntensity(typeof data.intensity === 'number' ? data.intensity : DEFAULT_INTENSITY);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const { saturation, lightness } = intensityToSL(intensity);
    const hex = hslToHex(hue, saturation, lightness);
    const textColor = textColorFor(hex);
    document.documentElement.style.setProperty('--neon', hex);
    document.documentElement.style.setProperty('--neon-text', textColor);
    document.documentElement.style.setProperty('--accent-hue', hue);
  }, [hue, intensity]);

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
