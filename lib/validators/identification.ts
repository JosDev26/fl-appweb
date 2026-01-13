/**
 * Identification Validator
 * Shared validation and sanitization logic for identification numbers (cédulas)
 */

export interface IdentificationValidationResult {
  isValid: boolean
  sanitized: string
  error?: string
}

/**
 * Valid characters for identification: alphanumeric and hyphens only
 * This covers Costa Rican cédulas (digits) and foreign IDs (may have letters)
 */
const VALID_IDENTIFICATION_PATTERN = /^[A-Za-z0-9-]+$/

/**
 * Validates and sanitizes an identification number:
 * - Trims whitespace
 * - Checks for valid characters (alphanumeric and hyphens)
 * - Ensures minimum length
 * - Returns sanitized value
 */
export function validateIdentification(identificacion: unknown): IdentificationValidationResult {
  // Check if provided and is string
  if (!identificacion || typeof identificacion !== 'string') {
    return {
      isValid: false,
      sanitized: '',
      error: 'La identificación es requerida'
    }
  }
  
  // Trim whitespace and normalize
  const trimmed = identificacion.trim()
  
  // Check minimum length
  if (trimmed.length < 5) {
    return {
      isValid: false,
      sanitized: '',
      error: 'La identificación debe tener al menos 5 caracteres'
    }
  }
  
  // Check maximum length (prevent abuse)
  if (trimmed.length > 30) {
    return {
      isValid: false,
      sanitized: '',
      error: 'La identificación no puede exceder 30 caracteres'
    }
  }
  
  // Check for valid characters only
  if (!VALID_IDENTIFICATION_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      sanitized: '',
      error: 'La identificación solo puede contener letras, números y guiones'
    }
  }
  
  return {
    isValid: true,
    sanitized: trimmed
  }
}

/**
 * Builds a safe internal email address from a validated identification
 * Only call this with a sanitized identification from validateIdentification()
 */
export function buildInternalEmail(sanitizedIdentification: string): string {
  return `${sanitizedIdentification}@clientes.interno`
}
