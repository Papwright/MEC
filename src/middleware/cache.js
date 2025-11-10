const NodeCache = require('node-cache');

class CacheManager {
    constructor() {
        // Create different cache instances for different data types
        this.caches = {
            results: new NodeCache({ 
                stdTTL: parseInt(process.env.CACHE_LIVE_RESULTS_TTL) || 30,
                checkperiod: 10
            }),
            winners: new NodeCache({ 
                stdTTL: parseInt(process.env.CACHE_WINNERS_TTL) || 60,
                checkperiod: 15
            }),
            summary: new NodeCache({ 
                stdTTL: parseInt(process.env.CACHE_SUMMARY_TTL) || 300,
                checkperiod: 30
            }),
            general: new NodeCache({ 
                stdTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
                checkperiod: 60
            })
        };

        // Set up cache event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        Object.entries(this.caches).forEach(([name, cache]) => {
            cache.on('set', (key, value) => {
                console.log(`Cache [${name}] SET: ${key}`);
            });

            cache.on('del', (key, value) => {
                console.log(`Cache [${name}] DEL: ${key}`);
            });

            cache.on('expired', (key, value) => {
                console.log(`Cache [${name}] EXPIRED: ${key}`);
            });

            cache.on('flush', () => {
                console.log(`Cache [${name}] FLUSHED`);
            });
        });
    }

    // Generic cache middleware
    cache(cacheType = 'general', keyGenerator = null, ttl = null) {
        return (req, res, next) => {
            const cache = this.caches[cacheType];
            
            // Generate cache key
            const key = keyGenerator ? keyGenerator(req) : this.generateKey(req);
            
            // Try to get from cache
            const cachedData = cache.get(key);
            if (cachedData) {
                console.log(`Cache HIT [${cacheType}]: ${key}`);
                return res.json(cachedData);
            }

            console.log(`Cache MISS [${cacheType}]: ${key}`);

            // Store original res.json
            const originalJson = res.json.bind(res);
            
            // Override res.json to cache the response
            res.json = (data) => {
                // Cache the response
                const cacheOptions = ttl ? { ttl } : {};
                cache.set(key, data, cacheOptions);
                
                // Call original res.json
                originalJson(data);
            };

            next();
        };
    }

    // Generate cache key from request
    generateKey(req) {
        const { method, path: requestPath, query } = req;
        const queryString = Object.keys(query).length ?
            Object.entries(query)
                .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join('&')
            : '';

        return `${method}:${requestPath}${queryString ? '?' + queryString : ''}`;
    }

    // Cache invalidation methods
    invalidateResults() {
        console.log('Invalidating results cache');
        this.caches.results.flushAll();
        this.caches.winners.flushAll();
        this.caches.summary.flushAll();
    }

    invalidateWinners() {
        console.log('Invalidating winners cache');
        this.caches.winners.flushAll();
        this.caches.summary.flushAll();
    }

    invalidateSummary() {
        console.log('Invalidating summary cache');
        this.caches.summary.flushAll();
    }

    invalidateAll() {
        console.log('Invalidating all caches');
        Object.values(this.caches).forEach(cache => cache.flushAll());
    }

    // Specific cache methods for election data
    cacheResults() {
        return this.cache('results', (req) => {
            const { position, sort } = req.query;
            return `results:${position || 'all'}:${sort || 'default'}`;
        });
    }

    cacheWinners() {
        return this.cache('winners', (req) => {
            const { position, sort } = req.query;
            return `winners:${position || 'all'}:${sort || 'default'}`;
        });
    }

    cacheSummary() {
        return this.cache('summary', () => 'summary:all');
    }

    cacheVoters() {
        return this.cache('general', (req) => {
            const { page, limit, search } = req.query;
            return `voters:${page || 1}:${limit || 50}:${search || ''}`;
        });
    }

    cacheCandidates() {
        return this.cache('general', (req) => {
            const { page, limit, position, party } = req.query;
            return `candidates:${page || 1}:${limit || 50}:${position || 'all'}:${party || 'all'}`;
        });
    }

    cacheStatistics() {
        return this.cache('general', () => 'statistics:dashboard');
    }

    // Cache statistics and health
    getStats() {
        const stats = {};
        Object.entries(this.caches).forEach(([name, cache]) => {
            const cacheStats = cache.getStats();
            stats[name] = {
                keys: cacheStats.keys,
                hits: cacheStats.hits,
                misses: cacheStats.misses,
                ksize: cacheStats.ksize,
                vsize: cacheStats.vsize
            };
        });
        return stats;
    }

    // Clear specific cache entries
    clearPattern(cacheType, pattern) {
        const cache = this.caches[cacheType];
        if (!cache) return;

        const keys = cache.keys();
        const regex = new RegExp(pattern);
        const matchingKeys = keys.filter(key => regex.test(key));
        
        matchingKeys.forEach(key => {
            cache.del(key);
        });

        console.log(`Cleared ${matchingKeys.length} cache entries matching pattern: ${pattern}`);
    }

    // Preload critical data
    async preloadCriticalData(db) {
        console.log('Preloading critical data into cache...');
        
        try {
            // Preload positions
            const [positions] = await db.promise().query('SELECT PositionID, Title FROM Positions ORDER BY PositionID');
            this.caches.general.set('positions:all', positions, 3600);

            // Preload parties
            const [parties] = await db.promise().query('SELECT PartyName, Symbol FROM PoliticalParty ORDER BY PartyName');
            this.caches.general.set('parties:all', parties, 3600);

            // Preload districts
            const [districts] = await db.promise().query('SELECT DistrictID, DistrictName, Region FROM District ORDER BY Region, DistrictName');
            this.caches.general.set('districts:all', districts, 3600);

            console.log('Critical data preloaded successfully');
        } catch (error) {
            console.error('Error preloading critical data:', error);
        }
    }

    // Memory usage monitoring
    getMemoryUsage() {
        const usage = process.memoryUsage();
        const cacheStats = this.getStats();
        
        return {
            process: {
                rss: Math.round(usage.rss / 1024 / 1024), // MB
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
                external: Math.round(usage.external / 1024 / 1024) // MB
            },
            caches: cacheStats
        };
    }

    // Cleanup method
    destroy() {
        Object.values(this.caches).forEach(cache => cache.close());
    }
}

// Create singleton instance
const cacheManager = new CacheManager();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down cache manager...');
    cacheManager.destroy();
});

module.exports = cacheManager;
