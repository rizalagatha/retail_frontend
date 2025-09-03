// src/plugins/vuetify.ts
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// Custom theme configuration
const customTheme = {
  dark: false,
  colors: {
    primary: '#1976D2',
    secondary: '#424242',
    accent: '#82B1FF',
    error: '#FF5252',
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FFC107',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    'surface-variant': '#F5F5F5',
    'on-primary': '#FFFFFF',
    'on-secondary': '#FFFFFF',
    'on-surface': '#1A1A1A',
    'on-surface-variant': '#5F5F5F',
    'on-background': '#1A1A1A',
  }
}

// Typography configuration
const typography = {
  fontFamily: '"Inter", "Roboto", sans-serif',
  h1: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 700,
    fontSize: '2.5rem',
    lineHeight: 1.2,
    letterSpacing: '-0.02em'
  },
  h2: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 600,
    fontSize: '2rem',
    lineHeight: 1.25,
    letterSpacing: '-0.015em'
  },
  h3: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 600,
    fontSize: '1.75rem',
    lineHeight: 1.3,
    letterSpacing: '-0.01em'
  },
  h4: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 600,
    fontSize: '1.5rem',
    lineHeight: 1.35,
    letterSpacing: '-0.005em'
  },
  h5: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 600,
    fontSize: '1.25rem',
    lineHeight: 1.4,
    letterSpacing: '0em'
  },
  h6: {
    fontFamily: '"Poppins", sans-serif',
    fontWeight: 600,
    fontSize: '1.125rem',
    lineHeight: 1.4,
    letterSpacing: '0em'
  },
  subtitle1: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 600,
    fontSize: '1rem',
    lineHeight: 1.5,
    letterSpacing: '0.01em'
  },
  subtitle2: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 600,
    fontSize: '0.875rem',
    lineHeight: 1.4,
    letterSpacing: '0.01em'
  },
  body1: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 400,
    fontSize: '1rem',
    lineHeight: 1.6,
    letterSpacing: '0.005em'
  },
  body2: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 400,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    letterSpacing: '0.01em'
  },
  button: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 600,
    fontSize: '0.875rem',
    lineHeight: 1.4,
    letterSpacing: '0.02em',
    textTransform: 'none'
  },
  caption: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 500,
    fontSize: '0.75rem',
    lineHeight: 1.4,
    letterSpacing: '0.03em'
  },
  overline: {
    fontFamily: '"Inter", sans-serif',
    fontWeight: 600,
    fontSize: '0.625rem',
    lineHeight: 1.6,
    letterSpacing: '0.15em',
    textTransform: 'uppercase'
  }
}

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: customTheme,
    },
  },
  defaults: {
    // Global component defaults
    VBtn: {
      style: 'text-transform: none; font-weight: 600; letter-spacing: 0.01em;',
      rounded: 'lg'
    },
    VCard: {
      rounded: 'lg',
      elevation: 2
    },
    VTextField: {
      variant: 'outlined',
      rounded: 'lg',
      color: 'primary'
    },
    VSelect: {
      variant: 'outlined',
      rounded: 'lg',
      color: 'primary'
    },
    VTextarea: {
      variant: 'outlined',
      rounded: 'lg',
      color: 'primary'
    },
    VDataTable: {
      class: 'custom-data-table'
    },
    VChip: {
      rounded: 'lg'
    },
    VAlert: {
      rounded: 'lg'
    }
  },
  display: {
    mobileBreakpoint: 'sm',
    thresholds: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  }
})