/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    // Modal z-index layers — explicitly safelisted so purging doesn't remove them
    'z-50', 'z-[51]',
  ],
  theme: {
    extend: {
      // ─── Design Tokens: "Amber Obsidian Autumn" ────────────────────────────
      colors: {
        // Warm obsidian background system
        space: {
          950: '#1D1816',
          900: '#241D1A',
          800: '#332722',
          700: '#46352D',
          600: '#5A463C',
          500: '#7A7A78',
        },
        // Accent system — ember / umber / porcelain
        beat: {
          purple: '#691F0C',
          violet: '#DC3C0C',
          lilac:  '#D3C0B2',
          rose:   '#DC3C0C',
          pink:   '#A45A45',
          amber:  '#E1E1E1',
        },
        // Neutral surface system (uses CSS vars so rgba() works)
        surface: {
          DEFAULT: 'rgba(211,192,178,0.06)',
          hover:   'rgba(211,192,178,0.10)',
          border:  'rgba(211,192,178,0.10)',
          muted:   'rgba(211,192,178,0.04)',
        },
      },

      // ─── Typography ───────────────────────────────────────────────────
      fontFamily: {
        display: ['Syne', 'sans-serif'],  // Bold headings & wordmark
        body:    ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },

      // ─── Font size: Golden Ratio scale (φ = 1.618, base = 16px) ─────────
      // Each step = previous × φ   |   line-height tightens as size grows
      // φ-1 = 6px │ φ0 = 10px │ φ1 = 16px (body) │ φ2 = 26px (subheading)
      // φ3 = 42px (heading) │ φ4 = 68px (display) │ φ5 = 110px (hero)
      fontSize: {
        'phi-xs':   ['0.375rem',  { lineHeight: '1.7'  }],  //   6px  — captions / labels
        'phi-sm':   ['0.625rem',  { lineHeight: '1.65' }],  //  10px  — small UI text
        'phi-body': ['1rem',      { lineHeight: '1.618'}],  //  16px  — body (φ = perfect)
        'phi-sub':  ['1.625rem',  { lineHeight: '1.5'  }],  //  26px  — subheading
        'phi-h':    ['2.625rem',  { lineHeight: '1.3'  }],  //  42px  — heading
        'phi-d':    ['4.25rem',   { lineHeight: '1.15' }],  //  68px  — display
        'phi-hero': ['6.875rem',  { lineHeight: '1.05' }],  // 110px  — hero / splash
      },

      // ─── Spacing: Golden Ratio scale (φ = 1.618, base = 4px) ──────────
      // φ0 = 4px  → φ1 = 6px   → φ2 = 10px  → φ3 = 16px
      // φ4 = 26px → φ5 = 42px  → φ6 = 68px  → φ7 = 110px
      // φ8 = 178px → φ9 = 288px
      spacing: {
        // Golden-ratio tokens
        'φ0': '0.25rem',   //   4px
        'φ1': '0.375rem',  //   6px  (4 × 1.618)
        'φ2': '0.625rem',  //  10px  (6 × 1.618)
        'φ3': '1rem',      //  16px  (10 × 1.618)
        'φ4': '1.625rem',  //  26px  (16 × 1.618)
        'φ5': '2.625rem',  //  42px  (26 × 1.618)
        'φ6': '4.25rem',   //  68px  (42 × 1.618)
        'φ7': '6.875rem',  // 110px  (68 × 1.618)
        'φ8': '11.125rem', // 178px  (110 × 1.618)
        'φ9': '18rem',     // 288px  (178 × 1.618)
        // Keep legacy numeric aliases for compatibility
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
      },

      // ─── Border radius ───────────────────────────────────────────────
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },

      // ─── Backdrop blur ───────────────────────────────────────────────
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        DEFAULT: '12px',
        md: '16px',
        lg: '24px',
        xl: '40px',
      },

      // ─── Box shadows — narrative depth ───────────────────────────────
      boxShadow: {
        glow: '0 0 24px rgba(var(--rgb-accent), 0.28)',
        'glow-sm': '0 0 12px rgba(var(--rgb-accent), 0.18)',
        'glow-rose': '0 0 24px rgba(var(--rgb-accent3), 0.28)',
        float: '0 20px 60px rgba(0,0,0,0.4)',
        card: '0 4px 24px rgba(0,0,0,0.3)',
      },

      // ─── Z-index: explicit modal layer contract ───────────────────────
      zIndex: {
        // Layers 0–20 live in AppLayout (ambient / main / nav)
        // 50–51 reserved for page-level overlays (sheets, dialogs)
        50: '50',
        51: '51',
      },

      // ─── Animations ───────────────────────────────────────────────────
      keyframes: {
        'float-y': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'drift-right': {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 12px rgba(var(--rgb-accent), 0.22)' },
          '50%': { boxShadow: '0 0 28px rgba(var(--rgb-accent), 0.46)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'float-y': 'float-y 4s ease-in-out infinite',
        'drift-right': 'drift-right 28s linear infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}
