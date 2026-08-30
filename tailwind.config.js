/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Ground ───────────────────────────────────────────────────────
        // A cool near-black. Deliberately not #000: the elevation model below
        // separates planes with background steps *and* a top-edge highlight,
        // and both of those need somewhere to sit. Pure black kills the
        // highlight and flattens every hairline on an OLED panel.
        //
        // The steps are spaced so that two adjacent planes are distinguishable
        // at a glance without a border between them — that is what stops the
        // page reading as one flat sheet.
        ink: {
          975: '#05070B', // deepest — behind the app, modal scrim
          950: '#070A0F', // page ground
          900: '#0C1017', // plane 1 — quiet panel
          850: '#11161F', // plane 2 — raised panel, table header
          800: '#171D28', // plane 3 — hover, popover
          750: '#1C2330', // input ground
          700: '#252D3C', // hairline
          600: '#323C4D', // stronger divider
          500: '#4A5769', // disabled
          400: '#6B7A92', // dim text
          300: '#8E9CB2', // muted text
          200: '#B2BECE', // secondary text
          100: '#D8DFE9', // primary text
          50: '#F0F4F9', // emphasis
        },

        // ── P&L. Reserved. Never decorative. ────────────────────────────────
        up: {
          DEFAULT: '#2FCE72',
          bright: '#5BE195',
          dim: '#1F8B4D',
          wash: 'rgba(47,206,114,0.10)',
        },
        down: {
          DEFAULT: '#F2555A',
          bright: '#FF8085',
          dim: '#A63A3E',
          wash: 'rgba(242,85,90,0.10)',
        },

        // ── Accent: light blue ──────────────────────────────────────────
        // High lightness, moderate saturation — reads as *light* blue rather
        // than the saturated #3B82F6 that signals generic SaaS. Sits ~65° from
        // the green and at a clearly different lightness, so it is never
        // mistaken for a P&L signal. Carries structure, not fill.
        azure: {
          DEFAULT: '#7FB4E8',
          bright: '#A6CDF2',
          dim: '#5C87B4',
          deep: '#2B4A68',
          wash: 'rgba(127,180,232,0.09)',
        },
      },

      fontFamily: {
        // Instrument Sans (2023) — a tight grotesque with genuinely distinctive
        // letterforms (single-storey-feeling g, sharp diagonal terminals, a
        // narrow set width). Reads as considered rather than defaulted, and the
        // narrow width buys horizontal room in a dense table.
        sans: ['"Instrument Sans Variable"', '"Instrument Sans"', 'system-ui', 'sans-serif'],
        // Geist Mono (2023) — low contrast, geometric, unambiguous digits.
        // Replaces IBM Plex Mono, whose typewriter proportions were most of
        // what made the app read as a terminal emulator.
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.01em' }],
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        // Page and panel titles. Set in the sans, tightened — the tight
        // tracking is where a grotesque earns its keep at display size.
        title: ['1.0625rem', { lineHeight: '1.35', letterSpacing: '-0.015em' }],
        display: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        // Numeric figures.
        figure: ['1.4375rem', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        hero: ['2.25rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },

      letterSpacing: {
        label: '0.08em',
        tight: '-0.012em',
        tighter: '-0.022em',
      },

      borderRadius: {
        DEFAULT: '4px',
        sm: '3px',
        md: '6px',
        lg: '8px',
        xl: '11px',
      },

      spacing: {
        gutter: '1.25rem',
        // Region rhythm. Two steps, not one: related regions sit at `stack`,
        // unrelated bands at `section`. A single uniform gap is what makes a
        // long page read as an undifferentiated list of boxes.
        stack: '1.5rem',
        section: '2.5rem',
        band: '3.5rem',
      },

      opacity: {
        4: '0.04',
        6: '0.06',
        8: '0.08',
        12: '0.12',
        15: '0.15',
        18: '0.18',
        22: '0.22',
        28: '0.28',
        32: '0.32',
      },

      boxShadow: {
        // Elevation is a pair: an ambient drop *and* a 1px top highlight, so a
        // plane reads as lit from above rather than as a rectangle with a blur
        // behind it. This is the whole difference between depth and the soft
        // grey card shadow the brief rules out.
        e1: '0 1px 2px rgba(0,0,0,0.5)',
        e2: '0 1px 2px rgba(0,0,0,0.45), 0 4px 12px -3px rgba(0,0,0,0.45)',
        e3: '0 2px 6px rgba(0,0,0,0.45), 0 16px 40px -10px rgba(0,0,0,0.65)',
        lift: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        'lift-strong': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },

      transitionTimingFunction: {
        // No overshoot anywhere. Decelerating curves only — motion arrives and
        // stops, it never settles.
        snap: 'cubic-bezier(0.32, 0.72, 0, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },

      transitionDuration: {
        70: '70ms',
        90: '90ms',
        130: '130ms',
        180: '180ms',
      },

      animation: {
        'fade-in': 'fadeIn 130ms cubic-bezier(0.32, 0.72, 0, 1) both',
        rise: 'rise 190ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'rise-sm': 'riseSm 160ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'slide-down': 'slideDown 160ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'slide-up': 'slideUp 200ms cubic-bezier(0.32, 0.72, 0, 1) both',
        sweep: 'sweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'draw-in': 'drawIn 520ms cubic-bezier(0.32, 0.72, 0, 1) both',
      },

      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        riseSm: {
          from: { opacity: '0', transform: 'translateY(3px)' },
          to: { opacity: '1', transform: 'none' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Skeletons sweep rather than pulse: a pulse blinks the whole block,
        // a sweep reads as loading in one direction.
        sweep: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        // The reveal ends on `none`, not on inset(0): a clip-path that stays
        // applied leaves a permanent clipping context on the container, and
        // Recharts renders its tooltip inside that container. `none` is not
        // interpolable, so it snaps at the last frame — invisible, and the
        // tooltip is never truncated at the panel edge.
        drawIn: {
          from: { 'clip-path': 'inset(0 100% 0 0)' },
          '99%': { 'clip-path': 'inset(0 0 0 0)' },
          to: { 'clip-path': 'none' },
        },
      },
    },
  },
  plugins: [],
}
