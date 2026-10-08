import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// Vercel exposes the SHA as an env var; git is only the local fallback, and neither is allowed to
// fail the build — a missing commit id costs a line of diagnostics, not a deploy.
function buildCommit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

// Evaluated once per build, which is exactly what "when was this bundle made" means.
const BUILD_TIME = new Date().toISOString()
const BUILD_COMMIT = buildCommit()

// Emits an unhashed version.json beside index.html.
//
// The point is the asymmetry: a tab left open since before the last deploy is still running the
// old bundle, with the old BUILD_TIME compiled into it, while a fetch of this file reaches
// whatever Vercel serves right now. The two disagreeing is proof the tab is stale — which is the
// one thing the login screen cannot otherwise know, and the usual reason a login goes strange
// after a deploy.
//
// generateBundle doesn't run under `vite dev`, so this 404s in development. Callers treat a failed
// fetch as "no information" rather than as an error.
function versionManifest() {
  return {
    name: 'rentlogg-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildTime: BUILD_TIME, commit: BUILD_COMMIT }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionManifest()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },

  // To sider, ikke én. `index.html` er en statisk landingsside uten JavaScript-bundel, og selve
  // appen ligger på `app/index.html` → /app/.
  //
  // Grunnen til at appen måtte flytte: roten var før en naken innloggingsboks, og en
  // innloggingsboks uten avsender er nøyaktig formen en phishing-side har. Det er medvirkende
  // til at bedriftsfiltre ikke fikk kategorisert domenet og blokkerte det for kundene våre.
  // Kategoriseringstjenester kjører ikke JavaScript, så roten må servere ekte tekst.
  //
  // MERK: de trykte QR-kodene på lokasjonene peker på `/?checkin=<token>`, og allerede utsendte
  // invitasjonslenker på `/?invite=<token>`. Begge treffer nå landingssiden. Den videresender
  // dem til /app/ i <head> før første maling — se index.html. Fjernes den videresendingen,
  // slutter hver eneste QR-kode som henger på en vegg å virke.
  build: {
    rollupOptions: {
      input: {
        landing: resolve(here, 'index.html'),
        app: resolve(here, 'app/index.html'),
      },
    },
  },
})
