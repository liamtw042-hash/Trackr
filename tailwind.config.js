/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Ground: a cool blue-slate ink. Never pure black — #000 on an OLED
        //    panel makes hairline borders vanish and the whole UI lose structure.
        ink: {
          950: '#080B11', // page ground
          900: '#0C1017', // panel
          850: '#11161F', // raised panel / table header
          800: '#161C27', // hover
          700: '#1E2632', // hairline border
          600: '#2A3441', // stronger border / divider
          500: '#3D4959', // disabled text
          400: '#5A6779', // dim text
          300: '#8291A5', // muted text
          200: '#AEBBCC', // secondary text
          100: '#D7DFEA', // primary text
          50: '#EDF2F8', // emphasis text
        },
        // ── P&L. Reserved exclusively for profit/loss and rule pass/fail.
        //    Never used decoratively.
        up: {
          DEFAULT: '#24C98A',
          dim: '#1A8F62',
          wash: 'rgba(36,201,138,0.10)',
        },
        down: {
          DEFAULT: '#F0555C',
          dim: '#B33B41',
          wash: 'rgba(240,85,92,0.10)',
        },
        // ── The one accent: a desaturated brass. Chosen because it sits far
        //    from both the green and the red in hue, so it never reads as a
        //    P&L signal, and it carries the instrument-panel register.
        brass: {
          DEFAULT: '#C89B3C',
          bright: '#E0B458',
          dim: '#8A6B28',
          wash: 'rgba(200,155,60,0.10)',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px — table data
        xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12px
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px — body default
        base: ['0.875rem', { lineHeight: '1.375rem' }], // 14px
      },
      letterSpacing: {
        label: '0.09em',
      },
      borderRadius: {
        // Deliberately tight. Trading terminals are rectilinear; heavy
        // rounding is the single strongest "SaaS dashboard" tell.
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
        lg: '4px',
      },
      spacing: {
        row: '1.75rem', // standard dense table row height
      },
      animation: {
        'fade-in': 'fadeIn 140ms ease-out',
        'rise': 'rise 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        'flash-up': 'flashUp 600ms ease-out',
        'flash-down': 'flashDown 600ms ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flashUp: {
          '0%': { backgroundColor: 'rgba(36,201,138,0.18)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashDown: {
          '0%': { backgroundColor: 'rgba(240,85,92,0.18)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
}
