/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // liquid-glass-react styles its overlay layers with Tailwind classes
    './node_modules/liquid-glass-react/dist/index.esm.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
