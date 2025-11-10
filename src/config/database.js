const mysql = require('mysql2');

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.initializePool();
    }

    initializePool() {
        const config = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'tripartite_elections_mw',
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
            queueLimit: 0,
            charset: 'utf8mb4',
            timezone: 'Z',
            supportBigNumbers: true,
            bigNumberStrings: true,
            dateStrings: true,
            debug: false,
            multipleStatements: false,
            // Removed unsupported options: timeout, reconnect, idleTimeout, maxIdle
        };

        this.pool = mysql.createPool(config);
        this.promisePool = this.pool.promise();

        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Database pool error', { error: err.message });
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.warn('Database connection lost, attempting to reconnect...');
            }
        });
    }

    async getConnection() {
        try {
            const connection = await this.promisePool.getConnection();
            return connection;
        } catch (error) {
            console.error('Failed to get database connection', { error: error.message });
            throw error;
        }
    }

    async query(sql, params = []) {
        const startTime = Date.now();
        try {
            const [rows, fields] = await this.promisePool.execute(sql, params);
            const duration = Date.now() - startTime;
            
            // Query executed successfully

            return [rows, fields];
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error('Database query failed', {
                sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
                params,
                duration: `${duration}ms`,
                error: error.message
            });
            throw error;
        }
    }

    async transaction(callback) {
        const connection = await this.getConnection();
        try {
            await connection.beginTransaction();
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async testConnection() {
        try {
            const [rows] = await this.query('SELECT 1 as test');
            return rows[0].test === 1;
        } catch (error) {
            console.error('Database connection test failed', { error: error.message });
            return false;
        }
    }

    async close() {
        try {
            await this.promisePool.end();
            console.log('Database pool closed');
        } catch (error) {
            console.error('Error closing database pool', { error: error.message });
        }
    }

    getStats() {
        return {
            totalConnections: this.pool._allConnections.length,
            freeConnections: this.pool._freeConnections.length,
            acquiringConnections: this.pool._acquiringConnections.length,
            connectionQueue: this.pool._connectionQueue.length
        };
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Export both the manager and legacy compatibility
module.exports = dbManager.pool;
module.exports.promise = () => dbManager.promisePool;
module.exports.manager = dbManager;
