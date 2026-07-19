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

/**
 * The page origins allowed to talk to this extension. Derived from FRONTEND_URL
 * rather than hardcoded, so a self-hosted build trusts its own domain — with a
 * fixed list, the extension only ever worked against the vendor's deployment.
 */
function externallyConnectableMatches(): string[] {
  const matches = ['http://localhost/*', 'https://localhost/*'];
  try {
    const { hostname } = new URL(frontendUrl);
    if (hostname && hostname !== 'localhost') {
      matches.push(`https://${hostname}/*`, `https://*.${hostname}/*`);
    }
  } catch {
    // FRONTEND_URL unset or malformed: localhost-only, which fails loudly in
    // development rather than silently trusting somebody else's domain.
  }
  return matches;
}

export const baseManifest = {
  ...manifest,
  externally_connectable: { matches: externallyConnectableMatches() },
  host_permissions: [
    import.meta.env?.FRONTEND_URL || process?.env?.FRONTEND_URL + '/*',
    (import.meta.env?.NEXT_PUBLIC_BACKEND_URL || process?.env?.NEXT_PUBLIC_BACKEND_URL || '') + '/*',
    ...providers.map(p => p.hostPermission)
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
