const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get public statistics for home page (no authentication required)
router.get('/public-stats', async (req, res) => {
    try {
        // Total registered voters
        const [voterCount] = await db.promise().query('SELECT COUNT(*) as count FROM voter');
        
        // Total votes cast
        const [voteCount] = await db.promise().query('SELECT COUNT(*) as count FROM vote');
        
        // Total candidates
        const [candidateCount] = await db.promise().query('SELECT COUNT(*) as count FROM candidate');
        
        // Get unique voters who have voted (for turnout calculation)
        const [votersWhoVoted] = await db.promise().query('SELECT COUNT(DISTINCT VoterID) as count FROM vote');
        
        // Voter turnout percentage - (voters who voted / total registered voters) × 100
        const turnoutPercentage = voterCount[0].count > 0 ? 
            ((votersWhoVoted[0].count / voterCount[0].count) * 100).toFixed(2) : 0;

        res.json({
            success: true,
            stats: {
                totalVoters: voterCount[0].count,
                totalVotes: voteCount[0].count,
                totalCandidates: candidateCount[0].count,
                turnoutPercentage: turnoutPercentage
            }
        });

    } catch (error) {
        console.error('Error fetching public stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get real-time results for all positions
router.get('/live', async (req, res) => {
    try {
        const [results] = await db.promise().query(`
            SELECT p.PositionID, p.Title as PositionTitle,
                   c.CandidateID, ec.FName, ec.SName,
                   pp.PartyName, pp.Symbol,
                   COUNT(v.VoteID) as voteCount,
                   ps.Name as StationName
            FROM positions p
            LEFT JOIN candidate c ON p.PositionID = c.PositionID
            LEFT JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID
            LEFT JOIN pollingstation ps ON c.StationID = ps.StationID
            GROUP BY p.PositionID, p.Title, c.CandidateID, ec.FName, ec.SName, pp.PartyName, pp.Symbol, ps.Name
            ORDER BY p.PositionID, voteCount DESC
        `);

        // Group results by position
        const groupedResults = {};
        results.forEach(result => {
            if (!groupedResults[result.PositionID]) {
                groupedResults[result.PositionID] = {
                    positionTitle: result.PositionTitle,
                    candidates: []
                };
            }
            
            if (result.CandidateID) {
                groupedResults[result.PositionID].candidates.push({
                    candidateId: result.CandidateID,
                    name: `${result.FName} ${result.SName}`,
                    party: result.PartyName,
                    symbol: result.Symbol,
                    voteCount: result.voteCount,
                    stationName: result.StationName
                });
            }
        });

        res.json({
            success: true,
            results: groupedResults
        });

    } catch (error) {
        console.error('Error fetching live results:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// Get results for a specific position
router.get('/position/:positionId', async (req, res) => {
    try {
        const { positionId } = req.params;

        const [results] = await db.promise().query(`
            SELECT c.CandidateID, ec.FName, ec.MName, ec.SName,
                   pp.PartyName, pp.Symbol,
                   COUNT(v.VoteID) as voteCount,
                   ps.Name as StationName
            FROM candidate c
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID
            LEFT JOIN pollingstation ps ON c.StationID = ps.StationID
            WHERE c.PositionID = ?
            GROUP BY c.CandidateID, ec.FName, ec.MName, ec.SName, pp.PartyName, pp.Symbol, ps.Name
            ORDER BY voteCount DESC
        `, [positionId]);

        // Calculate total votes for this position
        const totalVotes = results.reduce((sum, result) => sum + result.voteCount, 0);

        // Calculate percentages
        const resultsWithPercentages = results.map(result => ({
            ...result,
            percentage: totalVotes > 0 ? ((result.voteCount / totalVotes) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            positionId: positionId,
            totalVotes: totalVotes,
            results: resultsWithPercentages
        });

    } catch (error) {
        console.error('Error fetching position results:', error);
        res.status(500).json({ error: 'Failed to fetch position results' });
    }
});

// Get results by polling station
router.get('/station/:stationId', async (req, res) => {
    try {
        const { stationId } = req.params;

        const [results] = await db.promise().query(`
            SELECT p.PositionID, p.Title as PositionTitle,
                   c.CandidateID, ec.FName, ec.MName, ec.SName,
                   pp.PartyName, pp.Symbol,
                   COUNT(v.VoteID) as voteCount
            FROM positions p
            LEFT JOIN candidate c ON p.PositionID = c.PositionID
            LEFT JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID AND v.StationID = ?
            WHERE (c.StationID = ? OR p.PositionID IN ('POS001', 'POS002')) -- National positions or station-specific
            GROUP BY p.PositionID, p.Title, c.CandidateID, ec.FName, ec.MName, ec.SName, pp.PartyName, pp.Symbol
            ORDER BY p.PositionID, voteCount DESC
        `, [stationId, stationId]);

        // Group by position
        const groupedResults = {};
        results.forEach(result => {
            if (!groupedResults[result.PositionID]) {
                groupedResults[result.PositionID] = {
                    positionTitle: result.PositionTitle,
                    candidates: []
                };
            }
            
            if (result.CandidateID) {
                groupedResults[result.PositionID].candidates.push({
                    candidateId: result.CandidateID,
                    name: `${result.FName} ${result.MName || ''} ${result.SName}`,
                    party: result.PartyName,
                    symbol: result.Symbol,
                    voteCount: result.voteCount
                });
            }
        });

        res.json({
            success: true,
            stationId: stationId,
            results: groupedResults
        });

    } catch (error) {
        console.error('Error fetching station results:', error);
        res.status(500).json({ error: 'Failed to fetch station results' });
    }
});

// Get national summary results
router.get('/national-summary', async (req, res) => {
    try {
        // Get total registered voters
        const [voterCount] = await db.promise().query('SELECT COUNT(*) as count FROM voter');
        
        // Get total votes cast
        const [voteCount] = await db.promise().query('SELECT COUNT(*) as count FROM vote');
        
        // Get results by position
        const [positionResults] = await db.promise().query(`
            SELECT p.PositionID, p.Title,
                   COUNT(DISTINCT c.CandidateID) as candidateCount,
                   COUNT(v.VoteID) as totalVotes
            FROM positions p
            LEFT JOIN candidate c ON p.PositionID = c.PositionID
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID
            GROUP BY p.PositionID, p.Title
            ORDER BY p.PositionID
        `);

        // Get unique voters who have voted (for turnout calculation)
        const [votersWhoVoted] = await db.promise().query('SELECT COUNT(DISTINCT VoterID) as count FROM vote');
        
        // Calculate turnout percentage - (voters who voted / total registered voters) × 100
        const turnoutPercentage = voterCount[0].count > 0 ? 
            ((votersWhoVoted[0].count / voterCount[0].count) * 100).toFixed(2) : 0;

        // Calculate total possible votes (3 positions per voter)
        const totalPossibleVotes = voterCount[0].count * 3;

        res.json({
            success: true,
            summary: {
                totalRegisteredVoters: voterCount[0].count,
                totalVotesCast: voteCount[0].count,
                totalPossibleVotes: totalPossibleVotes,
                turnoutPercentage: turnoutPercentage,
                positions: positionResults
            }
        });

    } catch (error) {
        console.error('Error fetching national summary:', error);
        res.status(500).json({ error: 'Failed to fetch national summary' });
    }
});

// Get winner for each position from finalwinner table
router.get('/winners', async (req, res) => {
    try {
        const [winners] = await db.promise().query(`
            SELECT fw.PositionID, p.Title as PositionTitle,
                   fw.CandidateID, fw.WinnerName, fw.PartyName,
                   fw.VoteCount, fw.LastUpdated
            FROM finalwinner fw
            JOIN positions p ON fw.PositionID = p.PositionID
            ORDER BY fw.PositionID
        `);

        res.json({
            success: true,
            winners: winners
        });

    } catch (error) {
        console.error('Error fetching winners:', error);
        res.status(500).json({ error: 'Failed to fetch winners' });
    }
});

// Get candidate results from candidateresult table
router.get('/candidate-results/:positionId', async (req, res) => {
    try {
        const { positionId } = req.params;

        const [results] = await db.promise().query(`
            SELECT cr.CandidateID, cr.PositionID, cr.VoteCount, cr.LastUpdated,
                   ec.FName, ec.SName, pp.PartyName, pp.Symbol
            FROM candidateresult cr
            JOIN candidate c ON cr.CandidateID = c.CandidateID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            WHERE cr.PositionID = ?
            ORDER BY cr.VoteCount DESC
        `, [positionId]);

        res.json({
            success: true,
            positionId: positionId,
            results: results
        });

    } catch (error) {
        console.error('Error fetching candidate results:', error);
        res.status(500).json({ error: 'Failed to fetch candidate results' });
    }
});

// Get all candidate results
router.get('/candidate-results', async (req, res) => {
    try {
        const [results] = await db.promise().query(`
            SELECT cr.CandidateID, cr.PositionID, cr.VoteCount, cr.LastUpdated,
                   p.Title as PositionTitle,
                   ec.FName, ec.SName, pp.PartyName, pp.Symbol
            FROM candidateresult cr
            JOIN candidate c ON cr.CandidateID = c.CandidateID
            JOIN positions p ON cr.PositionID = p.PositionID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            ORDER BY cr.PositionID, cr.VoteCount DESC
        `);

        res.json({
            success: true,
            results: results
        });

    } catch (error) {
        console.error('Error fetching all candidate results:', error);
        res.status(500).json({ error: 'Failed to fetch candidate results' });
    }
});

module.exports = router;
