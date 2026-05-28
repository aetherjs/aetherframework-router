// examples/basic-router.js - Comprehensive example demonstrating all router features
import { createAetherRouteFactory } from '../aether-adapter.js';

// Create router factory with enhanced features enabled
const routerFactory = createAetherRouteFactory({
  prefix: '/api',
  cacheSize: 2000,
  parseQuery: true,          // Enable query parameter pattern matching
  autoParseQuery: true,      // Automatically parse query parameters
  enableVersioning: true     // Enable versioning support
});

// ============================================
// 1. BASIC ROUTE DEFINITIONS
// ============================================

// Add global middleware for logging
routerFactory.use(async (ctx, next) => {
  console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.url}`);
  const startTime = Date.now();
  await next();
  const duration = Date.now() - startTime;
  console.log(`Request completed in ${duration}ms`);
});

// Basic health check endpoint
routerFactory.get('/health', (ctx) => {
  ctx.setStatus(200);
  ctx.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// ============================================
// 2. QUERY PARAMETER SUPPORT EXAMPLES
// ============================================

// Enable automatic query parameter parsing
routerFactory.use((ctx, next) => {
  if (ctx.url && ctx.url.includes('?')) {
    const [path, queryString] = ctx.url.split('?');
    ctx.path = path;
    ctx.query = Object.fromEntries(new URLSearchParams(queryString));
    ctx.originalUrl = ctx.url;
  } else {
    ctx.query = {};
  }
  return next();
});

// Route with query parameters in pattern
routerFactory.get('/search?q=:query&page=:page?&limit=:limit?', (ctx) => {
  const { query, page = '1', limit = '10' } = ctx.params;
  
  ctx.setStatus(200);
  ctx.json({
    query,
    page: parseInt(page),
    limit: parseInt(limit),
    results: [
      { id: 1, title: `Result for: ${query}` },
      { id: 2, title: `Another result for: ${query}` }
    ],
    total: 100,
    currentPage: parseInt(page)
  });
});

// Route with mixed path and query parameters
routerFactory.get('/users/:id?fields=:fields?&expand=:expand?', (ctx) => {
  const { id, fields = 'id,name,email', expand = '' } = ctx.params;
  
  ctx.setStatus(200);
  ctx.json({
    user: {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      fields: fields.split(','),
      expand: expand.split(',').filter(Boolean)
    }
  });
});

// Advanced query parameter example with validation
routerFactory.get('/products?category=:category&minPrice=:minPrice?&maxPrice=:maxPrice?&sort=:sort?', (ctx) => {
  const { category, minPrice = '0', maxPrice = '1000000', sort = 'name' } = ctx.params;
  
  // Validate parameters
  const validSortFields = ['name', 'price', 'rating', 'date'];
  if (!validSortFields.includes(sort)) {
    ctx.setStatus(400);
    ctx.json({ error: 'Invalid sort field' });
    return;
  }
  
  ctx.setStatus(200);
  ctx.json({
    category,
    filters: {
      minPrice: parseFloat(minPrice),
      maxPrice: parseFloat(maxPrice),
      sort
    },
    products: [
      { id: 1, name: 'Product A', price: 99.99, category },
      { id: 2, name: 'Product B', price: 149.99, category }
    ]
  });
});

// ============================================
// 3. VERSIONING EXAMPLES
// ============================================

// Version 1 API routes
routerFactory.group('/v1', (v1) => {
  // Add version-specific middleware
  v1.use((ctx, next) => {
    ctx.apiVersion = 'v1';
    ctx.deprecated = false;
    return next();
  });
  
  // Simple user endpoints for v1
  v1.get('/users', (ctx) => {
    ctx.setStatus(200);
    ctx.json({
      version: ctx.apiVersion,
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' }
      ]
    });
  });
  
  v1.get('/users/:id', (ctx) => {
    ctx.setStatus(200);
    ctx.json({
      version: ctx.apiVersion,
      user: {
        id: ctx.params.id,
        name: `User ${ctx.params.id}`,
        email: `user${ctx.params.id}@example.com`
      }
    });
  });
  
  // Products with query parameters in v1
  v1.get('/products?category=:category&page=:page?', (ctx) => {
    ctx.setStatus(200);
    ctx.json({
      version: ctx.apiVersion,
      category: ctx.params.category,
      page: ctx.params.page || '1',
      products: []
    });
  });
});

// Version 2 API routes with enhanced features
routerFactory.group('/v2', (v2) => {
  // Add version-specific middleware
  v2.use((ctx, next) => {
    ctx.apiVersion = 'v2';
    ctx.features = ['enhanced-security', 'rate-limiting', 'caching'];
    return next();
  });
  
  // Enhanced user endpoints for v2
  v2.get('/users', (ctx) => {
    const { page = '1', limit = '20', sort = 'name' } = ctx.query;
    
    ctx.setStatus(200);
    ctx.json({
      version: ctx.apiVersion,
      features: ctx.features,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        sort
      },
      users: [
        { 
          id: 1, 
          name: 'Alice', 
          email: 'alice@example.com',
          metadata: { createdAt: '2024-01-01', updatedAt: '2024-01-15' }
        },
        { 
          id: 2, 
          name: 'Bob', 
          email: 'bob@example.com',
          metadata: { createdAt: '2024-01-02', updatedAt: '2024-01-16' }
        }
      ]
    });
  });
  
  // Enhanced user detail with query parameters
  v2.get('/users/:id?include=:include?&fields=:fields?', (ctx) => {
    const { id, include = '', fields = '' } = ctx.params;
    
    const userData = {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      profile: {
        bio: `Bio for user ${id}`,
        avatar: `https://example.com/avatars/${id}.jpg`
      }
    };
    
    // Handle include parameter
    const includes = include.split(',').filter(Boolean);
    if (includes.includes('posts')) {
      userData.posts = [
        { id: 101, title: 'First Post', content: 'Content here' },
        { id: 102, title: 'Second Post', content: 'More content' }
      ];
    }
    
    if (includes.includes('comments')) {
      userData.comments = [
        { id: 201, postId: 101, content: 'Great post!' }
      ];
    }
    
    // Handle fields parameter
    const requestedFields = fields.split(',').filter(Boolean);
    if (requestedFields.length > 0) {
      const filteredData = {};
      requestedFields.forEach(field => {
        if (userData[field] !== undefined) {
          filteredData[field] = userData[field];
        }
      });
      ctx.setStatus(200);
      ctx.json({
        version: ctx.apiVersion,
        user: filteredData
      });
    } else {
      ctx.setStatus(200);
      ctx.json({
        version: ctx.apiVersion,
        user: userData
      });
    }
  });
  
  // Products with advanced filtering in v2
  v2.get('/products?category=:category&minPrice=:minPrice?&maxPrice=:maxPrice?&sort=:sort?&page=:page?', (ctx) => {
    const { category, minPrice = '0', maxPrice = '1000000', sort = 'name', page = '1' } = ctx.params;
    
    ctx.setStatus(200);
    ctx.json({
      version: ctx.apiVersion,
      filters: {
        category,
        priceRange: {
          min: parseFloat(minPrice),
          max: parseFloat(maxPrice)
        },
        sort,
        page: parseInt(page)
      },
      products: [
        {
          id: 1,
          name: 'Premium Product A',
          price: 199.99,
          category,
          rating: 4.5,
          tags: ['premium', 'featured']
        },
        {
          id: 2,
          name: 'Standard Product B',
          price: 99.99,
          category,
          rating: 4.0,
          tags: ['standard']
        }
      ],
      metadata: {
        total: 50,
        page: parseInt(page),
        pageSize: 20,
        hasMore: parseInt(page) < 3
      }
    });
  });
});

// ============================================
// 4. NESTED GROUPING EXAMPLES
// ============================================

// Admin routes with nested grouping
routerFactory.group('/admin', (admin) => {
  // Admin authentication middleware
  admin.use(async (ctx, next) => {
    const token = ctx.headers['x-admin-token'];
    if (!token || token !== 'admin-secret-token') {
      ctx.setStatus(401);
      ctx.json({ 
        error: 'Admin access required',
        message: 'Valid x-admin-token header is required'
      });
      return;
    }
    ctx.isAdmin = true;
    await next();
  });
  
  // Admin dashboard
  admin.get('/dashboard?view=:view?', (ctx) => {
    const view = ctx.params.view || 'overview';
    
    ctx.setStatus(200);
    ctx.json({
      view,
      stats: {
        totalUsers: 1500,
        activeUsers: 1250,
        revenue: 50000,
        growth: 15.5
      },
      recentActivity: [
        { id: 1, action: 'user.created', timestamp: '2024-01-15T10:30:00Z' },
        { id: 2, action: 'order.completed', timestamp: '2024-01-15T10:25:00Z' }
      ]
    });
  });
  
  // Nested grouping for user management
  admin.group('/users', (users) => {
    // User list with query parameters
    users.get('?status=:status?&role=:role?&page=:page?', (ctx) => {
      const { status = 'active', role = 'all', page = '1' } = ctx.params;
      
      ctx.setStatus(200);
      ctx.json({
        filters: { status, role, page: parseInt(page) },
        users: [
          { id: 1, name: 'Admin User', email: 'admin@example.com', role: 'admin', status: 'active' },
          { id: 2, name: 'Moderator', email: 'mod@example.com', role: 'moderator', status: 'active' }
        ],
        pagination: {
          total: 100,
          page: parseInt(page),
          pageSize: 20
        }
      });
    });
    
    // User detail with query parameters
    users.get('/:id?include=:include?', (ctx) => {
      const { id, include = '' } = ctx.params;
      const includes = include.split(',').filter(Boolean);
      
      const userDetail = {
        id,
        name: `Admin User ${id}`,
        email: `admin${id}@example.com`,
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        lastLogin: '2024-01-15T10:00:00Z'
      };
      
      if (includes.includes('permissions')) {
        userDetail.permissions = ['read', 'write', 'delete', 'manage'];
      }
      
      if (includes.includes('activity')) {
        userDetail.recentActivity = [
          { action: 'login', timestamp: '2024-01-15T10:00:00Z' },
          { action: 'settings.updated', timestamp: '2024-01-14T15:30:00Z' }
        ];
      }
      
      ctx.setStatus(200);
      ctx.json(userDetail);
    });
    
    // Create user
    users.post('/', async (ctx) => {
      const userData = ctx.body;
      
      ctx.setStatus(201);
      ctx.json({
        message: 'User created successfully',
        user: {
          id: Date.now(),
          ...userData,
          createdAt: new Date().toISOString(),
          createdBy: 'admin'
        }
      });
    });
    
    // Update user
    users.put('/:id', async (ctx) => {
      const { id } = ctx.params;
      const updateData = ctx.body;
      
      ctx.setStatus(200);
      ctx.json({
        message: 'User updated successfully',
        user: {
          id,
          ...updateData,
          updatedAt: new Date().toISOString(),
          updatedBy: 'admin'
        }
      });
    });
    
    // Delete user
    users.delete('/:id', (ctx) => {
      const { id } = ctx.params;
      
      ctx.setStatus(200);
      ctx.json({
        message: `User ${id} deleted successfully`,
        deletedAt: new Date().toISOString()
      });
    });
  });
  
  // Nested grouping for product management
  admin.group('/products', (products) => {
    // Product list with advanced query parameters
    products.get('?status=:status?&category=:category?&sort=:sort?&order=:order?', (ctx) => {
      const { 
        status = 'active', 
        category = 'all', 
        sort = 'createdAt', 
        order = 'desc' 
      } = ctx.params;
      
      ctx.setStatus(200);
      ctx.json({
        filters: { status, category, sort, order },
        products: [
          {
            id: 1,
            name: 'Premium Product',
            category: 'electronics',
            status: 'active',
            price: 299.99,
            stock: 50,
            createdAt: '2024-01-10T00:00:00Z'
          }
        ],
        total: 1
      });
    });
    
    // Create product
    products.post('/', async (ctx) => {
      const productData = ctx.body;
      
      ctx.setStatus(201);
      ctx.json({
        message: 'Product created successfully',
        product: {
          id: Date.now(),
          ...productData,
          createdAt: new Date().toISOString(),
          createdBy: 'admin'
        }
      });
    });
  });
});

// ============================================
// 5. RESTFUL RESOURCE EXAMPLES
// ============================================

// Articles resource with query parameter support
routerFactory.group('/articles', (articles) => {
  // GET /api/articles?page=:page&limit=:limit&category=:category?
  articles.get('?page=:page?&limit=:limit?&category=:category?', (ctx) => {
    const { page = '1', limit = '10', category = 'all' } = ctx.params;
    
    ctx.setStatus(200);
    ctx.json({
      articles: [
        { id: 1, title: 'Article 1', category, author: 'Author 1' },
        { id: 2, title: 'Article 2', category, author: 'Author 2' }
      ],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 100,
        totalPages: 10
      },
      filters: { category }
    });
  });
  
  // POST /api/articles
  articles.post('/', async (ctx) => {
    const articleData = ctx.body;
    
    ctx.setStatus(201);
    ctx.json({
      message: 'Article created successfully',
      article: {
        id: Date.now(),
        ...articleData,
        createdAt: new Date().toISOString(),
        slug: articleData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      }
    });
  });
  
  // GET /api/articles/:id?include=:include?
  articles.get('/:id?include=:include?', (ctx) => {
    const { id, include = '' } = ctx.params;
    const includes = include.split(',').filter(Boolean);
    
    const article = {
      id,
      title: `Article ${id}`,
      content: `Content for article ${id}`,
      author: 'John Doe',
      publishedAt: '2024-01-15T10:00:00Z',
      tags: ['technology', 'programming']
    };
    
    if (includes.includes('comments')) {
      article.comments = [
        { id: 1, user: 'Alice', comment: 'Great article!' },
        { id: 2, user: 'Bob', comment: 'Very informative' }
      ];
    }
    
    if (includes.includes('stats')) {
      article.stats = {
        views: 1500,
        likes: 120,
        shares: 45
      };
    }
    
    ctx.setStatus(200);
    ctx.json(article);
  });
  
  // PUT /api/articles/:id
  articles.put('/:id', async (ctx) => {
    const { id } = ctx.params;
    const updateData = ctx.body;
    
    ctx.setStatus(200);
    ctx.json({
      message: 'Article updated successfully',
      article: {
        id,
        ...updateData,
        updatedAt: new Date().toISOString()
      }
    });
  });
  
  // DELETE /api/articles/:id
  articles.delete('/:id', (ctx) => {
    const { id } = ctx.params;
    
    ctx.setStatus(200);
    ctx.json({
      message: `Article ${id} deleted successfully`,
      deletedAt: new Date().toISOString()
    });
  });
  
  // Nested routes for article comments
  articles.group('/:articleId/comments', (comments) => {
    // GET /api/articles/:articleId/comments?page=:page?
    comments.get('?page=:page?', (ctx) => {
      const { articleId, page = '1' } = ctx.params;
      
      ctx.setStatus(200);
      ctx.json({
        articleId,
        comments: [
          { id: 1, text: 'Great article!', author: 'Alice' },
          { id: 2, text: 'Very helpful', author: 'Bob' }
        ],
        page: parseInt(page)
      });
    });
    
    // POST /api/articles/:articleId/comments
    comments.post('/', async (ctx) => {
      const { articleId } = ctx.params;
      const commentData = ctx.body;
      
      ctx.setStatus(201);
      ctx.json({
        message: 'Comment added successfully',
        comment: {
          id: Date.now(),
          articleId,
          ...commentData,
          createdAt: new Date().toISOString()
        }
      });
    });
  });
});

// ============================================
// 6. ERROR HANDLING AND MIDDLEWARE EXAMPLES
// ============================================

// Error handling middleware
routerFactory.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Route error:', error);
    ctx.setStatus(500);
    ctx.json({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
routerFactory.use((ctx) => {
  ctx.setStatus(404);
  ctx.json({
    error: 'Not Found',
    message: `Route ${ctx.method} ${ctx.url} not found`,
    timestamp: new Date().toISOString(),
    availableRoutes: routerFactory.getRoutes().map(r => `${r.method} ${r.path}`)
  });
});

// ============================================
// 7. UTILITY FUNCTIONS AND TESTING
// ============================================

// Get router middleware for AetherJS pipeline
const routerMiddleware = routerFactory.middleware();

// Create a simple HTTP server for testing all features
import http from 'http';

const server = http.createServer(async (req, res) => {
  const ctx = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: null,
    setStatus: (code) => { res.statusCode = code; },
    setHeader: (key, value) => { res.setHeader(key, value); },
    json: (data) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    }
  };

  // Parse request body for POST, PUT, PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const body = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    });
    
    await new Promise((resolve) => {
      req.on('end', () => {
        try {
          ctx.body = body.length > 0 ? JSON.parse(Buffer.concat(body).toString()) : null;
        } catch (error) {
          ctx.body = null;
        }
        resolve();
      });
    });
  }

  try {
    await routerMiddleware(ctx, () => {
      // If no route matches, the 404 handler will catch it
    });
  } catch (error) {
    console.error('Router error:', error);
    ctx.setStatus(500);
    ctx.json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// Start the server
const PORT = 3003;
server.listen(PORT, () => {
  console.log(`🚀 Enhanced router test server running on http://localhost:${PORT}`);
  console.log('📊 Available routes:');
  
  const routes = routerFactory.getRoutes();
  routes.forEach(route => {
    console.log(`   ${route.method.padEnd(7)} ${route.path}`);
    if (route.hasQueryParams) {
      console.log(`          Query params: ${route.queryParamNames.join(', ')}`);
    }
    if (route.pathParamNames.length > 0) {
      console.log(`          Path params: ${route.pathParamNames.join(', ')}`);
    }
  });
  
  console.log('\n🎯 Test endpoints:');
  console.log('   Basic:');
  console.log('     GET  /api/health');
  console.log('     GET  /api/v1/users');
  console.log('     GET  /api/v2/users?page=1&limit=20');
  console.log('\n   Query Parameters:');
  console.log('     GET  /api/search?q=test&page=2&limit=20');
  console.log('     GET  /api/users/123?fields=name,email&expand=posts');
  console.log('     GET  /api/products?category=electronics&minPrice=100&maxPrice=1000&sort=price');
  console.log('\n   Versioning:');
  console.log('     GET  /api/v1/users/123');
  console.log('     GET  /api/v2/users/123?include=posts,comments&fields=name,email');
  console.log('\n   Admin Routes:');
  console.log('     GET  /api/admin/dashboard?view=detailed');
  console.log('     GET  /api/admin/users?status=active&role=admin&page=1');
  console.log('\n   RESTful Resources:');
  console.log('     GET  /api/articles?page=1&limit=10&category=technology');
  console.log('     GET  /api/articles/456?include=comments,stats');
  console.log('     GET  /api/articles/789/comments?page=1');
  
  console.log('\n📈 Router Statistics:');
  const stats = routerFactory.getStats();
  console.log(`   Total routes: ${stats.totalRoutes}`);
  console.log(`   Routes with query params: ${stats.routesWithQueryParams}`);
  console.log(`   Cache size: ${stats.cacheSize}`);
  console.log(`   Cache hit rate: ${stats.cacheHitRate.toFixed(2)}%`);
  console.log(`   Available versions: ${stats.versions.join(', ')}`);
});

// Export router middleware for use in other modules
export default routerMiddleware;

// Export router factory for programmatic access
export { routerFactory };

// Example usage function
export function testRouterFeatures() {
  console.log('\n🧪 Testing router features...');
  
  // Test basic route matching
  const testRoutes = [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/v1/users' },
    { method: 'GET', path: '/api/v2/users?page=2&limit=30' },
    { method: 'GET', path: '/api/search?q=router&page=1' },
    { method: 'GET', path: '/api/admin/dashboard?view=stats' },
    { method: 'GET', path: '/api/articles/123?include=comments' }
  ];
  
  testRoutes.forEach(test => {
    const match = routerFactory.match(test.method, test.path);
    if (match) {
      console.log(`✓ Route matched: ${test.method} ${test.path}`);
      console.log(`  Params: ${JSON.stringify(match.params)}`);
      if (match.query) {
        console.log(`  Query: ${JSON.stringify(match.query)}`);
      }
    } else {
      console.log(`✗ No match for: ${test.method} ${test.path}`);
    }
  });
  
  // Display all routes
  console.log('\n📋 All registered routes:');
  routerFactory.getRoutes().forEach((route, index) => {
    console.log(`${index + 1}. ${route.method} ${route.path}`);
  });
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRouterFeatures();
}
