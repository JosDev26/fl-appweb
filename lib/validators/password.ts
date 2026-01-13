/**
 * Password Validator
 * Shared validation logic for password requirements across all auth endpoints
 */

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Validates a password against security requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter  
 * - At least one digit
 * - At least one special character
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = []
  
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['La contraseña es requerida'] }
  }
  
  if (password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula')
  }
  
  if (!/\d/.test(password)) {
    errors.push('La contraseña debe contener al menos un número')
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('La contraseña debe contener al menos un carácter especial')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}
