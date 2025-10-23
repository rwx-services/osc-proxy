/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js}",
    "./src/components/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        'proxy': {
          dark: '#0f172a',
          darker: '#020617',
          gray: '#1e293b',
          'gray-light': '#334155',
          accent: '#10b981',
          'accent-dark': '#059669',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    }
  },
  plugins: []
}
