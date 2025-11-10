const express = require('express');
const router = express.Router();
const databaseHealth = require('../middleware/databaseHealth');
const { getBasicCounts, getExtendedCounts } = require('../services/statsService');

// GET /api/system/status?detail=full
// Consolidated system status: db health + basic entity counts
router.get('/status', async (req, res) => {
    try {
        const detail = (req.query.detail || 'basic').toLowerCase();
        // Run DB health checks (fast) in parallel
        const [dbQuick, dbDetailed, counts] = await Promise.all([
            databaseHealth.checkHealth().catch(err => ({ healthy: false, error: err.message })),
            databaseHealth.getDetailedStats().catch(err => ({ healthy: false, error: err.message })),
            (detail === 'full' ? getExtendedCounts() : getBasicCounts()).catch(() => ({}))
        ]);

        // Normalize numeric fields
        const normalizeNumbers = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v]));

        const data = {
            server: {
                time: new Date().toISOString(),
                uptimeSeconds: Math.round(process.uptime()),
                detailLevel: detail
            },
            database: {
                healthy: !!dbQuick.healthy,
                responseTimeMs: dbQuick.responseTime || null,
                lastCheck: dbQuick.timestamp || null,
                connections: dbDetailed.connections || null,
                uptimeServerSeconds: dbDetailed.uptime || null,
                threadsConnected: dbDetailed.threadsConnected || null,
                detailedHealthy: dbDetailed.isHealthy,
                error: dbQuick.error || dbDetailed.error || null
            },
            counts: normalizeNumbers(counts)
        };

        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
