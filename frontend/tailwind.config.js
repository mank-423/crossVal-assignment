/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Your existing brand colors
      colors: {
        // One accent, used for primary actions and focus rings only, so "this is the thing to
        // click" never competes with the status colours in the table.
        brand: {
          50: '#eef4ff',
          100: '#dae4ff',
          200: '#bccfff',
          500: '#3b62f6',
          600: '#2a49dc',
          700: '#2139b0',
        },
        // tailwind.config.js
        colors: {
          ink: '#10192B',
          paper: '#F6F2E8',
          line: '#DCD3BE',
          muted: '#5B5647',
          brass: '#B8863B',
          'brass-light': '#D9B778',
          'brass-50': '#F7EFDF',
          'brass-700': '#8A631F', // darker text-on-tint variant, for badge contrast
          forest: '#2F6B4F',
          'forest-50': '#EAF3EE',
          'red-ink': '#B04632',
          'red-ink-50': '#F7E9E5',
        },
        // shadcn/ui color system (merged with your brand colors)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // Your existing font configuration
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Amounts are tabular so digits line up column-wise and totals are scannable.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // shadcn/ui border radius
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // shadcn/ui animations
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
}