/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        board: {
          light: '#f0d9b5',
          dark:  '#b58863',
        },
        app: {
          bg:       '#1a1a2e',
          surface:  '#16213e',
          primary:  '#e94560',
          accent:   '#0f3460',
          text:     '#e0e0e0',
          muted:    '#8892a4',
        },
      },
    },
  },
  plugins: [],
};
