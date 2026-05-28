// src/path-compiler.js - Enhanced path compiler with query parameter support
// Custom path parameter parser with query parameter support
class PathParser {
  constructor(options = {}) {
    this.options = {
      sensitive: false,
      strict: false,
      end: true,
      delimiter: '/',
      delimiters: './',
      parseQuery: false, // New option to enable query parameter parsing
      ...options
    };
  }

  /**
   * Parse path pattern, extract parameter names and regular expressions
   * Now supports query parameter patterns like /users?id=:id&lang=:lang
   * @param {string} path - Path pattern, e.g., '/users/:id' or '/users?id=:id'
   * @returns {Object} Contains regular expression and parameter keys array
   */
  parse(path) {
    // Separate path and query string
    const [pathPart, queryPart] = path.split('?');
    
    // Parse path portion
    const pathResult = this._parsePath(pathPart);
    
    // Parse query string portion if enabled
    if (this.options.parseQuery && queryPart) {
      const queryResult = this._parseQuery(queryPart);
      return {
        regex: pathResult.regex,
        keys: [...pathResult.keys, ...queryResult.keys],
        hasQuery: true,
        queryPattern: queryPart
      };
    }
    
    return {
      ...pathResult,
      hasQuery: false
    };
  }
  
  /**
   * Parse the path portion (original implementation)
   * @private
   */
  _parsePath(path) {
    const keys = [];
    let pattern = '';
    let inParam = false;
    let paramName = '';
    let optional = false;
    let patternPart = '';
    
    // Escape regex special characters
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    for (let i = 0; i < path.length; i++) {
      const char = path[i];
      
      if (char === ':' && !inParam) {
        // Start parameter matching
        inParam = true;
        paramName = '';
        patternPart = '';
        continue;
      }
      
      if (inParam) {
        if (char === '(') {
          // Start custom pattern
          let depth = 1;
          i++;
          while (i < path.length && depth > 0) {
            if (path[i] === '(') depth++;
            else if (path[i] === ')') depth--;
            if (depth > 0) patternPart += path[i];
            i++;
          }
          i--; // Step back one position
          continue;
        }
        
        if (char === '?' && i === path.length - 1) {
          // Optional parameter
          optional = true;
          continue;
        }
        
        if (char === this.options.delimiter || i === path.length - 1) {
          // Parameter ends
          if (i === path.length - 1) {
            paramName += char;
          }
          
          // Add parameter key
          keys.push({
            name: paramName,
            optional: optional,
            pattern: patternPart || '[^\\/]+',
            type: 'path' // Mark as path parameter
          });
          
          // Build regex part
          const patternStr = patternPart || '[^\\/]+';
          pattern += `(${patternStr})`;
          
          // Reset state
          inParam = false;
          paramName = '';
          optional = false;
          patternPart = '';
          
          if (i === path.length - 1 && char !== this.options.delimiter) {
            break;
          }
        } else {
          paramName += char;
        }
      } else {
        // Regular characters
        if (char === '*') {
          // Wildcard matching
          keys.push({
            name: 'wildcard',
            optional: false,
            pattern: '.*',
            type: 'path'
          });
          pattern += '(.*)';
        } else if (char === '?') {
          // Optional character
          pattern += '.?';
        } else if (char === '+') {
          // One or more characters
          pattern += '.+';
        } else if ('()[]{}|^$'.includes(char)) {
          // Regex special characters, need escaping
          pattern += '\\' + char;
        } else {
          pattern += escapeRegex(char);
        }
      }
    }
    
    // Handle the last parameter
    if (inParam && paramName) {
      keys.push({
        name: paramName,
        optional: optional,
        pattern: patternPart || '[^\\/]+',
        type: 'path'
      });
      pattern += `(${patternPart || '[^\\/]+'})`;
    }
    
    // Build complete regular expression
    let regexStr = pattern;
    if (!this.options.strict) {
      regexStr = regexStr.replace(/\\\//g, '[\\/]?');
    }
    
    if (this.options.end) {
      regexStr += '$';
    }
    
    const flags = this.options.sensitive ? '' : 'i';
    const regex = new RegExp('^' + regexStr, flags);
    
    return { regex, keys };
  }
  
  /**
   * Parse query string portion for query parameters
   * Supports patterns like ?id=:id&lang=:lang
   * @private
   */
  _parseQuery(queryString) {
    const keys = [];
    const params = new URLSearchParams(queryString);
    
    for (const [key, value] of params) {
      if (value.startsWith(':')) {
        // Query parameter with pattern
        const paramName = value.slice(1);
        const isOptional = paramName.endsWith('?');
        const cleanName = isOptional ? paramName.slice(0, -1) : paramName;
        
        keys.push({
          name: cleanName,
          optional: isOptional,
          pattern: '[^&]*', // Default pattern for query values
          type: 'query',
          queryKey: key
        });
      }
    }
    
    return { keys };
  }
  
  /**
   * Extract parameters from full URL including query string
   * @param {string} url - Full URL with query string
   * @param {Object} compiled - Compiled route information
   * @returns {Object} Extracted parameters
   */
  extractParams(url, compiled) {
    const [path, queryString] = url.split('?');
    const params = {};
    
    // Extract path parameters
    const pathMatch = compiled.regex.exec(path);
    if (pathMatch) {
      compiled.keys.forEach((key, index) => {
        if (key.type === 'path' && pathMatch[index + 1] !== undefined) {
          params[key.name] = decodeURIComponent(pathMatch[index + 1]);
        }
      });
    }
    
    // Extract query parameters
    if (queryString && compiled.hasQuery) {
      const queryParams = new URLSearchParams(queryString);
      compiled.keys.forEach(key => {
        if (key.type === 'query' && queryParams.has(key.queryKey)) {
          params[key.name] = queryParams.get(key.queryKey);
        }
      });
    }
    
    return params;
  }
}

/**
 * Factory function to create path compiler (with caching)
 * @param {Object} options - Compiler options
 * @returns {Object} Path compiler instance
 */
export function createPathCompiler(options = {}) {
  const cache = new Map();
  const parser = new PathParser(options);
  
  let hits = 0;
  let misses = 0;
  
  return {
    /**
     * Compile path pattern to regular expression
     * Now supports query parameter patterns
     * @param {string} path - Path pattern, e.g., '/users?id=:id&lang=:lang'
     * @param {Object} options - Compilation options
     * @returns {Object} Compiled regex and keys
     */
    compile(path, options = {}) {
      const cacheKey = `${path}:${JSON.stringify(options)}`;
      
      // Return cached result if available
      if (cache.has(cacheKey)) {
        hits++;
        return cache.get(cacheKey);
      }
      
      misses++;
      
      // Merge options
      const mergedOptions = { ...parser.options, ...options };
      const tempParser = new PathParser(mergedOptions);
      const result = tempParser.parse(path);
      
      // Cache result
      cache.set(cacheKey, result);
      
      return result;
    },
    
    /**
     * Extract parameters from URL with query string support
     * @param {string} url - Full URL
     * @param {string} pattern - Path pattern
     * @param {Object} options - Compilation options
     * @returns {Object|null} Parameter object or null
     */
    extractParams(url, pattern, options = {}) {
      const compiled = this.compile(pattern, options);
      const parser = new PathParser({ ...this.options, ...options });
      return parser.extractParams(url, compiled);
    },
    
    /**
     * Clear compilation cache
     */
    clearCache() {
      cache.clear();
      hits = 0;
      misses = 0;
    },
    
    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
      return {
        size: cache.size,
        hits,
        misses,
        hitRate: hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0
      };
    },
    
    /**
     * Precompile common path patterns
     * @param {Array} patterns - Array of path patterns
     */
    precompile(patterns) {
      patterns.forEach(pattern => {
        this.compile(pattern);
      });
    }
  };
}

/**
 * Common path pattern regex generators
 */
export const pathPatterns = {
  // Numeric ID
  id: '\\d+',
  
  // Alphanumeric ID
  slug: '[a-zA-Z0-9_-]+',
  
  // UUID
  uuid: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  
  // Filename
  filename: '[^\\/]+',
  
  // File extension
  extension: '\\.[a-zA-Z0-9]+',
  
  // Year-month-day
  date: '\\d{4}-\\d{2}-\\d{2}',
  
  // Version number
  version: '\\d+(\\.\\d+)*',
  
  // Query parameter patterns
  query: {
    id: '\\d+',
    slug: '[a-zA-Z0-9_-]+',
    uuid: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    page: '\\d+',
    limit: '\\d+',
    sort: '[a-zA-Z_]+',
    order: '(asc|desc)'
  }
};

/**
 * Quick compilation function (using default compiler)
 */
const defaultCompiler = createPathCompiler();

export function compilePath(path, options = {}) {
  return defaultCompiler.compile(path, options);
}

/**
 * Path compiler class (for type checking)
 */
export class PathCompiler {
  constructor(options = {}) {
    this._impl = createPathCompiler(options);
  }
  
  compile(path, options = {}) {
    return this._impl.compile(path, options);
  }
  
  extractParams(url, pattern, options = {}) {
    return this._impl.extractParams(url, pattern, options);
  }
  
  clearCache() {
    return this._impl.clearCache();
  }
  
  getCacheStats() {
    return this._impl.getCacheStats();
  }
  
  precompile(patterns) {
    return this._impl.precompile(patterns);
  }
}

/**
 * Utility functions with query parameter support
 */
export const pathUtils = {
  /**
   * Check if path matches pattern (including query parameters)
   * @param {string} url - Full URL to check
   * @param {string} pattern - Path pattern (may include query parameters)
   * @param {Object} options - Compilation options
   * @returns {boolean} Whether it matches
   */
  match(url, pattern, options = {}) {
    const [path, queryString] = url.split('?');
    const { regex } = compilePath(pattern, options);
    
    // Check if pattern has query parameters
    if (pattern.includes('?')) {
      const [pathPattern] = pattern.split('?');
      const pathRegex = compilePath(pathPattern, options).regex;
      
      // Match path first
      if (!pathRegex.test(path)) {
        return false;
      }
      
      // If pattern has query parameters, check if they match
      if (queryString) {
        const queryParams = new URLSearchParams(queryString);
        const patternParams = new URLSearchParams(pattern.split('?')[1]);
        
        for (const [key, value] of patternParams) {
          if (value.startsWith(':')) {
            // This is a query parameter pattern, skip validation
            continue;
          }
          
          // Static query parameter value must match
          if (!queryParams.has(key) || queryParams.get(key) !== value) {
            return false;
          }
        }
      }
      
      return true;
    }
    
    // Simple path matching
    return regex.test(path);
  },
  
  /**
   * Extract parameters from URL (including query parameters)
   * @param {string} url - Full URL to parse
   * @param {string} pattern - Path pattern (may include query parameters)
   * @param {Object} options - Compilation options
   * @returns {Object|null} Parameter object or null
   */
  extractParams(url, pattern, options = {}) {
    const compiler = createPathCompiler({ ...options, parseQuery: true });
    return compiler.extractParams(url, pattern);
  },
  
  /**
   * Build URL with query parameters
   * @param {string} pattern - Path pattern
   * @param {Object} params - Parameter object (including query params)
   * @returns {string} Built URL
   */
  buildUrl(pattern, params = {}) {
    let [pathPart, queryPart] = pattern.split('?');
    
    // Replace path parameters
    pathPart = pathPart.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)($[^)]+$)?(\?)?/g, (match, paramName) => {
      return params[paramName] !== undefined ? params[paramName] : match;
    });
    
    // Replace wildcards in path
    pathPart = pathPart.replace(/\*/g, () => {
      return params['wildcard'] !== undefined ? params['wildcard'] : '*';
    });
    
    // Build query string if pattern has query parameters
    let queryString = '';
    if (queryPart) {
      const queryParams = new URLSearchParams(queryPart);
      const resultParams = new URLSearchParams();
      
      for (const [key, value] of queryParams) {
        if (value.startsWith(':')) {
          const paramName = value.slice(1).replace(/\?$/, '');
          if (params[paramName] !== undefined) {
            resultParams.set(key, params[paramName]);
          } else if (!value.endsWith('?')) {
            // Required query parameter missing
            throw new Error(`Missing required query parameter: ${paramName}`);
          }
        } else {
          resultParams.set(key, value);
        }
      }
      
      queryString = resultParams.toString();
    }
    
    // Add additional query parameters not in pattern
    const additionalParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      // Skip path parameters and wildcard
      if (!pathPart.includes(`:${key}`) && key !== 'wildcard') {
        // Check if this is a query parameter from pattern
        const isPatternParam = queryPart && queryPart.includes(`:${key}`);
        if (!isPatternParam) {
          additionalParams.set(key, params[key]);
        }
      }
    });
    
    const additionalQuery = additionalParams.toString();
    
    // Combine all query parameters
    let finalQuery = '';
    if (queryString && additionalQuery) {
      finalQuery = `?${queryString}&${additionalQuery}`;
    } else if (queryString) {
      finalQuery = `?${queryString}`;
    } else if (additionalQuery) {
      finalQuery = `?${additionalQuery}`;
    }
    
    return pathPart + finalQuery;
  },
  
  /**
   * Validate parameters (including query parameters)
   * @param {Object} params - Parameter object
   * @param {Object} validators - Validator object
   * @returns {Object} Validation result
   */
  validateParams(params, validators) {
    const errors = [];
    const validated = {};
    
    Object.keys(validators).forEach(key => {
      const value = params[key];
      const validator = validators[key];
      
      if (validator.required && (value === undefined || value === null || value === '')) {
        errors.push(`Parameter "${key}" is required`);
        return;
      }
      
      if (value !== undefined && value !== null) {
        // Type validation
        if (validator.type) {
          const type = typeof value;
          if (validator.type === 'number' && isNaN(Number(value))) {
            errors.push(`Parameter "${key}" must be a number`);
          } else if (validator.type === 'integer' && !Number.isInteger(Number(value))) {
            errors.push(`Parameter "${key}" must be an integer`);
          } else if (validator.type === 'string' && typeof value !== 'string') {
            errors.push(`Parameter "${key}" must be a string`);
          } else if (validator.type === 'boolean' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`Parameter "${key}" must be a boolean`);
          }
        }
        
        // Pattern validation
        if (validator.pattern && !new RegExp(validator.pattern).test(value)) {
          errors.push(`Parameter "${key}" has invalid format`);
        }
        
        // Enum validation
        if (validator.enum && !validator.enum.includes(value)) {
          errors.push(`Parameter "${key}" must be one of: ${validator.enum.join(', ')}`);
        }
        
        // Range validation
        if (validator.min !== undefined && Number(value) < validator.min) {
          errors.push(`Parameter "${key}" cannot be less than ${validator.min}`);
        }
        if (validator.max !== undefined && Number(value) > validator.max) {
          errors.push(`Parameter "${key}" cannot be greater than ${validator.max}`);
        }
        
        // Length validation
        if (validator.minLength !== undefined && value.length < validator.minLength) {
          errors.push(`Parameter "${key}" length cannot be less than ${validator.minLength}`);
        }
        if (validator.maxLength !== undefined && value.length > validator.maxLength) {
          errors.push(`Parameter "${key}" length cannot be greater than ${validator.maxLength}`);
        }
        
        validated[key] = value;
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      validated
    };
  }
};

/**
 * Example usage with query parameter support
 */
export const examples = {
  basic: () => {
    const compiler = createPathCompiler({ parseQuery: true });
    
    // Compile path pattern with query parameters
    const result = compiler.compile('/users?id=:id&lang=:lang');
    console.log('Compilation result:', result);
    
    // Test matching with query parameters
    const match = pathUtils.match('/users?id=123&lang=en', '/users?id=:id&lang=:lang');
    console.log('Match /users?id=123&lang=en:', match);
    
    // Extract parameters
    const params = pathUtils.extractParams('/users?id=123&lang=en', '/users?id=:id&lang=:lang');
    console.log('Extracted parameters:', params);
  },
  
  advanced: () => {
    const compiler = createPathCompiler({ parseQuery: true });
    
    // Complex patterns with query parameters
    const patterns = [
      '/users/:id',                    // Path parameter only
      '/users?id=:id',                 // Query parameter only
      '/users/:id?page=:page&limit=:limit', // Mixed path and query params
      '/search?q=:query&page=:page?', // Optional query parameter
      '/api/:version/users?sort=:sort&order=:order' // Versioned API with query params
    ];
    
    patterns.forEach(pattern => {
      const { regex, keys } = compiler.compile(pattern);
      console.log(`Pattern: ${pattern}`);
      console.log(`Regex: ${regex}`);
      console.log(`Parameters: ${keys.map(k => `${k.name} (${k.type})`).join(', ')}`);
      console.log('---');
    });
  },
  
  buildUrlExample: () => {
    // Build URL with parameters
    const url = pathUtils.buildUrl('/users/:id?page=:page&lang=:lang', {
      id: '123',
      page: '2',
      lang: 'en',
      extra: 'value' // Additional query parameter
    });
    
    console.log('Built URL:', url);
    // Output: /users/123?page=2&lang=en&extra=value
  }
};
