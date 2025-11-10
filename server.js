// Malawi Elections Management System - Live on Railway
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');
// Only load .env file in development, Railway provides env vars directly
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: './config.env' });
}

// Import database
const db = require('./src/config/database');

// Import routes
const resultsRoutes = require('./src/routes/results');
const adminRoutes = require('./src/routes/admin');
const tablesRoutes = require('./src/routes/tables');
const analyticsRoutes = require('./src/routes/analytics');
const dashboardRoutes = require('./src/routes/dashboard');
const systemRoutes = require('./src/routes/system');
const partyDashboardRoutes = require('./src/routes/parties');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');
const databaseHealth = require('./src/middleware/databaseHealth');

// ⚠️ WARNING: createTables() DROPS ALL TABLES! Only use for initial setup, never in production!
// const { createTables } = require('./src/utils/tableFix.js');

class ElectionServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        this.setupMiddleware();
        this.setupRoutes();
    }


    setupMiddleware() {
        // Security middleware with CSP configuration for Chart.js
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
                    scriptSrcAttr: ["'unsafe-inline'"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
        }));

        // CORS (adjust origin as needed)
        this.app.use(cors({ origin: true }));

        // Body parsing
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Sessions
        this.app.use(session({
            secret: process.env.SESSION_SECRET || 'change_this_secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                sameSite: 'lax',
                maxAge: 1000 * 60 * 60 * 8
            }
        }));

        // Logging setup
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
        this.app.use(morgan('combined', { stream: accessLogStream }));
    }

    // Add helper methods to reduce duplication
    isAuthenticated(req) {
        return req.session && req.session.user;
    }

    requireAuth(req, res, next) {
        if (this.isAuthenticated(req)) return next();
        return res.redirect('/');
    }

    serveAuthenticatedPage(pageName) {
        return (req, res) => {
            if (this.isAuthenticated(req)) {
                return res.sendFile(path.join(__dirname, 'public', `${pageName}.html`));
            }
            return res.redirect('/');
        };
    }

    setupRoutes() {
        // Auth endpoints - simplified
        this.app.post('/auth/login', (req, res) => {
            const { username, password } = req.body || {};
            const expectedUser = process.env.ADMIN_USER || 'admin';
            const expectedPass = process.env.ADMIN_PASS || 'password123';
            if (username === expectedUser && password === expectedPass) {
                req.session.user = { username };
                return res.json({ success: true });
            }
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        });

        this.app.post('/auth/logout', (req, res) => {
            req.session.destroy(() => res.json({ success: true }));
        });

        this.app.get('/auth/me', (req, res) => {
            if (this.isAuthenticated(req)) {
                return res.json({ success: true, user: req.session.user });
            }
            return res.status(401).json({ success: false });
        });

        // API Routes - use bound method
        const authMiddleware = this.requireAuth.bind(this);
        this.app.use('/api/results', resultsRoutes);
        this.app.use('/api/admin', authMiddleware, adminRoutes);
        this.app.use('/api/tables', tablesRoutes);
        this.app.use('/api/analytics', analyticsRoutes);
        this.app.use('/api/dashboard', dashboardRoutes);
        this.app.use('/api/system', systemRoutes); // /api/system/status
        this.app.use('/api/parties', partyDashboardRoutes); // /api/parties/dashboard

        // Health check endpoint
        this.app.get('/api/health', async (req, res) => {
            try {
                const dbHealth = await databaseHealth.checkHealth();
                res.json({
                    success: true,
                    status: 'healthy',
                    database: dbHealth,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(503).json({
                    success: false,
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Page routes - using helper method
        this.app.get('/', (req, res) => {
            if (this.isAuthenticated(req)) return res.redirect('/admin');
            return res.sendFile(path.join(__dirname, 'public', 'login.html'));
        });

        this.app.get('/index.html', (req, res) => {
            if (this.isAuthenticated(req)) return res.redirect('/admin');
            return res.redirect('/');
        });

        this.app.get('/admin', this.serveAuthenticatedPage('admin'));
        this.app.get('/status', this.serveAuthenticatedPage('admin'));

        // Static files
        this.app.use(express.static(path.join(__dirname, 'public'), { index: false }));

        // Malawi assets
        this.serveMalawiAssets();

        // Error handling
        this.app.use(errorHandler.middleware());
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.originalUrl
            });
        });
    }

    serveMalawiAssets() {
        const malawiDir = path.join(__dirname, 'Malawi');
        if (fs.existsSync(malawiDir)) {
            this.app.use('/Malawi', express.static(malawiDir));
        }

        const serveFlagImage = (urlPath, filePaths) => {
            this.app.get(urlPath, (req, res) => {
                for (const filePath of filePaths) {
                    if (fs.existsSync(filePath)) {
                        return res.sendFile(filePath);
                    }
                }
                res.status(404).send('Flag image not found');
            });
        };

        serveFlagImage('/Malawi/Flag-Malawi.webp', [
            path.join(__dirname, 'public', 'Flag-Malawi.webp')
        ]);

        serveFlagImage('/Malawi/Malawi.png', [
            path.join(__dirname, 'Malawi', 'Malawi.png'),
            path.join(__dirname, 'Flag_of_Malawi.svg.png'),
            path.join(__dirname, 'public', 'Flag-Malawi.webp')
        ]);
    }

    async start() {
        try {
            // ⚠️ DISABLED: createTables() drops all existing tables!
            // Only uncomment this for initial database setup, never with existing data
            // await createTables();
            
            this.app.listen(this.port, () => {
                console.log(`🚀 Simple Election Data System started on port ${this.port}`);
                console.log(`🌐 Server: http://localhost:${this.port}`);
            });
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Start the server
const server = new ElectionServer();
server.start();

module.exports = server;
