// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Add global type declarations
/// <reference types="cypress" />

// This ensures cy is available globally in all Cypress tests
declare global {
  namespace Cypress {
    interface Chainable {
      // Add custom commands here if needed
    }
  }
} 