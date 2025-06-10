const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Russo One', 'sans-serif'],
      },
      colors: {
        'cyber-yellow': '#fcee0a',
        'cyber-cyan': '#00f0ff',
        'cyber-magenta': '#ff00c1',
        'cyber-red': '#ff003c',
        'cyber-bg': '#0a0a0a',
        'cyber-surface': 'rgba(22, 24, 29, 0.8)',
      },
      keyframes: {
        scanline: { '0%': { transform: 'translateY(-10%)' }, '100%': { transform: 'translateY(110%)' } },
      },
      animation: {
        glitch: 'glitch 1.5s infinite linear alternate-reverse',
        scanline: 'scanline 8s linear infinite',
      }
    },
  },
  plugins: [],
};