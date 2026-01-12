/**
 * Development-only logger utility
 * Prevents sensitive data from being logged in production
 */

const isDev = process.env.NODE_ENV === 'development'

export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args)
  }
}

export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    console.warn(...args)
  }
}

export const devInfo = (...args: unknown[]): void => {
  if (isDev) {
    console.info(...args)
  }
}

export default { devLog, devWarn, devInfo }
