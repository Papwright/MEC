const db = require('../config/database');
const { safeQuery } = require('../utils/db');

async function getBasicCounts() {
    const mapQueries = {
        voters: 'SELECT COUNT(*) as c FROM voter',
        candidates: 'SELECT COUNT(*) as c FROM candidate',
        votes: 'SELECT COUNT(*) as c FROM vote',
        districts: 'SELECT COUNT(*) as c FROM district'
    };
    const entries = await Promise.all(Object.entries(mapQueries).map(async ([k, q]) => {
        try {
            const rows = await safeQuery(q);
            const raw = rows[0]?.c;
            const num = Number(raw); // Ensures stripping any leading zeros from string results
            return [k, Number.isFinite(num) ? num : 0];
        } catch {
            return [k, 0];
        }
    }));
    return Object.fromEntries(entries);
}

async function getExtendedCounts() {
    const mapQueries = {
        voters: 'SELECT COUNT(*) as c FROM voter',
        candidates: 'SELECT COUNT(*) as c FROM candidate',
        votes: 'SELECT COUNT(*) as c FROM vote',
        districts: 'SELECT COUNT(*) as c FROM district',
        parties: 'SELECT COUNT(*) as c FROM politicalparty',
        elections: 'SELECT COUNT(*) as c FROM election'
    };
    const entries = await Promise.all(Object.entries(mapQueries).map(async ([k, q]) => {
        try {
            const rows = await safeQuery(q);
            const raw = rows[0]?.c;
            const num = Number(raw);
            return [k, Number.isFinite(num) ? num : 0];
        } catch {
            return [k, 0];
        }
    }));
    return Object.fromEntries(entries);
}

module.exports = {
    getBasicCounts,
    getExtendedCounts
};
