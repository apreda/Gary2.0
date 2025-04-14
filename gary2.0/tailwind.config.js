import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Updated palette with black replacing navy */
        black: {
          50: '#f2f2f2',
          100: '#e6e6e6',
          200: '#cccccc',
          300: '#b3b3b3',
          400: '#999999',
          500: '#808080',
          600: '#666666',
          700: '#4d4d4d',
          800: '#333333',
          900: '#1a1a1a',
          950: '#0d0d0d',
        },
        gold: {
          50: '#fbf8e9',
          100: '#f7f1d3',
          200: '#f0e3a7',
          300: '#e8d47b',
          400: '#e1c64f',
          500: '#d9b723',
          600: '#ae921c',
          700: '#826e15',
          800: '#57490e',
          900: '#2b2507',
          950: '#161203',
        },
      },
      scale: {
        '98': '0.98',
        '102': '1.02',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      fontFamily: {
        sans: ['Inter var', 'sans-serif'],
      },
      dropShadow: {
        'gold': '0 0 8px rgba(212, 175, 55, 0.5)',
        'gold-lg': '0 0 12px rgba(212, 175, 55, 0.6)',
      },
    },
  },
  plugins: [forms],
}
