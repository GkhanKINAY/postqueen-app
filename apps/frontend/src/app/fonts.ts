import './fonts.css';

// One shared definition for every layout: DM Sans for body copy, Plus Jakarta
// Sans for display (the pairing of the landing site, postqueen.ai), and
// JetBrains Mono for anything the reader is expected to copy rather than read:
// API keys, MCP config blocks, channel IDs, CLI commands.
//
// The files and @font-face rules live in fonts.css and fonts/, taken verbatim
// from what next/font/google used to download at build time, so the build no
// longer needs Google Fonts to be reachable. Weight 400 is loaded on purpose:
// unstyled body text falls back to it.

/**
 * Goes on <body>: publishes all three font variables (so `font-sans`,
 * `font-display` and `font-mono` resolve) and sets DM Sans as the inherited
 * base.
 */
export const fontClassName = 'pq-fonts';
