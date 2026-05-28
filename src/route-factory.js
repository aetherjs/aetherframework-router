// src/route-factory.js - Enhanced route factory with query parameter support
import { createPathCompiler } from './path-compiler.js';

// Shared path compiler instance for performance
const pathCompiler = createPathCompiler();

/**
 * Factory function to create a new Route instance
 * @param {string} method - HTTP method
 * @param {string} path - Route path pattern (may include query parameters)
 * @param {Function} handler - Route handler function
 * @param {Array<Function>} middleware - Route-specific middleware
 * @param {Object} options - Route options
 * @returns {Route} Configured route instance
 */
export function createRoute(method, path, handler, middleware = [], options = {}) {
  return new Route(method, path, handler, middleware, options);
}

/**
 * Individual route class with path matching capabilities
 * Now supports query parameter patterns
 */
class Route {
  constructor(method, path, handler, middleware = [], options = {}) {
    this.method = method.toUpperCase();
    this.path = path;
    this.handler = handler;
    this.middleware = Array.isArray(middleware) ? middleware : [middleware];
    this.options = {
      parseQuery: false,
      ...options
    };
    
    // Check if path contains query parameters
    const hasQuery = path.includes('?');
    
    // Compile path to regex for fast matching
    const compileOptions = {
      ...this.options,
      parseQuery: hasQuery
    };
    
    const compiled = pathCompiler.compile(path, compileOptions);
    this.regex = compiled.regex;
    this.keys = compiled.keys;
    this.hasQuery = compiled.hasQuery || false;
    this.queryPattern = compiled.queryPattern || null;
    
    // Store original path parts for query parameter matching
    if (hasQuery) {
      const [pathPart, queryPart] = path.split('?');
      this.pathPart = pathPart;
      this.queryPart = queryPart;
    } else {
      this.pathPart = path;
      this.queryPart = null;
    }
  }
  
  /**
   * Match this route against a request
   * Now supports query parameter matching
   * @param {string} method - HTTP method
   * @param {string} url - Request URL (may include query string)
   * @returns {Object|null} Match result or null
   */
  match(method, url) {
    // Check HTTP method
    if (this.method !== 'ALL' && this.method !== method.toUpperCase()) {
      return null;
    }
    
    // Split URL into path and query parts
    const [path, queryString] = url.split('?');
    
    // Match path against compiled regex
    const pathMatch = this.regex.exec(path);
    if (!pathMatch) {
      return null;
    }
    
    // Extract path parameters
    const params = {};
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (key.type === 'path' && pathMatch[i + 1] !== undefined) {
        params[key.name] = decodeURIComponent(pathMatch[i + 1]);
      }
    }
    
    // Extract query parameters if route has query pattern
    if (this.hasQuery && queryString) {
      const queryParams = new URLSearchParams(queryString);
      
      // Parse query pattern to extract parameter names
      if (this.queryPattern) {
        const patternParams = new URLSearchParams(this.queryPattern);
        
        for (const [key, value] of patternParams) {
          if (value.startsWith(':')) {
            const paramName = value.slice(1).replace(/\?$/, '');
            const isOptional = value.endsWith('?');
            
            if (queryParams.has(key)) {
              params[paramName] = queryParams.get(key);
            } else if (!isOptional) {
              // Required query parameter missing
              return null;
            }
          } else {
            // Static query parameter value must match exactly
            if (!queryParams.has(key) || queryParams.get(key) !== value) {
              return null;
            }
          }
        }
      }
      
      // Add all query parameters to context (optional)
      if (this.options.includeAllQueryParams) {
        for (const [key, value] of queryParams) {
          if (!params[key]) { // Don't override path parameters
            params[key] = value;
          }
        }
      }
    }
    
    return {
      handler: this.handler,
      params,
      route: this,
      queryString: queryString || null
    };
  }
  
  /**
   * Check if this route matches a URL with query parameters
   * @param {string} method - HTTP method
   * @param {string} url - Full URL with query string
   * @returns {boolean} Whether the route matches
   */
  matches(method, url) {
    return this.match(method, url) !== null;
  }
  
  /**
   * Add middleware to this specific route
   * @param {...Function} middleware - Middleware functions
   * @returns {Route} Chainable route instance
   */
  use(...middleware) {
    this.middleware.push(...middleware);
    return this;
  }
  
  /**
   * Clone the route with new options
   * @param {Object} options - Options to override
   * @returns {Route} Cloned route instance
   */
  clone(options = {}) {
    return new Route(
      this.method,
      this.path,
      this.handler,
      [...this.middleware],
      { ...this.options, ...options }
    );
  }
  
  /**
   * Get route information for debugging
   * @returns {Object} Route metadata
   */
  toJSON() {
    return {
      method: this.method,
      path: this.path,
      hasQuery: this.hasQuery,
      queryPattern: this.queryPattern,
      middlewareCount: this.middleware.length,
      pattern: this.regex.toString(),
      keys: this.keys.map(key => ({
        name: key.name,
        type: key.type || 'path',
        optional: key.optional || false,
        pattern: key.pattern || '[^\\/]+'
      }))
    };
  }
  
  /**
   * Check if route has query parameters
   * @returns {boolean} Whether route has query parameters
   */
  hasQueryParams() {
    return this.hasQuery;
  }
  
  /**
   * Get query parameter names
   * @returns {Array<string>} Query parameter names
   */
  getQueryParamNames() {
    if (!this.hasQuery) return [];
    
    const params = [];
    this.keys.forEach(key => {
      if (key.type === 'query') {
        params.push(key.name);
      }
    });
    
    return params;
  }
  
  /**
   * Get path parameter names
   * @returns {Array<string>} Path parameter names
   */
  getPathParamNames() {
    const params = [];
    this.keys.forEach(key => {
      if (key.type === 'path') {
        params.push(key.name);
      }
    });
    
    return params;
  }
}

/**
 * Factory function to create a route from configuration object
 * @param {Object} config - Route configuration
 * @param {string} config.method - HTTP method
 * @param {string} config.path - Route path (may include query parameters)
 * @param {Function} config.handler - Route handler
 * @param {Array<Function>} config.middleware - Route middleware
 * @param {Object} config.options - Route options
 * @returns {Route} Created route instance
 */
export function createRouteFromConfig(config) {
  const { 
    method = 'GET', 
    path, 
    handler, 
    middleware = [], 
    options = {} 
  } = config;
  
  return createRoute(method, path, handler, middleware, options);
}

/**
 * Factory function to create multiple routes from array
 * @param {Array<Object>} configs - Array of route configurations
 * @returns {Array<Route>} Array of route instances
 */
export function createRoutesFromConfigs(configs) {
  return configs.map(config => createRouteFromConfig(config));
}

/**
 * Factory function to create RESTful resource routes with query parameter support
 * @param {string} basePath - Base path for resource
 * @param {Object} handlers - Resource handlers
 * @param {Array<Function>} middleware - Resource middleware
 * @param {Object} options - Route options
 * @returns {Array<Route>} Array of RESTful routes
 */
export function createResourceRoutes(basePath, handlers, middleware = [], options = {}) {
  const routes = [];
  
  if (handlers.index) {
    // GET /resource?page=:page&limit=:limit
    routes.push(createRoute('GET', `${basePath}?page=:page?&limit=:limit?`, handlers.index, middleware, options));
  }
  
  if (handlers.create) {
    routes.push(createRoute('POST', basePath, handlers.create, middleware, options));
  }
  
  if (handlers.show) {
    // GET /resource/:id?fields=:fields?
    routes.push(createRoute('GET', `${basePath}/:id?fields=:fields?`, handlers.show, middleware, options));
  }
  
  if (handlers.update) {
    routes.push(createRoute('PUT', `${basePath}/:id`, handlers.update, middleware, options));
    routes.push(createRoute('PATCH', `${basePath}/:id`, handlers.update, middleware, options));
  }
  
  if (handlers.destroy) {
    routes.push(createRoute('DELETE', `${basePath}/:id`, handlers.destroy, middleware, options));
  }
  
  return routes;
}

/**
 * Factory function to create route group with query parameter support
 * @param {string} prefix - Route prefix
 * @param {Array<Route>} routes - Routes to group
 * @param {Object} options - Group options
 * @returns {Array<Route>} Prefixed routes
 */
export function createRouteGroup(prefix, routes, options = {}) {
  return routes.map(route => {
    const prefixedPath = prefix + (route.pathPart.startsWith('/') ? route.pathPart : '/' + route.pathPart);
    const fullPath = route.queryPart ? `${prefixedPath}?${route.queryPart}` : prefixedPath;
    
    return createRoute(
      route.method,
      fullPath,
      route.handler,
      [...route.middleware],
      { ...route.options, ...options }
    );
  });
}

// Export class for type checking
export { Route };
