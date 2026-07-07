module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#152238',
        secondary: '#1c2e4a',
        /** Alternating table row (with ``secondary``). */
        stripe: '#23395d',
        brand: {
          navy: '#152238',
          steel: '#1c2e4a',
          muted: '#7F8C8D',
          silver: '#BDC3C7',
        },
        accent: '#3b82f6',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
