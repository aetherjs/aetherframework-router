// src/router-factory.js - Enhanced router factory with query parameter support
import { createRoute } from "./route-factory.js";
import { createPathCompiler } from "./path-compiler.js";

/**
 * Factory function to create a new Router instance with enhanced features
 * @param {Object} options - Configuration options for the router
 * @param {string} options.prefix - URL prefix for all routes
 * @param {boolean} options.caseSensitive - Whether path matching is case sensitive
 * @param {boolean} options.strict - Whether trailing slashes are strict
 * @param {number} options.cacheSize - Size of route matching cache
 * @param {boolean} options.parseQuery - Enable query parameter parsing in route patterns
 * @param {boolean} options.autoParseQuery - Automatically parse query parameters into ctx.query
 * @param {boolean} options.enableVersioning - Enable versioning support
 * @returns {Router} Configured router instance
 */
export function createRouter(options = {}) {
  return new Router(options);
}

/**
 * High-performance Router class with factory pattern support
 * Enhanced with query parameter support, versioning, and advanced grouping
 */
class Router {
  constructor(options = {}) {
    // Default configuration with performance optimizations
    this.options = {
      prefix: "",
      caseSensitive: true,
      strict: true,
      cacheSize: 1000, // Cache 1000 most recent matches
      parseQuery: false, // Enable query parameter pattern matching
      autoParseQuery: true, // Automatically parse query params
      enableVersioning: false, // Enable versioning support
      ...options,
    };

    // Route storage by HTTP method for O(1) lookup
    this._routesByMethod = {
      GET: [],
      POST: [],
      PUT: [],
      DELETE: [],
      PATCH: [],
      OPTIONS: [],
      HEAD: [],
      ALL: [], // Catch-all method
    };

    // Router-level middleware stack
    this.middleware = [];

    // LRU cache for route matching (performance optimization)
    this._routeCache = new Map();
    this._cacheSize = this.options.cacheSize;

    // Performance metrics
    this._cacheHits = 0;
    this._cacheMisses = 0;

    // Path compiler instance for regex pattern compilation
    this._pathCompiler = createPathCompiler({
      sensitive: this.options.caseSensitive,
      strict: this.options.strict,
      end: true,
      parseQuery: this.options.parseQuery,
    });

    // Version registry for versioned routes
    this._versions = new Map();

    // Query parameter parser cache
    this._queryParserCache = new Map();
  }

  /**
   * Factory method to add a route with middleware support
   * Enhanced to support query parameter patterns like /users?id=:id&lang=:lang
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - Route path pattern (may include query parameters)
   * @param {Function} handler - Route handler function
   * @param {Array<Function>} middleware - Route-specific middleware
   * @param {Object} routeOptions - Route-specific options
   * @returns {Router} Chainable router instance
   */
  addRoute(method, path, handler, middleware = [], routeOptions = {}) {
    const fullPath = this.options.prefix + path;
    const options = {
      parseQuery: this.options.parseQuery,
      ...routeOptions,
    };

    const route = createRoute(method, fullPath, handler, middleware, options);

    const methodKey = method.toUpperCase();
    if (this._routesByMethod[methodKey]) {
      this._routesByMethod[methodKey].push(route);
    }

    // Clear cache when routes change
    this._routeCache.clear();

    // Emit route added event if event system is enabled
    if (this._events) {
      this._emit("route:added", { method, path: fullPath, route });
    }

    return this;
  }

  // HTTP method shortcut factories with enhanced query parameter support
  get(path, handler, ...middleware) {
    // Check if last argument is route options
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("GET", path, handler, middleware, routeOptions);
  }

  post(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("POST", path, handler, middleware, routeOptions);
  }

  put(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("PUT", path, handler, middleware, routeOptions);
  }

  delete(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("DELETE", path, handler, middleware, routeOptions);
  }

  patch(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("PATCH", path, handler, middleware, routeOptions);
  }

  options(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("OPTIONS", path, handler, middleware, routeOptions);
  }

  head(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("HEAD", path, handler, middleware, routeOptions);
  }

  all(path, handler, ...middleware) {
    const routeOptions =
      typeof middleware[middleware.length - 1] === "object"
        ? middleware.pop()
        : {};
    return this.addRoute("ALL", path, handler, middleware, routeOptions);
  }

  /**
   * Enhanced route grouping with shared prefix and middleware
   * Supports nested grouping and versioning
   * @param {string} prefix - Group path prefix
   * @param {Function} callback - Configuration callback
   * @param {Object} groupOptions - Group-specific options
   * @returns {Router} Chainable router instance
   */
  group(prefix, callback, groupOptions = {}) {
    const router = createRouter({
      ...this.options,
      prefix: this.options.prefix + prefix,
      ...groupOptions,
    });

    callback(router);

    // Merge routes from subgroup
    Object.keys(this._routesByMethod).forEach((method) => {
      this._routesByMethod[method].push(...router._routesByMethod[method]);
    });

    // Merge middleware from subgroup
    this.middleware.push(...router.middleware);

    // Emit group created event
    if (this._events) {
      this._emit("group:created", { prefix, router, options: groupOptions });
    }

    return this;
  }

  /**
   * Create versioned API routes
   * @param {string|Array} versions - Version string or array of versions
   * @param {Function} callback - Configuration callback
   * @param {Object} versionOptions - Version-specific options
   * @returns {Router} Chainable router instance
   */
  version(versions, callback, versionOptions = {}) {
    const versionList = Array.isArray(versions) ? versions : [versions];

    versionList.forEach((version) => {
      const versionPrefix = version.startsWith("v") ? version : `v${version}`;
      this.group(
        `/${versionPrefix}`,
        (versionRouter) => {
          // Store version metadata
          versionRouter._version = version;
          versionRouter._versionPrefix = versionPrefix;

          // Add version to context
          versionRouter.use((ctx, next) => {
            ctx.version = version;
            ctx.versionPrefix = versionPrefix;
            return next();
          });

          callback(versionRouter, version);
        },
        versionOptions,
      );
    });

    return this;
  }

  /**
   * Create RESTful resource routes with query parameter support
   * @param {string} resource - Resource name (plural)
   * @param {Object} handlers - Resource handlers
   * @param {Array} middleware - Resource middleware
   * @param {Object} options - Resource options
   * @returns {Router} Chainable router instance
   */
  resource(resource, handlers, middleware = [], options = {}) {
    const basePath = `/${resource}`;
    const idPath = `/${resource}/:id`;

    // Index route with query parameter support
    if (handlers.index) {
      this.get(basePath, handlers.index, ...middleware, {
        ...options,
        queryParams: ["page", "limit", "sort", "order"],
      });
    }

    // Create route
    if (handlers.create) {
      this.post(basePath, handlers.create, ...middleware, options);
    }

    // Show route with query parameter support
    if (handlers.show) {
      this.get(idPath, handlers.show, ...middleware, {
        ...options,
        queryParams: ["fields", "expand"],
      });
    }

    // Update routes
    if (handlers.update) {
      this.put(idPath, handlers.update, ...middleware, options);
      this.patch(idPath, handlers.update, ...middleware, options);
    }

    // Destroy route
    if (handlers.destroy) {
      this.delete(idPath, handlers.destroy, ...middleware, options);
    }

    return this;
  }

  /**
   * Factory method to add middleware or mount sub-routers
   * Enhanced to support query parameter middleware
   * @param {...Function|Router} args - Middleware functions or router instances
   * @returns {Router} Chainable router instance
   */
  use(...args) {
    if (args.length === 1) {
      const arg = args;

      if (typeof arg === "function") {
        // Add middleware function
        this.middleware.push(arg);
      } else if (arg instanceof Router) {
        // Mount sub-router
        this._mergeRouter(arg);
      }
    } else if (args.length === 2) {
      const [path, router] = args;

      if (typeof path === "string" && router instanceof Router) {
        // Mount sub-router with path prefix
        this._mergeRouter(router, path);
      }
    }

    return this;
  }

  /**
   * Add query parameter parsing middleware
   * Automatically parses query parameters into ctx.query
   * @returns {Router} Chainable router instance
   */
  useQueryParser() {
    this.middleware.push((ctx, next) => {
      if (ctx.url && ctx.url.includes("?")) {
        const [path, queryString] = ctx.url.split("?");
        ctx.path = path;
        ctx.query = this._parseQueryString(queryString);
        ctx.originalUrl = ctx.url;
      } else {
        ctx.query = {};
      }
      return next();
    });

    return this;
  }

  /**
   * Enhanced route matching with query parameter support
   * @param {string} method - HTTP method
   * @param {string} url - Request URL (may include query string)
   * @returns {Object|null} Match result or null
   */

  match(method, url) {
    // Separate path and query string for caching
    const [path, queryString] = url.split("?");
    const cacheKey = `${method}:${url}`;

    // 1. Check cache first (performance optimization)
    if (this._routeCache.has(cacheKey)) {
      this._cacheHits++;
      return this._routeCache.get(cacheKey);
    }

    this._cacheMisses++;

    // 2. Look for method-specific routes
    const methodRoutes = this._routesByMethod[method.toUpperCase()] || [];
    for (const route of methodRoutes) {
      const match = route.match(method, url);
      if (match) {
        // Parse query parameters if autoParseQuery is enabled
        if (this.options.autoParseQuery && queryString) {
          match.query = this._parseQueryString(queryString);
        }

        this._cacheResult(cacheKey, match);
        return match;
      }
    }

    // 3. Look for ALL method routes
    const allRoutes = this._routesByMethod.ALL || [];
    for (const route of allRoutes) {
      const match = route.match(method, url);
      if (match) {
        // Parse query parameters if autoParseQuery is enabled
        if (this.options.autoParseQuery && queryString) {
          match.query = this._parseQueryString(queryString);
        }

        this._cacheResult(cacheKey, match);
        return match;
      }
    }

    return null;
  }

  /**
   * Parse query string into object
   * @private
   */
  _parseQueryString(queryString) {
    // Check cache first
    if (this._queryParserCache.has(queryString)) {
      return this._queryParserCache.get(queryString);
    }

    const params = new URLSearchParams(queryString);
    const result = {};

    for (const [key, value] of params) {
      // Handle array parameters (e.g., ?tags=js&tags=node)
      if (key.endsWith("[]")) {
        const cleanKey = key.slice(0, -2);
        if (!result[cleanKey]) {
          result[cleanKey] = [];
        }
        result[cleanKey].push(value);
      } else {
        // Handle duplicate keys by using the last value
        result[key] = value;
      }
    }

    // Cache the result
    this._queryParserCache.set(queryString, result);

    // Limit cache size
    if (this._queryParserCache.size > 100) {
      const firstKey = this._queryParserCache.keys().next().value;
      this._queryParserCache.delete(firstKey);
    }

    return result;
  }

  /**
   * Internal method to merge another router into this one
   * Enhanced to preserve query parameter settings
   * @private
   */
  _mergeRouter(router, prefix = "") {
    Object.keys(router._routesByMethod).forEach((method) => {
      router._routesByMethod[method].forEach((route) => {
        // Clone route with updated path
        const clonedRoute = createRoute(
          route.method,
          this.options.prefix +
            prefix +
            route.path.replace(router.options.prefix, ""),
          route.handler,
          [...route.middleware],
          { ...route.options },
        );

        this._routesByMethod[method].push(clonedRoute);
      });
    });

    // Merge middleware from subgroup
    this.middleware.push(...router.middleware);

    // Merge version information if present
    if (router._version) {
      this._versions.set(router._version, {
        prefix: router._versionPrefix,
        router,
      });
    }
  }

  /**
   * Cache management with LRU eviction
   * Enhanced to handle query parameter caching
   * @private
   */
  _cacheResult(key, value) {
    if (this._routeCache.size >= this._cacheSize) {
      // LRU eviction - remove first entry
      const firstKey = this._routeCache.keys().next().value;
      this._routeCache.delete(firstKey);
    }
    this._routeCache.set(key, value);
  }

  /**
   * Factory method to create AetherJS-compatible middleware
   * Enhanced with query parameter support
   * @returns {Function} Middleware function for AetherJS pipeline
   */
  routes() {
    const router = this;

    return async function routerMiddleware(ctx, next) {
      const match = router.match(ctx.method, ctx.url);

      if (match) {
        // Set route parameters on context
        ctx.params = match.params || {};

        // Set query parameters if available
        if (match.query) {
          ctx.query = match.query;
        }

        // Set route reference
        ctx.route = match.route;

        // Combine router middleware with route-specific middleware
        const middlewareChain = [
          ...router.middleware,
          ...match.route.middleware,
        ];

        // Execute middleware chain
        let index = -1;

        async function dispatch(i) {
          if (i <= index) {
            throw new Error("next() called multiple times");
          }

          index = i;
          let fn = middlewareChain[i];

          if (i === middlewareChain.length) {
            fn = match.route.handler;
          }

          if (!fn) return Promise.resolve();

          try {
            return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
          } catch (err) {
            return Promise.reject(err);
          }
        }

        await dispatch(0);
      } else {
        // No route matched, continue to next middleware
        if (typeof next === "function") {
          await next();
        }
      }
    };
  }

  /**
   * Get all registered routes for debugging
   * Enhanced to show query parameter support
   * @returns {Array} Array of route information
   */
  getRoutes() {
    const routes = [];

    Object.keys(this._routesByMethod).forEach((method) => {
      this._routesByMethod[method].forEach((route) => {
        routes.push({
          method: route.method,
          path: route.path,
          hasQueryParams: route.hasQueryParams ? route.hasQueryParams() : false,
          queryParamNames: route.getQueryParamNames
            ? route.getQueryParamNames()
            : [],
          pathParamNames: route.getPathParamNames
            ? route.getPathParamNames()
            : [],
          middlewareCount: route.middleware.length,
        });
      });
    });

    return routes;
  }

  /**
   * Get routes by version
   * @param {string} version - Version identifier
   * @returns {Array} Array of route information for the version
   */
  getRoutesByVersion(version) {
    const versionPrefix = version.startsWith("v") ? version : `v${version}`;
    const prefix = `/${versionPrefix}`;

    return this.getRoutes().filter((route) => route.path.startsWith(prefix));
  }

  /**
   * Clear route matching cache
   * Also clears query parser cache
   */
  clearCache() {
    this._routeCache.clear();
    this._queryParserCache.clear();
    this._cacheHits = 0;
    this._cacheMisses = 0;
  }

  /**
   * Get router statistics
   * Enhanced with query parameter statistics
   * @returns {Object} Router statistics
   */
  getStats() {
    let totalRoutes = 0;
    let routesWithQueryParams = 0;

    Object.keys(this._routesByMethod).forEach((method) => {
      this._routesByMethod[method].forEach((route) => {
        totalRoutes++;
        if (route.hasQueryParams && route.hasQueryParams()) {
          routesWithQueryParams++;
        }
      });
    });

    return {
      totalRoutes,
      routesWithQueryParams,
      cacheSize: this._routeCache.size,
      cacheHits: this._cacheHits,
      cacheMisses: this._cacheMisses,
      cacheHitRate:
        this._cacheHits + this._cacheMisses > 0
          ? (this._cacheHits / (this._cacheHits + this._cacheMisses)) * 100
          : 0,
      queryParserCacheSize: this._queryParserCache.size,
      versions: Array.from(this._versions.keys()),
      methods: Object.keys(this._routesByMethod).reduce((acc, method) => {
        acc[method] = this._routesByMethod[method].length;
        return acc;
      }, {}),
    };
  }

  /**
   * Enable event system for router events
   * @returns {Router} Chainable router instance
   */
  enableEvents() {
    this._events = new Map();
    return this;
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   * @returns {Router} Chainable router instance
   */
  on(event, listener) {
    if (!this._events) {
      this._events = new Map();
    }

    if (!this._events.has(event)) {
      this._events.set(event, []);
    }

    this._events.get(event).push(listener);
    return this;
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   * @returns {Router} Chainable router instance
   */
  off(event, listener) {
    if (this._events && this._events.has(event)) {
      const listeners = this._events.get(event);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit event
   * @private
   */
  _emit(event, data) {
    if (this._events && this._events.has(event)) {
      const listeners = this._events.get(event);
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      });
    }
  }
}

/**
 * Factory function to create a router from route definitions
 * @param {Array} routes - Array of route definitions
 * @param {Object} options - Router options
 * @returns {Router} Configured router instance
 */
export function createRouterFromRoutes(routes, options = {}) {
  const router = createRouter(options);

  routes.forEach((route) => {
    const {
      method = "GET",
      path,
      handler,
      middleware = [],
      routeOptions = {},
    } = route;

    router.addRoute(method, path, handler, middleware, routeOptions);
  });

  return router;
}

/**
 * Factory function to create a RESTful resource router
 * @param {string} resource - Resource name
 * @param {Object} handlers - Resource handlers
 * @param {Array} middleware - Resource middleware
 * @param {Object} options - Router options
 * @returns {Router} RESTful resource router
 */
export function createResourceRouter(
  resource,
  handlers,
  middleware = [],
  options = {},
) {
  const router = createRouter({
    ...options,
    prefix: `/${resource}`,
  });

  // Add RESTful routes with query parameter support
  if (handlers.index) {
    router.get("/", handlers.index, ...middleware, {
      queryParams: ["page", "limit", "sort", "order", "filter"],
    });
  }

  if (handlers.create) {
    router.post("/", handlers.create, ...middleware);
  }

  if (handlers.show) {
    router.get("/:id", handlers.show, ...middleware, {
      queryParams: ["fields", "expand", "include"],
    });
  }

  if (handlers.update) {
    router.put("/:id", handlers.update, ...middleware);
    router.patch("/:id", handlers.update, ...middleware);
  }

  if (handlers.destroy) {
    router.delete("/:id", handlers.destroy, ...middleware);
  }

  // Add nested routes if provided
  if (handlers.nested) {
    Object.keys(handlers.nested).forEach((nestedResource) => {
      router.group(`/:id/${nestedResource}`, (nestedRouter) => {
        const nestedHandlers = handlers.nested[nestedResource];

        if (nestedHandlers.index) {
          nestedRouter.get("/", nestedHandlers.index, ...middleware);
        }

        if (nestedHandlers.create) {
          nestedRouter.post("/", nestedHandlers.create, ...middleware);
        }

        if (nestedHandlers.show) {
          nestedRouter.get("/:nestedId", nestedHandlers.show, ...middleware);
        }
      });
    });
  }

  return router;
}

/**
 * Factory function to create a versioned API router
 * @param {Object} versions - Version configuration
 * @param {Object} options - Router options
 * @returns {Router} Versioned API router
 */
export function createVersionedRouter(versions, options = {}) {
  const router = createRouter(options);

  Object.keys(versions).forEach((version) => {
    router.group(`/v${version}`, (versionRouter) => {
      const versionConfig = versions[version];

      // Add version-specific middleware
      if (versionConfig.middleware) {
        versionRouter.use(...versionConfig.middleware);
      }

      // Add version-specific routes
      if (versionConfig.routes) {
        versionConfig.routes.forEach((route) => {
          versionRouter.addRoute(
            route.method || "GET",
            route.path,
            route.handler,
            route.middleware || [],
            route.options || {},
          );
        });
      }

      // Add version-specific resources
      if (versionConfig.resources) {
        Object.keys(versionConfig.resources).forEach((resource) => {
          const resourceConfig = versionConfig.resources[resource];
          versionRouter.resource(
            resource,
            resourceConfig.handlers,
            resourceConfig.middleware || [],
          );
        });
      }
    });
  });

  return router;
}

// Export class for type checking
export { Router };
