// src/aether-adapter.js - Adapter for AetherJS middleware system
import { createRouter } from './router-factory.js';

/**
 * Create AetherJS-compatible router middleware
 * @param {Router} router - Router instance
 * @returns {Function} AetherJS middleware function
 */
export function createAetherRouter(router) {
  return async function aetherRouterMiddleware(ctx, signal) {
    // Adapter: Convert AetherJS signal to traditional next function
    const next = signal && typeof signal.next === 'function' 
      ? () => signal.next()
      : (signal && typeof signal === 'function') 
        ? signal 
        : () => {};
    
    // Find matching route
    const match = router.match(ctx.method, ctx.url);
    
    if (!match) {
      // No route matched, continue to next middleware
      return await next();
    }
    
    // Set route parameters on context
    ctx.params = match.params;
    
    // Combine router middleware with route-specific middleware
    const middlewareChain = [...router.middleware, ...match.route.middleware];
    
    // Execute middleware chain
    let index = -1;
    
    async function dispatch(i) {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      
      index = i;
      let fn = middlewareChain[i];
      
      if (i === middlewareChain.length) {
        fn = match.route.handler;
      }
      
      if (!fn) return Promise.resolve();
      
      try {
        // Adapter: Pass AetherJS context and next function
        return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    
    await dispatch(0);
  };
}

/**
 * Factory function for creating AetherJS router with convenience methods
 * @param {Object} options - Router options
 * @returns {Object} Router factory object
 */
export function createAetherRouteFactory(options = {}) {
  const router = createRouter(options);
  
  return {
    router,
    
    // HTTP method shortcuts
    get: (path, handler, ...middleware) => router.get(path, handler, ...middleware),
    post: (path, handler, ...middleware) => router.post(path, handler, ...middleware),
    put: (path, handler, ...middleware) => router.put(path, handler, ...middleware),
    delete: (path, handler, ...middleware) => router.delete(path, handler, ...middleware),
    patch: (path, handler, ...middleware) => router.patch(path, handler, ...middleware),
    options: (path, handler, ...middleware) => router.options(path, handler, ...middleware),
    head: (path, handler, ...middleware) => router.head(path, handler, ...middleware),
    all: (path, handler, ...middleware) => router.all(path, handler, ...middleware),
    
    // Grouping and middleware
    group: (prefix, callback) => router.group(prefix, callback),
    use: (...args) => router.use(...args),
    
    // Generate AetherJS middleware
    middleware: () => createAetherRouter(router),
    
    // Utility methods
    match: (method, path) => router.match(method, path),
    getRoutes: () => router.getRoutes(),
    getStats: () => router.getStats(),
    clearCache: () => router.clearCache()
  };
}

// Default export for common use case
export default createAetherRouteFactory;
