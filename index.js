// src/index.js - Main entry point for AetherJS Router module
import { createRouter } from './router-factory.js';
import { createRoute } from './route-factory.js';
import { createPathCompiler } from './path-compiler.js';
import { createAetherRouter } from './aether-adapter.js';

// Export factory functions for flexible usage
export {
  createRouter,
  createRoute,
  createPathCompiler,
  createAetherRouter
};

// Default export for common use case
export default createRouter;

// Export classes for advanced usage
export { Router } from './router-factory.js';
export { Route } from './route-factory.js';
export { PathCompiler } from './path-compiler.js';
