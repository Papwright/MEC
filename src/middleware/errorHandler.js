const fs = require('fs');
const path = require('path');

class ErrorHandler {
    constructor() {
        this.logsDir = path.join(__dirname, '../../logs');
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    logError(error, req = null, additionalInfo = {}) {
        const timestamp = new Date().toISOString();
        const errorInfo = {
            timestamp,
            message: error.message,
            stack: error.stack,
            name: error.name,
            url: req?.url,
            method: req?.method,
            ip: req?.ip,
            userAgent: req?.get('User-Agent'),
            ...additionalInfo
        };

        // Log to console
        console.error('Error occurred:', errorInfo);

        // Log to file
        const logFile = path.join(this.logsDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        const logEntry = JSON.stringify(errorInfo) + '\n';
        
        try {
            fs.appendFileSync(logFile, logEntry);
        } catch (writeError) {
            console.error('Failed to write error log:', writeError.message);
        }
    }

    handleDatabaseError(error, req = null) {
        let userMessage = 'A database error occurred';
        let statusCode = 500;

        if (error.code === 'ER_NO_SUCH_TABLE') {
            userMessage = 'Database table not found. Please check database setup.';
            statusCode = 500;
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            userMessage = 'Database access denied. Please check credentials.';
            statusCode = 500;
        } else if (error.code === 'ECONNREFUSED') {
            userMessage = 'Database connection refused. Please check if database server is running.';
            statusCode = 503;
        } else if (error.code === 'ER_DUP_ENTRY') {
            userMessage = 'Duplicate entry detected.';
            statusCode = 409;
        } else if (error.code === 'ER_BAD_FIELD_ERROR') {
            userMessage = 'Invalid database field reference.';
            statusCode = 400;
        }

        this.logError(error, req, { type: 'database', userMessage, statusCode });

        return {
            success: false,
            error: userMessage,
            code: error.code,
            statusCode
        };
    }

    handleValidationError(error, req = null) {
        this.logError(error, req, { type: 'validation' });

        return {
            success: false,
            error: 'Validation failed',
            details: error.message,
            statusCode: 400
        };
    }

    handleAuthenticationError(error, req = null) {
        this.logError(error, req, { type: 'authentication' });

        return {
            success: false,
            error: 'Authentication failed',
            statusCode: 401
        };
    }

    handleNotFoundError(error, req = null) {
        this.logError(error, req, { type: 'not_found' });

        return {
            success: false,
            error: 'Resource not found',
            statusCode: 404
        };
    }

    // Express middleware
    middleware() {
        return (error, req, res, next) => {
            let response;

            if (error.name === 'ValidationError') {
                response = this.handleValidationError(error, req);
            } else if (error.name === 'UnauthorizedError') {
                response = this.handleAuthenticationError(error, req);
            } else if (error.name === 'NotFoundError') {
                response = this.handleNotFoundError(error, req);
            } else if (error.code && error.code.startsWith('ER_')) {
                response = this.handleDatabaseError(error, req);
            } else {
                // Generic error
                this.logError(error, req, { type: 'generic' });
                response = {
                    success: false,
                    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
                    statusCode: 500
                };
            }

            res.status(response.statusCode || 500).json(response);
        };
    }

    // Async error wrapper for route handlers
    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    // Custom error classes
    static ValidationError(message) {
        const error = new Error(message);
        error.name = 'ValidationError';
        return error;
    }

    static NotFoundError(message = 'Resource not found') {
        const error = new Error(message);
        error.name = 'NotFoundError';
        return error;
    }

    static UnauthorizedError(message = 'Unauthorized access') {
        const error = new Error(message);
        error.name = 'UnauthorizedError';
        return error;
    }
}

module.exports = new ErrorHandler();
