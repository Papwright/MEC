const express = require('express');
const router = express.Router();
const { getBasicCounts, getExtendedCounts } = require('../services/statsService');

// GET /api/dashboard?detail=full
router.get('/', async (req, res, next) => {
    try {
        const detail = (req.query.detail || 'basic').toLowerCase();
        const data = detail === 'full' ? await getExtendedCounts() : await getBasicCounts();
        return res.json({ success: true, data, detail });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
