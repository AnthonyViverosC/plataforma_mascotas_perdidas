/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        tinta: '#0f1115',
        fondo: '#f4f6f7',
        borde: '#e5e8eb',
        suave: '#6b7280',
        acento: { DEFAULT: '#0f766e', claro: '#e6f4f1' },
        alerta: { DEFAULT: '#dc2626', claro: '#fdecec' },
        aviso: { DEFAULT: '#b45309', claro: '#fef5e7' },
      },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
      },
    },
  },
  plugins: [],
};
