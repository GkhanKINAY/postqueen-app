/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind 4 moved its PostCSS plugin into its own package; `tailwindcss`
    // is no longer a PostCSS plugin itself and errors if used as one.
    '@tailwindcss/postcss': {},
  },
};

export default config;
