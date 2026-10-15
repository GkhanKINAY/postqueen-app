import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { ManifestV3Export } from '@crxjs/vite-plugin';
import { defineConfig, BuildOptions } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { stripDevIcons, crxI18n } from './custom-vite-plugins';
import manifest from './manifest.json';
import devManifest from './manifest.dev.json';
import pkg from './package.json';
import { providers } from './src/providers/provider.registry';

const isDev = process.env.NODE_ENV === 'development';
// set this flag to true, if you want localization support
const localize = false;

const merge = isDev ? devManifest : ({} as ManifestV3Export);

const frontendUrl =
  import.meta.env?.FRONTEND_URL || process?.env?.FRONTEND_URL || '';
const backendUrl =
  import.meta.env?.NEXT_PUBLIC_BACKEND_URL ||
  process?.env?.NEXT_PUBLIC_BACKEND_URL ||
  '';

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

// Without its two addresses a release build still packs and uploads, and then
// answers no page but localhost and never reaches the backend. A relative
// backend such as "/api" is just as broken: the service worker has no origin
// to resolve it against.
if (!isDev && (!parseUrl(frontendUrl) || !parseUrl(backendUrl))) {
  throw new Error(
    'Set FRONTEND_URL and NEXT_PUBLIC_BACKEND_URL to absolute URLs to build the extension. The build writes both into it.'
  );
}

/**
 * The page origins allowed to talk to this extension. Derived from FRONTEND_URL
 * rather than hardcoded, so a self-hosted build trusts its own domain — with a
 * fixed list, the extension only ever worked against the vendor's deployment.
 */
function externallyConnectableMatches(): string[] {
  const hostname = parseUrl(frontendUrl)?.hostname || '';
  // Same rule as the origin check in src/background.ts.
  const matches =
    isDev || !hostname || hostname === 'localhost'
      ? ['http://localhost/*', 'https://localhost/*']
      : [];
  if (hostname && hostname !== 'localhost') {
    matches.push(`https://${hostname}/*`, `https://*.${hostname}/*`);
  }
  return matches;
}

/**
 * The backend, for the daily cookie refresh: the service worker's POST is
 * cross-origin, and the API's CORS list does not include the extension. The
 * frontend needs no access, since its pages reach the extension and not the
 * other way round.
 */
function backendHostPermissions(): string[] {
  const origin = parseUrl(backendUrl)?.origin;
  return origin ? [`${origin}/*`] : [];
}

export const baseManifest = {
  ...manifest,
  externally_connectable: { matches: externallyConnectableMatches() },
  host_permissions: [
    ...backendHostPermissions(),
    ...providers.map((p) => p.hostPermission),
  ],
  permissions: [...(manifest.permissions || [])],
  version: pkg.version,
  ...merge,
  ...(localize
    ? {
        name: '__MSG_extName__',
        description: '__MSG_extDescription__',
        default_locale: 'en',
      }
    : {}),
} as ManifestV3Export;

export const baseBuildOptions: BuildOptions = {
  sourcemap: isDev,
  emptyOutDir: !isDev,
  // The Chrome Web Store reviews the code by reading it.
  minify: false,
};

export default defineConfig({
  envPrefix: ['NEXT_PUBLIC_', 'FRONTEND_URL', 'NEXT_PUBLIC_BACKEND_URL'],
  plugins: [
    tsconfigPaths(),
    react(),
    stripDevIcons(isDev),
    crxI18n({ localize, src: './src/locales' }),
  ],
  publicDir: resolve(__dirname, 'public'),
});
