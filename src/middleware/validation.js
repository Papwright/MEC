const validator = require('validator');

class ValidationMiddleware {
    // Sanitize input data
    sanitizeInput(req, res, next) {
        const sanitizeObject = (obj) => {
            if (typeof obj === 'string') {
                return validator.escape(obj.trim());
            } else if (Array.isArray(obj)) {
                return obj.map(sanitizeObject);
            } else if (obj && typeof obj === 'object') {
                const sanitized = {};
                for (const [key, value] of Object.entries(obj)) {
                    sanitized[key] = sanitizeObject(value);
                }
                return sanitized;
            }
            return obj;
        };

        if (req.body) {
            req.body = sanitizeObject(req.body);
        }
        if (req.query) {
            req.query = sanitizeObject(req.query);
        }
        if (req.params) {
            req.params = sanitizeObject(req.params);
        }

        next();
    }

    // Validate voter data
    validateVoter(req, res, next) {
        const { nationalId, stationId } = req.body;
        const errors = [];

        if (!nationalId || !validator.isLength(nationalId, { min: 1, max: 20 })) {
            errors.push('Valid National ID is required (1-20 characters)');
        }

        if (!stationId || !validator.isInt(stationId.toString(), { min: 1 })) {
            errors.push('Valid Station ID is required');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    }

    // Validate candidate data
    validateCandidate(req, res, next) {
        const { nationalId, positionId, partyName, wardId, constituencyId } = req.body;
        const errors = [];

        if (!nationalId || !validator.isLength(nationalId, { min: 1, max: 20 })) {
            errors.push('Valid National ID is required (1-20 characters)');
        }

        if (!positionId || !validator.isIn(positionId, ['PRES', 'MP', 'COUNC'])) {
            errors.push('Valid Position ID is required (PRES, MP, or COUNC)');
        }

        if (!partyName || !validator.isLength(partyName, { min: 1, max: 100 })) {
            errors.push('Valid Party Name is required (1-100 characters)');
        }

        if (wardId && !validator.isInt(wardId.toString(), { min: 1 })) {
            errors.push('Valid Ward ID must be a positive integer');
        }

        if (constituencyId && !validator.isInt(constituencyId.toString(), { min: 1 })) {
            errors.push('Valid Constituency ID must be a positive integer');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    }

    // Validate result update
    validateResultUpdate(req, res, next) {
        const { totalVotes } = req.body;
        const { id } = req.params;
        const errors = [];

        if (!validator.isInt(id, { min: 1 })) {
            errors.push('Valid Result ID is required');
        }

        if (totalVotes === undefined || !validator.isInt(totalVotes.toString(), { min: 0 })) {
            errors.push('Valid vote count is required (non-negative integer)');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    }

    // Validate pagination parameters
    validatePagination(req, res, next) {
        const { page, limit } = req.query;
        const errors = [];

        if (page && (!validator.isInt(page, { min: 1 }) || parseInt(page) > 10000)) {
            errors.push('Page must be a positive integer between 1 and 10000');
        }

        if (limit && (!validator.isInt(limit, { min: 1, max: 1000 }) || parseInt(limit) > 1000)) {
            errors.push('Limit must be a positive integer between 1 and 1000');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        // Set defaults
        req.query.page = req.query.page ? parseInt(req.query.page) : 1;
        req.query.limit = req.query.limit ? parseInt(req.query.limit) : 50;

        next();
    }

    // Validate search parameters
    validateSearch(req, res, next) {
        const { search } = req.query;

        if (search && !validator.isLength(search, { min: 1, max: 100 })) {
            return res.status(400).json({
                success: false,
                error: 'Search term must be between 1 and 100 characters'
            });
        }

        next();
    }

    // Validate position filter
    validatePositionFilter(req, res, next) {
        const { position } = req.query;

        if (position && !validator.isIn(position, ['PRES', 'MP', 'COUNC', 'ALL'])) {
            return res.status(400).json({
                success: false,
                error: 'Position filter must be PRES, MP, COUNC, or ALL'
            });
        }

        next();
    }

    // Rate limiting for sensitive operations
    rateLimitSensitive(req, res, next) {
        const key = `${req.ip}-${req.path}`;
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        const maxRequests = 10; // Max 10 requests per window

        // Initialize rate limit store if not exists
        if (!global.rateLimitStore) {
            global.rateLimitStore = new Map();
        }

        const store = global.rateLimitStore;
        const record = store.get(key);

        if (!record) {
            store.set(key, { count: 1, resetTime: now + windowMs });
        } else if (now > record.resetTime) {
            store.set(key, { count: 1, resetTime: now + windowMs });
        } else if (record.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((record.resetTime - now) / 1000)
            });
        } else {
            record.count++;
        }

        next();
    }

    // SQL injection prevention
    preventSQLInjection(req, res, next) {
        const checkString = (str) => {
            const dangerousPatterns = [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
                /(--|\/\*|\*\/|;|\|)/,
                /(\bOR\b|\bAND\b).*?=.*?=/i,
                /(\bUNION\b.*?\bSELECT\b)/i
            ];

            return dangerousPatterns.some(pattern => pattern.test(str));
        };

        const checkObject = (obj) => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string' && checkString(value)) {
                    return true;
                } else if (Array.isArray(value)) {
                    if (value.some(item => typeof item === 'string' && checkString(item))) {
                        return true;
                    }
                } else if (value && typeof value === 'object') {
                    if (checkObject(value)) {
                        return true;
                    }
                }
            }
            return false;
        };

        if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid input detected'
            });
        }

        next();
    }

    // CSRF protection
    csrfProtection(req, res, next) {
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
            return next();
        }

        const token = req.headers['x-csrf-token'] || req.body._csrf;
        const sessionToken = req.session.csrfToken;

        if (!token || !sessionToken || token !== sessionToken) {
            return res.status(403).json({
                success: false,
                error: 'Invalid CSRF token'
            });
        }

        next();
    }

    // Generate CSRF token
    generateCSRFToken(req, res, next) {
        if (!req.session.csrfToken) {
            req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
        }
        next();
    }
}

module.exports = new ValidationMiddleware();
