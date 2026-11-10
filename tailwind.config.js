import colors from 'tailwindcss/colors';
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
        slate: Object.fromEntries(Object.entries(colors.slate).map(([shade, hex]) => [shade, `rgb(var(--studio-slate-${shade}, ${parseInt(hex.slice(1,3),16)} ${parseInt(hex.slice(3,5),16)} ${parseInt(hex.slice(5,7),16)}) / <alpha-value>)`])),
        indigo: {950:'rgb(var(--studio-indigo-950, 30 27 75) / <alpha-value>)'},
        red: {950:'rgb(var(--studio-red-950, 69 10 10) / <alpha-value>)'},
        emerald: {950:'rgb(var(--studio-emerald-950, 2 44 34) / <alpha-value>)'},
        amber: {950:'rgb(var(--studio-amber-950, 69 26 3) / <alpha-value>)'},
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        },
        studio: {
          foreground: 'rgb(var(--studio-foreground, 255 255 255) / <alpha-value>)',
          darker: 'rgb(var(--studio-background, 10 13 20) / <alpha-value>)',
          dark: '#0f172a',
          card: '#1e293b',
          border: 'rgb(var(--studio-slate-700, 51 65 85) / <alpha-value>)',
          accent: '#ef4444',
          live: '#10b981',
        }
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(239, 68, 68, 0.4), 0 0 20px rgba(239, 68, 68, 0.2)' },
          '100%': { boxShadow: '0 0 15px rgba(239, 68, 68, 0.8), 0 0 30px rgba(239, 68, 68, 0.5)' },
        }
      }
    },
  },
  plugins: [],
}
