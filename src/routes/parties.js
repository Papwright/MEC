const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Helper
async function safeQuery(sql, params = []) {
    const [rows] = await db.promise().query(sql, params);
    return rows;
}

// GET /api/parties/dashboard
// Optional filters: electionId, positionId
router.get('/dashboard', async (req, res) => {
    try {
        const { electionId, positionId } = req.query;
        const filters = [];
        const params = [];
        if (electionId) { filters.push('c.ElectionID = ?'); params.push(parseInt(electionId)); }
        if (positionId) { filters.push('c.PositionID = ?'); params.push(parseInt(positionId)); }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

        
        const sql = `
            WITH candidate_votes AS (
                SELECT c.CandidateID, c.PartyName, COUNT(v.VoteID) AS VoteCount
                FROM Candidate c
                LEFT JOIN Vote v ON v.CandidateID = c.CandidateID
                ${where}
                GROUP BY c.CandidateID, c.PartyName
            ), party_agg AS (
                SELECT pp.PartyName, pp.Symbol,
                       COUNT(DISTINCT cv.CandidateID) AS TotalCandidates,
                       COALESCE(SUM(cv.VoteCount), 0) AS TotalVotes,
                       COALESCE(AVG(cv.VoteCount), 0) AS AvgVotes
                FROM PoliticalParty pp
                LEFT JOIN candidate_votes cv ON pp.PartyName = cv.PartyName
                GROUP BY pp.PartyName, pp.Symbol
            ), winners AS (
                SELECT DISTINCT c.CandidateID, c.PartyName
                FROM FinalWinners fw
                JOIN Candidate c ON c.CandidateID = fw.CandidateID
                ${where}
            ), winner_agg AS (
                SELECT w.PartyName, COUNT(*) AS Winners
                FROM winners w
                GROUP BY w.PartyName
            )
            SELECT pa.PartyName, pa.Symbol, pa.TotalCandidates, pa.TotalVotes, pa.AvgVotes,
                   COALESCE(wa.Winners, 0) AS Winners
            FROM party_agg pa
            LEFT JOIN winner_agg wa ON pa.PartyName = wa.PartyName
            ORDER BY pa.TotalVotes DESC, pa.PartyName ASC`;

        const rows = await safeQuery(sql, params);
        const totalVotesAll = rows.reduce((sum, r) => sum + (Number(r.TotalVotes) || 0), 0);
        const totalWinnersAll = rows.reduce((sum, r) => sum + (Number(r.Winners) || 0), 0);

        const data = rows.map(r => {
            const tv = Number(r.TotalVotes) || 0;
            const w = Number(r.Winners) || 0;
            return {
                partyName: r.PartyName,
                symbol: r.Symbol,
                totalCandidates: Number(r.TotalCandidates) || 0,
                totalVotes: tv,
                averageVotesPerCandidate: Number(r.AvgVotes) ? +Number(r.AvgVotes).toFixed(2) : 0,
                winners: w,
                voteSharePercent: totalVotesAll ? +((tv / totalVotesAll) * 100).toFixed(2) : 0,
                seatSharePercent: totalWinnersAll ? +((w / totalWinnersAll) * 100).toFixed(2) : 0
            };
        });

        return res.json({ success: true, filters: { electionId, positionId }, totals: { totalVotesAll, totalWinnersAll }, data });
    } catch (error) {
        console.error('Party dashboard error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
