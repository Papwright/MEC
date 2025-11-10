const db = require('../config/database');

class DatabaseHealthChecker {
    constructor() {
        this.isHealthy = false;
        this.lastCheck = null;
        this.checkInterval = 30000; // 30 seconds
        this.startPeriodicCheck();
    }

    async checkHealth() {
        try {
            const startTime = Date.now();
            const [result] = await db.promise().query('SELECT 1 as health_check, NOW() as timestamp');
            const responseTime = Date.now() - startTime;
            
            this.isHealthy = true;
            this.lastCheck = new Date();
            
            console.log('Database health check passed', {
                responseTime: `${responseTime}ms`,
                timestamp: this.lastCheck.toISOString()
            });
            
            return {
                healthy: true,
                responseTime,
                timestamp: this.lastCheck,
                details: result[0]
            };
        } catch (error) {
            this.isHealthy = false;
            this.lastCheck = new Date();
            
            console.error('Database health check failed', {
                error: error.message,
                timestamp: this.lastCheck.toISOString()
            });
            
            return {
                healthy: false,
                error: error.message,
                timestamp: this.lastCheck
            };
        }
    }

    startPeriodicCheck() {
        setInterval(async () => {
            await this.checkHealth();
        }, this.checkInterval);
    }

    getHealthStatus() {
        return {
            isHealthy: this.isHealthy,
            lastCheck: this.lastCheck,
            uptime: this.lastCheck ? Date.now() - this.lastCheck.getTime() : null
        };
    }

    async getDetailedStats() {
        try {
            const [connectionStats] = await db.promise().query(`
                SHOW STATUS LIKE 'Connections'
            `);
            
            const [uptimeStats] = await db.promise().query(`
                SHOW STATUS LIKE 'Uptime'
            `);
            
            const [threadsStats] = await db.promise().query(`
                SHOW STATUS LIKE 'Threads_connected'
            `);

            return {
                connections: connectionStats[0]?.Value || 0,
                uptime: uptimeStats[0]?.Value || 0,
                threadsConnected: threadsStats[0]?.Value || 0,
                isHealthy: this.isHealthy,
                lastCheck: this.lastCheck
            };
        } catch (error) {
            return {
                error: error.message,
                isHealthy: false,
                lastCheck: this.lastCheck
            };
        }
    }
}

// Create singleton instance
const healthChecker = new DatabaseHealthChecker();

module.exports = healthChecker;
