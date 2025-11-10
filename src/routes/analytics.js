const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Helper to run query safely
const safeQuery = async (sql, params = []) => {
    try {
        const [rows] = await db.promise().query(sql, params);
        return rows;
    } catch (error) {
        console.error('Analytics query failed:', error.message);
        throw error;
    }
};

// GET /api/analytics/overview
// Returns all requested analytics in one payload
router.get('/overview', async (req, res) => {
    try {
        // Optional date range filters (?from=YYYY-MM-DD&to=YYYY-MM-DD)
        const { from, to } = req.query;
        // Determine if the vote table has a date/time column we can use
        const voteColumns = await safeQuery('SHOW COLUMNS FROM vote');
        const datePrefList = ['CreatedAt', 'created_at', 'Timestamp', 'timestamp', 'VoteTime', 'vote_time', 'CastAt', 'Date', 'date'];
        const dateColumn = voteColumns.find(c => datePrefList.includes(c.Field))?.Field;
        let dateFilter = '';
        const dateParams = [];
        if (dateColumn) {
            if (from) { dateFilter += ` AND v.\`${dateColumn}\` >= ?`; dateParams.push(from); }
            if (to) { dateFilter += ` AND v.\`${dateColumn}\` <= ?`; dateParams.push(to); }
        }

        // 1) Gender-based unregistered voters
        const genderTotals = await safeQuery(`SELECT ec.Gender, COUNT(*) TotalEligible FROM EligibleCitizen ec GROUP BY ec.Gender`);
        const genderUnregistered = await safeQuery(`
            SELECT ec.Gender, COUNT(*) Unregistered
            FROM EligibleCitizen ec
            LEFT JOIN Voter v ON v.NationalID = ec.NationalID
            WHERE v.VoterID IS NULL
            GROUP BY ec.Gender`);
        const genderMap = {};
        genderTotals.forEach(r => genderMap[(r.Gender||'').toString()] = { total: Number(r.TotalEligible)||0, unregistered: 0 });
        genderUnregistered.forEach(r => {
            const key = (r.Gender||'').toString();
            if(!genderMap[key]) genderMap[key] = { total:0, unregistered:0};
            genderMap[key].unregistered = Number(r.Unregistered)||0;
        });
        const unregisteredByGender = Object.entries(genderMap).map(([g, s]) => ({
            gender: g,
            totalEligible: s.total,
            unregistered: s.unregistered,
            percentUnregistered: s.total ? +(100*s.unregistered/s.total).toFixed(2):0
        }));

        // 2) Candidate registration status
        const totalCandidates = (await safeQuery('SELECT COUNT(*) Total FROM Candidate'))[0]?.Total || 0;
        const unregisteredCandidates = (await safeQuery(`
            SELECT COUNT(*) Unregistered FROM Candidate c
            LEFT JOIN Voter v ON v.NationalID = c.NationalID
            WHERE v.VoterID IS NULL`))[0]?.Unregistered || 0;
        const candidatesUnregistered = {
            totalCandidates,
            unregisteredCandidates,
            percentUnregistered: totalCandidates ? +(100*unregisteredCandidates/totalCandidates).toFixed(2):0
        };

        // 3) Null & Void per ward using join-based ward resolution (CandidateID=0 OR duplicate voter/position)
    
        await ensureDuplicateIndex();
        const nullVoidByWard = await safeQuery(`
            SELECT 
                COALESCE(w.WardID, 'UNKNOWN') AS WardID,
                COALESCE(w.Name, '') AS WardName,
                SUM(CASE WHEN (v.CandidateID = 0 OR dup.VoterID IS NOT NULL) THEN 1 ELSE 0 END) AS NullVoidVotes,
                COUNT(*) AS TotalVotes,
                ROUND(100 * SUM(CASE WHEN (v.CandidateID = 0 OR dup.VoterID IS NOT NULL) THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS Percentage
            FROM vote v
            LEFT JOIN (
                SELECT VoterID, PositionID
                FROM vote
                GROUP BY VoterID, PositionID
                HAVING COUNT(*) > 1
            ) dup ON dup.VoterID = v.VoterID AND dup.PositionID = v.PositionID
            LEFT JOIN Voter vt ON vt.VoterID = v.VoterID
            LEFT JOIN PollingStation ps ON vt.StationID = ps.StationID
            LEFT JOIN Ward w ON ps.WardID = w.WardID
            WHERE 1=1 ${dateFilter}
            GROUP BY WardID, WardName
            HAVING NullVoidVotes > 0
            ORDER BY Percentage DESC`, dateParams);
        const nullVoidTransformed = nullVoidByWard.map(r => ({
            wardId: r.WardID,
            wardName: r.WardName,
            nullVoidVotes: Number(r.NullVoidVotes)||0,
            totalVotes: Number(r.TotalVotes)||0,
            percentNullVoid: Number(r.Percentage)||0
        }));

        // 4) Voter->Candidate gender alignment (same-gender voting)
        const sameGenderRows = await safeQuery(`
            SELECT 
                v_g.VoterGender,
                COUNT(*) AS TotalVotes,
                SUM(CASE 
                    WHEN v_g.VoterGender = c_g.CandidateGender 
                    THEN 1 ELSE 0 
                END) AS SameGenderVotes,
                ROUND(
                    100.0 * SUM(CASE 
                                   WHEN v_g.VoterGender = c_g.CandidateGender 
                                   THEN 1 ELSE 0 END) / COUNT(*), 2
                ) AS PercentageAlignedVotes
            FROM (
                -- voter gender
                SELECT vt.VoteID, vt.CandidateID, e.Gender AS VoterGender
                FROM vote vt
                JOIN voter vr ON vt.VoterID = vr.VoterID
                JOIN eligiblecitizen e ON vr.NationalID = e.NationalID
            ) v_g
            JOIN (
                -- candidate gender
                SELECT c.CandidateID, e.Gender AS CandidateGender
                FROM candidate c
                JOIN eligiblecitizen e ON c.NationalID = e.NationalID
            ) c_g ON v_g.CandidateID = c_g.CandidateID
            GROUP BY v_g.VoterGender`);
        
        const voterCandidateSameGender = sameGenderRows.map(r => ({
            voterGender: r.VoterGender || '',
            totalVotesByVoterGender: Number(r.TotalVotes) || 0,
            sameGenderVotes: Number(r.SameGenderVotes) || 0,
            percentSameGender: Number(r.PercentageAlignedVotes) || 0
        }));

        return res.json({
            success: true,
            data: {
                unregisteredByGender,
                candidatesUnregistered,
                nullVoidByWard: nullVoidTransformed,
                voterCandidateSameGender
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Dedicated endpoint just for null & void votes using the provided query
router.get('/null-void', async (req, res) => {
    try {
        const { from, to } = req.query;
        const voteColumns = await safeQuery('SHOW COLUMNS FROM vote');
        const datePrefList = ['CreatedAt', 'created_at', 'Timestamp', 'timestamp', 'VoteTime', 'vote_time', 'CastAt', 'Date', 'date'];
        const dateColumn = voteColumns.find(c => datePrefList.includes(c.Field))?.Field;
        let dateFilter = '';
        const params = [];
        if (dateColumn) {
            if (from) { dateFilter += ` AND v.\`${dateColumn}\` >= ?`; params.push(from); }
            if (to) { dateFilter += ` AND v.\`${dateColumn}\` <= ?`; params.push(to); }
        }
        await ensureDuplicateIndex();
        const rows = await safeQuery(`
            SELECT 
                COALESCE(w.WardID, 'UNKNOWN') AS WardID,
                COALESCE(w.Name, '') AS WardName,
                SUM(CASE WHEN (v.CandidateID = 0 OR dup.VoterID IS NOT NULL) THEN 1 ELSE 0 END) AS NullVoidVotes,
                COUNT(*) AS TotalVotes,
                ROUND(100 * SUM(CASE WHEN (v.CandidateID = 0 OR dup.VoterID IS NOT NULL) THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS Percentage
            FROM vote v
            LEFT JOIN (
                SELECT VoterID, PositionID
                FROM vote
                GROUP BY VoterID, PositionID
                HAVING COUNT(*) > 1
            ) dup ON dup.VoterID = v.VoterID AND dup.PositionID = v.PositionID
            LEFT JOIN Voter vt ON vt.VoterID = v.VoterID
            LEFT JOIN PollingStation ps ON vt.StationID = ps.StationID
            LEFT JOIN Ward w ON ps.WardID = w.WardID
            WHERE 1=1 ${dateFilter}
            GROUP BY WardID, WardName
            HAVING NullVoidVotes > 0
            ORDER BY Percentage DESC`, params);
        return res.json({ success: true, data: rows });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ----- Internal helper: ensure index on (VoterID, PositionID) for efficient duplicate detection -----
let duplicateIndexChecked = false;
async function ensureDuplicateIndex() {
    if (duplicateIndexChecked) return;
    try {
        const existing = await safeQuery('SHOW INDEX FROM vote WHERE Key_name = "idx_vote_voter_position"');
        if (!existing || existing.length === 0) {
            // Try create (ignore failure for permissions / existence race)
            await db.promise().query('ALTER TABLE vote ADD INDEX idx_vote_voter_position (VoterID, PositionID)');
            console.log('Created index idx_vote_voter_position on vote(VoterID, PositionID)');
        }
    } catch (err) {
        console.warn('Index creation skipped:', err.message);
    } finally {
        duplicateIndexChecked = true;
    }
}

module.exports = router;


