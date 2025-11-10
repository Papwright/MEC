const express = require('express');
const router = express.Router();
const db = require('../config/database');
const errorHandler = require('../middleware/errorHandler');

// Consolidated lightweight stats now moved to /api/dashboard
// Removed duplicate /dashboard and individual count endpoints.

// Test database connection
router.get('/test', async (req, res) => {
    try {
        const [result] = await db.promise().query('SELECT 1 as test');
        res.json({ 
            success: true, 
            message: 'Database connection successful', 
            test: result[0].test
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get live results with filtering
router.get('/live', async (req, res) => {
    try {
        const { position = 'all', constituency = 'all', ward = 'all' } = req.query;
        
        let positionFilter = '';
        let locationFilter = '';
        let params = [];
        
        if (position !== 'all' && ['PRES', 'MP', 'COUNC'].includes(position.toUpperCase())) {
            positionFilter = `AND p.PositionID = ?`;
            params.push(position.toUpperCase());
        } else {
            positionFilter = "AND p.PositionID IN ('PRES', 'MP', 'COUNC')";
        }

        if (constituency !== 'all' && position === 'MP') {
            locationFilter = `AND c.ConstituencyID = ?`;
            params.push(constituency);
        }

        if (ward !== 'all' && position === 'COUNC') {
            locationFilter = `AND c.WardID = ?`;
            params.push(ward);
        }

        const query = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                c.CandidateID,
                CONCAT(COALESCE(ec.FName, ''), 
                       CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                       CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as CandidateName,
                COALESCE(pp.PartyName, '') as PartyName,
                COALESCE(pp.Symbol, '') as Symbol,
                COALESCE(COUNT(v.VoteID), 0) as VoteCount,
                COALESCE(w.Name, '') as WardName,
                COALESCE(cst.Name, '') as ConstituencyName,
                COALESCE(d.DistrictName, '') as DistrictName,
                COALESCE(d.Region, '') as Region
            FROM candidate c
            JOIN positions p ON c.PositionID = p.PositionID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            LEFT JOIN ward w ON c.WardID = w.WardID
            LEFT JOIN constituency cst ON c.ConstituencyID = cst.ConstituencyID
            LEFT JOIN district d ON cst.DistrictID = d.DistrictID
            WHERE 1=1 ${positionFilter} ${locationFilter}
            GROUP BY c.CandidateID, p.PositionID, p.Title, ec.FName, ec.MName, ec.SName, pp.PartyName, pp.Symbol, w.Name, cst.Name, d.DistrictName, d.Region
            ORDER BY p.PositionID, VoteCount DESC
        `;
        
        const [results] = await db.promise().query(query, params);
        res.json({
            success: true,
            data: results,
            count: results.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get winners only - optimized query with ward/constituency filters
router.get('/winners', async (req, res) => {
    try {
        // Accept ?position=PRES|MP|COUNC|ALL (default ALL)
        const { position = 'ALL', constituency = 'all', ward = 'all' } = req.query;
        const positionUpper = position.toUpperCase();
        
        let positionFilter = '';
        let locationFilter = '';
        let params = [];
        
        if (positionUpper === 'ALL') {
            positionFilter = "AND p.PositionID IN ('PRES', 'MP', 'COUNC')";
        } else if (["PRES", "MP", "COUNC"].includes(positionUpper)) {
            positionFilter = `AND p.PositionID = ?`;
            params.push(positionUpper);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid position parameter' });
        }

        if (constituency !== 'all' && positionUpper === 'MP') {
            locationFilter = `AND c.ConstituencyID = ?`;
            params.push(constituency);
        }

        if (ward !== 'all' && positionUpper === 'COUNC') {
            locationFilter = `AND c.WardID = ?`;
            params.push(ward);
        }

        // Optimized query with better indexing and reduced joins
        const query = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                c.CandidateID,
                CONCAT(COALESCE(ec.FName, ''), 
                       CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                       CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as WinnerName,
                COALESCE(pp.PartyName, '') as PartyName,
                COALESCE(pp.Symbol, '') as Symbol,
                vote_counts.TotalVotes,
                COALESCE(w.Name, '') as WardName,
                COALESCE(cst.Name, '') as ConstituencyName,
                COALESCE(d.DistrictName, '') as DistrictName,
                COALESCE(d.Region, '') as Region
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) as TotalVotes,
                    ROW_NUMBER() OVER (PARTITION BY v.PositionID ORDER BY COUNT(*) DESC) as rn
                FROM vote v
                WHERE 1=1
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN candidate c ON vote_counts.CandidateID = c.CandidateID AND vote_counts.PositionID = c.PositionID
            JOIN positions p ON c.PositionID = p.PositionID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN ward w ON c.WardID = w.WardID
            LEFT JOIN constituency cst ON c.ConstituencyID = cst.ConstituencyID
            LEFT JOIN district d ON cst.DistrictID = d.DistrictID
            WHERE vote_counts.rn = 1 ${positionFilter} ${locationFilter}
            ORDER BY p.PositionID, vote_counts.TotalVotes DESC
        `;
        
        const [results] = await db.promise().query(query, params);
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get summary statistics - using actual Vote table data
router.get('/summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                COUNT(DISTINCT c.CandidateID) as CandidateCount,
                COALESCE(COUNT(v.VoteID), 0) as TotalVotes
            FROM Positions p
            LEFT JOIN Candidate c ON p.PositionID = c.PositionID
            LEFT JOIN Vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            WHERE p.PositionID IN ('PRES', 'MP', 'COUNC')
            GROUP BY p.PositionID, p.Title
            ORDER BY p.PositionID
        `;
        const [results] = await db.promise().query(query);
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get all registered voters
router.get('/voters', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.VoterID,
                v.NationalID,
                CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as FullName,
                ps.Name as StationName,
                w.Name as WardName,
                cst.Name as ConstituencyName,
                d.DistrictName,
                d.Region
            FROM Voter v
            LEFT JOIN EligibleCitizen ec ON v.NationalID = ec.NationalID
            LEFT JOIN PollingStation ps ON v.StationID = ps.StationID
            LEFT JOIN Ward w ON ps.WardID = w.WardID
            LEFT JOIN Constituency cst ON w.ConstituencyID = cst.ConstituencyID
            LEFT JOIN District d ON cst.DistrictID = d.DistrictID
            ORDER BY ec.SName, ec.FName
        `;

        const [results] = await db.promise().query(query);
        
        res.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get all registered candidates - using actual Vote table data
router.get('/candidates', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.CandidateID,
                c.NationalID,
                CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as FullName,
                p.Title as PositionTitle,
                pp.PartyName,
                pp.Symbol,
                w.Name as WardName,
                cst.Name as ConstituencyName,
                d.DistrictName,
                d.Region,
                COALESCE(COUNT(v.VoteID), 0) as VoteCount
            FROM Candidate c
            LEFT JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN Positions p ON c.PositionID = p.PositionID
            LEFT JOIN PoliticalParty pp ON c.PartyName = pp.PartyName
            LEFT JOIN Ward w ON c.WardID = w.WardID
            LEFT JOIN Constituency cst ON c.ConstituencyID = cst.ConstituencyID
            LEFT JOIN District d ON cst.DistrictID = d.DistrictID
            LEFT JOIN Vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            GROUP BY c.CandidateID, c.NationalID, ec.FName, ec.MName, ec.SName, p.Title, pp.PartyName, pp.Symbol, w.Name, cst.Name, d.DistrictName, d.Region
            ORDER BY p.PositionID
        `;
        const [results] = await db.promise().query(query);
        res.json({
            success: true,
            data: results,
            count: results.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Enhanced chart data endpoint with filtering
router.get('/charts', async (req, res) => {
    try {
        const { position = 'all' } = req.query;
        
        // Get results data with filtering
        let positionFilter = '';
        if (position !== 'all' && ['PRES', 'MP', 'COUNC'].includes(position.toUpperCase())) {
            positionFilter = `WHERE r.PositionID = '${position.toUpperCase()}'`;
        } else {
            positionFilter = "WHERE r.PositionID IN ('PRES', 'MP', 'COUNC')";
        }

        const query = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                c.CandidateID,
                CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as CandidateName,
                pp.PartyName,
                pp.Symbol,
                COALESCE(COUNT(v.VoteID), 0) as VoteCount,
                w.Name as WardName,
                cst.Name as ConstituencyName,
                d.DistrictName,
                d.Region
            FROM candidate c
            JOIN positions p ON c.PositionID = p.PositionID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            LEFT JOIN ward w ON c.WardID = w.WardID
            LEFT JOIN constituency cst ON c.ConstituencyID = cst.ConstituencyID
            LEFT JOIN District d ON cst.DistrictID = d.DistrictID
            ${positionFilter.replace('WHERE r.PositionID', 'WHERE p.PositionID')}
            GROUP BY c.CandidateID, p.PositionID, p.Title, ec.FName, ec.MName, ec.SName, pp.PartyName, pp.Symbol, w.Name, cst.Name, d.DistrictName, d.Region
            ORDER BY p.PositionID, VoteCount DESC
        `;
        
        const [results] = await db.promise().query(query);
        
        // Group results by position for easier chart rendering
        const groupedResults = results.reduce((acc, result) => {
            if (!acc[result.PositionID]) {
                acc[result.PositionID] = [];
            }
            acc[result.PositionID].push(result);
            return acc;
        }, {});
        
        // Get summary statistics - using actual Vote table data
        const summaryQuery = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                COUNT(DISTINCT c.CandidateID) as CandidateCount,
                COALESCE(COUNT(v.VoteID), 0) as TotalVotes
            FROM Positions p
            LEFT JOIN Candidate c ON p.PositionID = c.PositionID
            LEFT JOIN Vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            WHERE p.PositionID IN ('PRES', 'MP', 'COUNC')
            ${position !== 'all' && ['PRES', 'MP', 'COUNC'].includes(position.toUpperCase()) ? `AND p.PositionID = '${position.toUpperCase()}'` : ''}
            GROUP BY p.PositionID, p.Title
            ORDER BY p.PositionID
        `;
        
        const [summary] = await db.promise().query(summaryQuery);
        
        res.json({
            success: true,
            data: {
                results: groupedResults,
                summary: summary,
                filter: position
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get top candidates by position with ward/constituency filters
router.get('/top-candidates', async (req, res) => {
    try {
        const { position = 'all', limit = 10, constituency = 'all', ward = 'all' } = req.query;
        
        let positionFilter = '';
        let locationFilter = '';
        let params = [];
        
        if (position !== 'all' && ['PRES', 'MP', 'COUNC'].includes(position.toUpperCase())) {
            positionFilter = `AND p.PositionID = ?`;
            params.push(position.toUpperCase());
        } else {
            positionFilter = "AND p.PositionID IN ('PRES', 'MP', 'COUNC')";
        }

        if (constituency !== 'all' && position === 'MP') {
            locationFilter = `AND c.ConstituencyID = ?`;
            params.push(constituency);
        }

        if (ward !== 'all' && position === 'COUNC') {
            locationFilter = `AND c.WardID = ?`;
            params.push(ward);
        }

        const query = `
            SELECT 
                p.PositionID,
                p.Title as PositionTitle,
                CONCAT(COALESCE(ec.FName, ''), 
                       CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                       CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as CandidateName,
                COALESCE(pp.PartyName, '') as PartyName,
                COALESCE(pp.Symbol, '') as Symbol,
                COALESCE(COUNT(v.VoteID), 0) as TotalVotes,
                COALESCE(w.Name, '') as WardName,
                COALESCE(con.Name, '') as ConstituencyName,
                COALESCE(d.DistrictName, '') as DistrictName
            FROM candidate c
            JOIN positions p ON c.PositionID = p.PositionID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            LEFT JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID AND c.PositionID = v.PositionID
            LEFT JOIN ward w ON c.WardID = w.WardID
            LEFT JOIN constituency con ON c.ConstituencyID = con.ConstituencyID
            LEFT JOIN district d ON con.DistrictID = d.DistrictID
            WHERE 1=1 ${positionFilter} ${locationFilter}
            GROUP BY c.CandidateID, p.PositionID, p.Title, ec.FName, ec.MName, ec.SName, pp.PartyName, pp.Symbol, w.Name, con.Name, d.DistrictName
            ORDER BY p.PositionID, TotalVotes DESC
            LIMIT ?
        `;
        
        params.push(parseInt(limit));
        const [results] = await db.promise().query(query, params);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Removed second duplicate /dashboard endpoint. Use /api/dashboard instead.

// Get party performance statistics
router.get('/party-stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                pp.PartyName,
                pp.Symbol,
                COUNT(DISTINCT c.CandidateID) as TotalCandidates,
                COALESCE(COUNT(v.VoteID), 0) as TotalVotes,
                COALESCE(AVG(vote_counts.VoteCount), 0) as AvgVotes,
                COUNT(DISTINCT CASE WHEN fw.CandidateID IS NOT NULL THEN c.CandidateID END) as Winners
            FROM PoliticalParty pp
            LEFT JOIN Candidate c ON pp.PartyName = c.PartyName
            LEFT JOIN Vote v ON c.CandidateID = v.CandidateID
            LEFT JOIN FinalWinners fw ON c.CandidateID = fw.CandidateID
            LEFT JOIN (
                SELECT CandidateID, COUNT(*) as VoteCount 
                FROM Vote 
                GROUP BY CandidateID
            ) vote_counts ON c.CandidateID = vote_counts.CandidateID
            GROUP BY pp.PartyName, pp.Symbol
            HAVING TotalCandidates > 0
            ORDER BY TotalVotes DESC
        `;
        
        const [results] = await db.promise().query(query);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;