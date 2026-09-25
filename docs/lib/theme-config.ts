/**
 * Unmint Theme Configuration
 *
 * Customize your documentation's look and feel by modifying this file.
 * All colors, branding, and styling can be adjusted here.
 */

export const siteConfig = {
  name: 'simfleet',
  description:
    'One control plane for parallel React Native work on macOS: slimmed iOS simulators and Android emulators, a live dashboard, leased Metro ports, a shared native build cache, and per-agent device attribution.',
  url: 'https://entropyconquers.github.io/simfleet',

  logo: {
    src: '/logo.svg',
    alt: 'simfleet',
    width: 28,
    height: 28,
  },

  links: {
    github: 'https://github.com/entropyconquers/simfleet',
    npm: 'https://www.npmjs.com/package/simfleet',
  },

  footer: {
    companyName: 'Vishesh Raheja · MIT License',
    links: [
      { label: 'GitHub', href: 'https://github.com/entropyconquers/simfleet' },
      { label: 'Changelog', href: 'https://github.com/entropyconquers/simfleet/blob/main/CHANGELOG.md' },
      { label: 'Issues', href: 'https://github.com/entropyconquers/simfleet/issues' },
    ],
  },
}

export const themeConfig = {
  colors: {
    light: {
      accent: '#2f6f7e',
      accentForeground: '#ffffff',
      accentMuted: 'rgba(47, 111, 126, 0.1)',
    },
    dark: {
      accent: '#6cc3d3',
      accentForeground: '#0b1417',
      accentMuted: 'rgba(108, 195, 211, 0.12)',
    },
  },

  codeBlock: {
    light: {
      background: '#fafafa',
      titleBar: '#f4f4f5',
    },
    dark: {
      background: '#111416',
      titleBar: '#171b1e',
    },
  },
}

// Export CSS variable values for use in Tailwind
export function getCSSVariables(mode: 'light' | 'dark') {
  const colors = themeConfig.colors[mode]
  return {
    '--accent': colors.accent,
    '--accent-foreground': colors.accentForeground,
    '--accent-muted': colors.accentMuted,
  }
}

/**
 * Get the site URL dynamically
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > siteConfig.url
 * This allows OG images to work automatically on Vercel without configuration
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  // Use production URL if available (custom domain)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  // Fallback to deployment URL for preview deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return siteConfig.url
}
