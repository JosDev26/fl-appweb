import type { NextConfig } from "next";

// Build CSP based on environment
const getContentSecurityPolicy = () => {
  const isDev = process.env.NODE_ENV === 'development'
  
  // Base directives - unsafe-eval only in development (required by Next.js dev server)
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])], // unsafe-eval only in dev
    'style-src': ["'self'", "'unsafe-inline'"], // inline styles for components
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.supabase.co',
      'https://*.upstash.io',
      ...(isDev ? ['http://localhost:*', 'ws://localhost:*'] : [])
    ],
    'frame-ancestors': ["'none'"], // Clickjacking protection
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"], // No plugins
    'upgrade-insecure-requests': [] // Force HTTPS
  }

  // Remove upgrade-insecure-requests in dev
  if (isDev) {
    delete (directives as Record<string, string[]>)['upgrade-insecure-requests']
  }

  return Object.entries(directives)
    .map(([key, values]) => values.length ? `${key} ${values.join(' ')}` : key)
    .join('; ')
}

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  
  // Security Headers - OWASP Recommendations
  async headers() {
    const csp = getContentSecurityPolicy()
    
    return [
      {
        source: '/:path*',
        headers: [
          // DNS Prefetch Control
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          // HSTS - Force HTTPS for 2 years
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Clickjacking protection
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // XSS Protection (legacy browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // Referrer Policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // Permissions Policy - Disable unnecessary browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: csp
          },
          // Prevent browsers from caching sensitive pages
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          }
        ],
      },
      // Allow caching for static assets
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  },
};

export default nextConfig;
