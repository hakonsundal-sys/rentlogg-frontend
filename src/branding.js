// White-label: ett firmas egen kulør og logo, lagt oppå den delte profilen.
//
// To kilder, i denne rekkefølgen:
//   1. verten (GET /branding?host=…) — gjelder FØR innlogging, så en kunde som kommer inn via
//      sitt eget domene ser sin egen logo på innloggingsskjermen.
//   2. den innloggede brukerens firma (user.branding) — gjelder etterpå, også på rentlogg.no,
//      så white-label ikke avhenger av at domenet er satt opp.
//
// Bare kuløren overstyres, ikke hele paletten. Grunnen står på companies i backendens db.js:
// grønn, oransje, rød og blå er bærende betydning i denne appen, og en kunde med fri tilgang
// til paletten lager før eller siden en kombinasjon der de ikke kan skilles.

import { API_URL } from "./api";

// Mørkere variant til hover og tekst-på-lys-flate. Enkel multiplikasjon mot svart er nok her —
// vi trenger «samme farge, litt mørkere», ikke en fargeteoretisk korrekt tone.
function darken(hex, factor = 0.78) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Svak flate til aktive menyrader og merkelapper: samme kulør, blandet nesten helt ut i hvitt.
function tint(hex, alpha = 0.1) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c * alpha + 255 * (1 - alpha));
  return `#${[mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

// Setter eller fjerner overstyringen. Fjerning er viktig: logger man ut av et white-labelet
// firma og inn i et annet, skal ikke forrige kundes farge henge igjen.
export function applyBrandColor(color) {
  const root = document.documentElement;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) {
    ["--brand", "--brand-dark", "--brand-bg", "--brand-gradient", "--sidebar-active-bg"].forEach((v) =>
      root.style.removeProperty(v)
    );
    return;
  }
  root.style.setProperty("--brand", color);
  root.style.setProperty("--brand-dark", darken(color));
  root.style.setProperty("--brand-bg", tint(color));
  root.style.setProperty("--brand-gradient", color);
  root.style.setProperty("--sidebar-active-bg", tint(color));
}

// Profilen for verten vi står på. Feiler kallet, er svaret «ingen profil» og ikke en feil:
// white-label er valgfritt, og en innloggingsskjerm skal ikke bli stående tom fordi et
// pynteoppslag ikke svarte.
export async function fetchHostBranding() {
  try {
    const res = await fetch(`${API_URL}/branding?host=${encodeURIComponent(window.location.host)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data && (data.brand_color || data.logo_data_url) ? data : null;
  } catch {
    return null;
  }
}
