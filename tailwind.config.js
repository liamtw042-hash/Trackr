/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Ground ──────────────────────────────────────────────────────────
        // Near-black carrying a slight blue cast (~220°, very low saturation).
        // Deliberately not #000: the surface steps below are what separate
        // regions now that most borders are gone, and pure black flattens them
        // — on an OLED panel it erases hairlines completely.
        ink: {
          950: '#07090E', // page ground
          900: '#0B0E15', // surface — a lifted region
          850: '#101520', // surface raised — hero, table headers
          800: '#161C29', // hover
          750: '#1B2231', // input ground
          700: '#232B3B', // hairline (used sparingly now)
          600: '#2F3949', // stronger divider
          500: '#465469', // disabled
          400: '#64748E', // dim text
          300: '#8896AE', // muted text
          200: '#AEBACD', // secondary text
          100: '#D5DDE9', // primary text
          50: '#EEF3FA', // emphasis
        },

        // ── P&L. Reserved. Never decorative. ────────────────────────────────
        // Green sits at ~145° — a true green, not the cyan-leaning emerald the
        // previous palette used, which competed with a blue accent.
        up: {
          DEFAULT: '#2FCE72',
          dim: '#1F8B4D',
          wash: 'rgba(47,206,114,0.09)',
        },
        down: {
          DEFAULT: '#F2555A',
          dim: '#A63A3E',
          wash: 'rgba(242,85,90,0.09)',
        },

        // ── Accent: light blue ──────────────────────────────────────────────
        // High lightness, moderate saturation — reads as *light* blue rather
        // than the saturated #3B82F6 that signals generic SaaS. ~65° from the
        // green and at a clearly different lightness, so it never gets mistaken
        // for a P&L signal. Used for structure and emphasis, not fill.
        azure: {
          DEFAULT: '#7FB4E8',
          bright: '#A6CDF2',
          dim: '#4C7BA8',
          deep: '#2B4A68',
          wash: 'rgba(127,180,232,0.08)',
        },
      },

      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        // Hero figures — the two or three numbers that actually matter.
        hero: ['2.125rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        figure: ['1.375rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
      },

      letterSpacing: {
        label: '0.11em',
      },

      borderRadius: {
        // Softened from the previous 2px, but nowhere near a rounded SaaS card.
        // Enough to take the mechanical edge off; small enough that the UI still
        // reads as instrumentation.
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '5px',
      },

      spacing: {
        // A deliberate rhythm for separating regions. Content inside a table
        // stays tight; the space *between* regions is what does the work now
        // that borders no longer do.
        gutter: '1.25rem',
        section: '2rem',
      },

      // Tailwind's default opacity scale jumps 10 → 20, which is too coarse for
      // the low-alpha washes this palette leans on: /10 is invisible on the
      // near-black ground and /20 reads as a filled block. The intermediate
      // steps are where the accent actually sits.
      opacity: {
        12: '0.12',
        15: '0.15',
        18: '0.18',
      },

      animation: {
        'fade-in': 'fadeIn 160ms ease-out',
        rise: 'rise 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: {
          from: { opacity: '0', transform: 'translateY(5px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
