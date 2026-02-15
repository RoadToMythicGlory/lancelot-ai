/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Status colors for department buttons
    'bg-red-500',
    'hover:bg-red-600',
    'border-red-600',
    'bg-yellow-500',
    'hover:bg-yellow-600',
    'border-yellow-600',
    'bg-green-500',
    'hover:bg-green-600',
    'border-green-600',
    'text-white',
    'border-2',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        channel1: {
          red: '#E60000',
          darkRed: '#B30000',
          black: '#000000',
          gray: {
            50: '#F9FAFB',
            100: '#F3F4F6',
            200: '#E5E7EB',
            300: '#D1D5DB',
            400: '#9CA3AF',
            500: '#6B7280',
            600: '#4B5563',
            700: '#374151',
            800: '#1F2937',
            900: '#111827',
          },
        },
        primary: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        // Enhanced colors for better dark mode contrast
        enhanced: {
          // Text colors optimized for contrast
          text: {
            light: {
              primary: '#111827',
              secondary: '#374151',
              muted: '#6B7280',
            },
            dark: {
              primary: '#F9FAFB',
              secondary: '#E5E7EB',
              muted: '#D1D5DB',
            }
          },
          // Background colors with proper contrast ratios
          background: {
            light: {
              primary: '#FFFFFF',
              secondary: '#F9FAFB',
              tertiary: '#F3F4F6',
              accent: '#F0F9FF',
            },
            dark: {
              primary: '#111827',
              secondary: '#1F2937',
              tertiary: '#374151',
              accent: '#1E3A8A',
            }
          },
          // Enhanced shift colors for better visibility in dark mode
          shift: {
            morning: {
              light: '#10B981',
              dark: '#34D399',
            },
            evening: {
              light: '#EC4899',
              dark: '#F472B6',
            },
            night: {
              light: '#8B5CF6',
              dark: '#A78BFA',
            }
          },
          // Department specific colors with dark mode variants
          department: {
            mcr: {
              morning: { light: '#52c41a', dark: '#10b981' },
              evening: { light: '#1890ff', dark: '#3b82f6' },
              night: { light: '#722ed1', dark: '#8b5cf6' },
            },
            ingest: {
              morning: { light: '#fa8c16', dark: '#f97316' },
              evening: { light: '#eb2f96', dark: '#ec4899' },
              night: { light: '#13c2c2', dark: '#06b6d4' },
            },
            playout: {
              morning: { light: '#faad14', dark: '#eab308' },
              evening: { light: '#f5222d', dark: '#ef4444' },
              night: { light: '#52c41a', dark: '#22c55e' },
            },
            news: {
              morning: { light: '#2f54eb', dark: '#3b82f6' },
              evening: { light: '#fa541c', dark: '#f97316' },
              night: { light: '#eb2f96', dark: '#ec4899' },
            },
            it: {
              morning: { light: '#73d13d', dark: '#22c55e' },
              evening: { light: '#40a9ff', dark: '#3b82f6' },
              night: { light: '#b37feb', dark: '#a78bfa' },
            }
          }
        },
        // Status colors with proper contrast
        status: {
          scheduled: { light: '#FAAD14', dark: '#EAB308' },
          confirmed: { light: '#52C41A', dark: '#22C55E' },
          inProgress: { light: '#1890FF', dark: '#3B82F6' },
          completed: { light: '#52C41A', dark: '#22C55E' },
          cancelled: { light: '#FF4D4F', dark: '#EF4444' },
        }
      },
      fontFamily: {
        sans: ['Inter', 'Heebo', 'system-ui', 'sans-serif'],
        hebrew: ['Heebo', 'Arial', 'sans-serif'],
        display: ['Inter', 'Heebo', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      screens: {
        'xs': '475px',
      },
      // Enhanced shadows for dark mode
      boxShadow: {
        'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.5)',
        'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
      },
      // Enhanced spacing for better accessibility
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        '144': '36rem',
        '160': '40rem',
      },
      // Professional border radius values
      borderRadius: {
        'none': '0',
        'sm': '0.125rem',
        'DEFAULT': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        'full': '9999px',
      },
      // Enhanced z-index scale
      zIndex: {
        '0': '0',
        '10': '10',
        '20': '20',
        '30': '30',
        '40': '40',
        '50': '50',
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
        'auto': 'auto',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('tailwindcss-rtl'),
    function({ addUtilities, addComponents, theme }) {
      const newUtilities = {
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
        },
        '.scrollbar-none': {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
        // Enhanced text contrast utilities
        '.text-high-contrast': {
          '@apply text-gray-900 dark:text-gray-100': {},
        },
        '.text-medium-contrast': {
          '@apply text-gray-700 dark:text-gray-300': {},
        },
        '.text-low-contrast': {
          '@apply text-gray-600 dark:text-gray-400': {},
        },
        // Enhanced background utilities
        '.bg-surface': {
          '@apply bg-white dark:bg-gray-800': {},
        },
        '.bg-surface-secondary': {
          '@apply bg-gray-50 dark:bg-gray-900': {},
        },
        '.bg-surface-tertiary': {
          '@apply bg-gray-100 dark:bg-gray-700': {},
        },
        // Enhanced border utilities
        '.border-subtle': {
          '@apply border-gray-200 dark:border-gray-700': {},
        },
        '.border-medium': {
          '@apply border-gray-300 dark:border-gray-600': {},
        },
        // Enhanced shadow utilities for dark mode
        '.shadow-enhanced': {
          '@apply shadow-lg dark:shadow-dark-lg': {},
        },
        '.shadow-enhanced-xl': {
          '@apply shadow-xl dark:shadow-dark-xl': {},
        },
      };

      const newComponents = {
        // Enhanced card component
        '.card-enhanced': {
          '@apply bg-white dark:bg-gray-800 rounded-xl shadow-enhanced border border-subtle p-6 transition-all duration-200': {},
          '&:hover': {
            '@apply shadow-enhanced-xl transform -translate-y-1': {},
          }
        },
        // Enhanced button components
        '.btn-enhanced': {
          '@apply px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2': {},
        },
        '.btn-primary-enhanced': {
          '@apply btn-enhanced bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-400': {},
        },
        '.btn-secondary-enhanced': {
          '@apply btn-enhanced bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 dark:focus:ring-gray-400': {},
        },
        // Enhanced input components
        '.input-enhanced': {
          '@apply w-full px-3 py-2 border border-subtle rounded-lg bg-white dark:bg-gray-800 text-high-contrast placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 transition-colors duration-200': {},
        },
        // Professional layout containers
        '.container-professional': {
          '@apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8': {},
        },
        '.section-professional': {
          '@apply py-12 lg:py-16': {},
        },
        // Professional grid layouts
        '.grid-professional': {
          '@apply grid gap-6 md:gap-8': {},
        },
        '.grid-2-professional': {
          '@apply grid-professional md:grid-cols-2': {},
        },
        '.grid-3-professional': {
          '@apply grid-professional md:grid-cols-2 lg:grid-cols-3': {},
        },
        '.grid-4-professional': {
          '@apply grid-professional md:grid-cols-2 lg:grid-cols-4': {},
        },
        // Professional text styles
        '.text-heading-professional': {
          '@apply text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white': {},
        },
        '.text-subheading-professional': {
          '@apply text-lg md:text-xl text-gray-700 dark:text-gray-300 font-medium': {},
        },
        '.text-body-professional': {
          '@apply text-base text-gray-600 dark:text-gray-400 leading-relaxed': {},
        },
        '.text-caption-professional': {
          '@apply text-sm text-gray-500 dark:text-gray-500': {},
        }
      };

      addUtilities(newUtilities);
      addComponents(newComponents);
    },
  ],
}; 