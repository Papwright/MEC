const express = require('express');
const router = express.Router();
const db = require('../config/database');
const errorHandler = require('../middleware/errorHandler');
const validation = require('../middleware/validation');
const cache = require('../middleware/cache');

// Reuse centralized sanitizer instead of local inline version
const validateInput = validation.sanitizeInput.bind(validation);

// Dashboard statistics
router.get('/dashboard', 
    errorHandler.asyncHandler(async (req, res) => {
    try {
        const [stats] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM Voter) as totalVoters,
                (SELECT COUNT(*) FROM Candidate) as totalCandidates,
                (SELECT COUNT(*) FROM Vote) as totalVotes,
                (SELECT COUNT(*) FROM Results) as totalResults,
                (SELECT COUNT(*) FROM District) as totalDistricts,
                (SELECT COUNT(*) FROM Constituency) as totalConstituencies,
                (SELECT COUNT(*) FROM Ward) as totalWards,
                (SELECT COUNT(*) FROM PollingStation) as totalStations,
                (SELECT COUNT(*) FROM PoliticalParty) as totalParties
        `);

        const [recentActivity] = await db.promise().query(`
            SELECT 
                'vote' as type,
                COUNT(*) as count,
                DATE(NOW()) as date
            FROM Vote 
            WHERE 1=1
            GROUP BY DATE(NOW())
            ORDER BY date DESC
            LIMIT 7
        `);

        res.json({
            success: true,
            data: {
                statistics: stats && stats[0] ? stats[0] : {},
                recentActivity: recentActivity || []
            }
        });
    } catch (error) {
        throw error;
    }
}));

// Voter Management
router.get('/voters', 
    errorHandler.asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    let whereClause = '';
    let params = [];
    
    if (search) {
        whereClause = `WHERE CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) LIKE ? OR v.NationalID LIKE ?`;
        params = [`%${search}%`, `%${search}%`];
    }

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
            ${whereClause}
            ORDER BY ec.SName, ec.FName
            LIMIT ? OFFSET ?
        `;

        const [voters] = await db.promise().query(query, [...params, limitNum, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total 
            FROM Voter v
            LEFT JOIN EligibleCitizen ec ON v.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        return res.json({
            success: true,
            data: voters,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        try {
            // Fallback: simplified query to avoid schema-specific joins
            const [fallbackRows] = await db.promise().query(
                'SELECT VoterID, NationalID FROM Voter ORDER BY VoterID DESC LIMIT ? OFFSET ?',
                [isNaN(limitNum) ? 20 : limitNum, isNaN(offset) ? 0 : offset]
            );
            const [fallbackCount] = await db.promise().query('SELECT COUNT(*) as total FROM Voter');
            return res.json({
                success: true,
                data: fallbackRows,
                pagination: {
                    page: isNaN(pageNum) ? 1 : pageNum,
                    limit: isNaN(limitNum) ? 20 : limitNum,
                    total: fallbackCount && fallbackCount[0] ? fallbackCount[0].total : fallbackRows.length,
                    pages: Math.ceil((fallbackCount && fallbackCount[0] ? fallbackCount[0].total : fallbackRows.length) / (isNaN(limitNum) ? 20 : limitNum))
                },
                warning: 'Showing limited voter fields due to missing joins or schema differences.'
            });
        } catch (innerErr) {
            // Last resort: return empty but successful response to keep UI working
            return res.json({
                success: true,
                data: [],
                pagination: {
                    page: isNaN(pageNum) ? 1 : pageNum,
                    limit: isNaN(limitNum) ? 20 : limitNum,
                    total: 0,
                    pages: 0
                },
                warning: 'Voter table not available yet. Please run migrations/seed.'
            });
        }
    }
}));

router.post('/voters', 
    validateInput,
    errorHandler.asyncHandler(async (req, res) => {
    const { nationalId, stationId } = req.body;
    
    if (!nationalId || !stationId) {
        throw errorHandler.ValidationError('National ID and Station ID are required');
    }

    // Ensure citizen exists in EligibleCitizen
    const [citizen] = await db.promise().query('SELECT NationalID FROM EligibleCitizen WHERE NationalID = ?', [nationalId]);
    if (citizen.length === 0) {
        throw errorHandler.ValidationError('Citizen not found in eligible citizens list');
    }

    // Check if station exists
    const [station] = await db.promise().query('SELECT StationID FROM PollingStation WHERE StationID = ?', [stationId]);
    if (station.length === 0) {
        throw errorHandler.ValidationError('Polling station not found');
    }

    // Check if voter already exists
    const [existing] = await db.promise().query('SELECT VoterID FROM Voter WHERE NationalID = ?', [nationalId]);
    if (existing.length > 0) {
        throw errorHandler.ValidationError('Voter already registered');
    }

    const [result] = await db.promise().query(
        'INSERT INTO Voter (NationalID, StationID) VALUES (?, ?)',
        [nationalId, stationId]
    );

    // Invalidate related caches
    cache.clearPattern('general', '^voters:');
    cache.clearPattern('general', '^statistics:');

    res.json({
        success: true,
        data: { voterId: result.insertId },
        message: 'Voter registered successfully'
    });
}));

// Delete voter
router.delete('/voters/:id', errorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await db.promise().query('DELETE FROM Voter WHERE VoterID = ?', [parseInt(id)]);
    if (result.affectedRows === 0) {
        throw errorHandler.NotFoundError('Voter not found');
    }
    res.json({ success: true, message: 'Voter deleted' });
}));

// Update voter station
router.put('/voters/:id', errorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { stationId } = req.body;
    if (!stationId) throw errorHandler.ValidationError('Station ID is required');
    const [exists] = await db.promise().query('SELECT StationID FROM PollingStation WHERE StationID = ?', [stationId]);
    if (exists.length === 0) throw errorHandler.ValidationError('Polling station not found');
    const [result] = await db.promise().query('UPDATE Voter SET StationID = ? WHERE VoterID = ?', [stationId, parseInt(id)]);
    if (result.affectedRows === 0) throw errorHandler.NotFoundError('Voter not found');
    res.json({ success: true, message: 'Voter updated' });
}));

// Candidate Management
router.get('/candidates', errorHandler.asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, position = '', party = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    let whereClause = '';
    let params = [];
    
    const conditions = [];
    if (position) {
        conditions.push('c.PositionID = ?');
        params.push(position);
    }
    if (party) {
        conditions.push('c.PartyName = ?');
        params.push(party);
    }
    
    if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

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
            COALESCE(r.TotalVotes, 0) as VoteCount
        FROM Candidate c
        LEFT JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
        LEFT JOIN Positions p ON c.PositionID = p.PositionID
        LEFT JOIN PoliticalParty pp ON c.PartyName = pp.PartyName
        LEFT JOIN Ward w ON c.WardID = w.WardID
        LEFT JOIN Constituency cst ON c.ConstituencyID = cst.ConstituencyID
        LEFT JOIN District d ON cst.DistrictID = d.DistrictID
        LEFT JOIN Results r ON c.CandidateID = r.CandidateID AND r.PositionID = c.PositionID
        ${whereClause}
        ORDER BY p.PositionID, pp.PartyName, ec.SName
        LIMIT ? OFFSET ?
    `;

    const [candidates] = await db.promise().query(query, [...params, limitNum, offset]);
    const [countRows] = await db.promise().query(`
        SELECT COUNT(*) as total 
        FROM Candidate c
        ${whereClause}
    `, params);
    const total = countRows && countRows[0] ? countRows[0].total : 0;

    res.json({
        success: true,
        data: candidates,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            pages: Math.ceil(total / limitNum)
        }
    });
}));

router.post('/candidates', validateInput, errorHandler.asyncHandler(async (req, res) => {
    const { nationalId, positionId, partyName, wardId, constituencyId, electionId } = req.body;
    
    if (!nationalId || !positionId || !partyName || !electionId) {
        throw errorHandler.ValidationError('National ID, Position ID, Party Name and Election ID are required');
    }

    // Ensure citizen exists in EligibleCitizen
    const [citizen] = await db.promise().query('SELECT NationalID FROM EligibleCitizen WHERE NationalID = ?', [nationalId]);
    if (citizen.length === 0) {
        throw errorHandler.ValidationError('Citizen not found in eligible citizens list');
    }

    // Check duplicate candidate for same election and position
    const [dupCandidate] = await db.promise().query(
        'SELECT CandidateID FROM Candidate WHERE NationalID = ? AND PositionID = ? AND ElectionID = ?',
        [nationalId, positionId, parseInt(electionId)]
    );
    if (dupCandidate.length > 0) {
        throw errorHandler.ValidationError('Candidate already registered for this election and position');
    }

    // Validate position exists
    const [position] = await db.promise().query('SELECT PositionID FROM Positions WHERE PositionID = ?', [positionId]);
    if (position.length === 0) {
        throw errorHandler.ValidationError('Invalid position');
    }

    // Validate party exists
    const [party] = await db.promise().query('SELECT PartyName FROM PoliticalParty WHERE PartyName = ?', [partyName]);
    if (party.length === 0) {
        throw errorHandler.ValidationError('Political party not found');
    }

    // Validate ward if provided
    if (wardId) {
        const [ward] = await db.promise().query('SELECT WardID FROM Ward WHERE WardID = ?', [wardId]);
        if (ward.length === 0) {
            throw errorHandler.ValidationError('Invalid ward');
        }
    }

    // Validate constituency if provided
    if (constituencyId) {
        const [constituency] = await db.promise().query('SELECT ConstituencyID FROM Constituency WHERE ConstituencyID = ?', [constituencyId]);
        if (constituency.length === 0) {
            throw errorHandler.ValidationError('Invalid constituency');
        }
    }

    // Validate election exists
    const [election] = await db.promise().query('SELECT ElectionID FROM Election WHERE ElectionID = ?', [electionId]);
    if (election.length === 0) {
        throw errorHandler.ValidationError('Invalid election');
    }

    const [result] = await db.promise().query(
        'INSERT INTO Candidate (ElectionID, NationalID, PositionID, PartyName, WardID, ConstituencyID) VALUES (?, ?, ?, ?, ?, ?)',
        [parseInt(electionId), nationalId, positionId, partyName, wardId || null, constituencyId || null]
    );

    res.json({
        success: true,
        data: { candidateId: result.insertId },
        message: 'Candidate registered successfully'
    });
}));

// Delete candidate
router.delete('/candidates/:id', errorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [result] = await db.promise().query('DELETE FROM Candidate WHERE CandidateID = ?', [parseInt(id)]);
    if (result.affectedRows === 0) {
        throw errorHandler.NotFoundError('Candidate not found');
    }
    res.json({ success: true, message: 'Candidate deleted' });
}));

// Update candidate party or position
router.put('/candidates/:id', errorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { partyName, positionId } = req.body;
    if (!partyName && !positionId) throw errorHandler.ValidationError('Provide partyName or positionId to update');
    const fields = [];
    const params = [];
    if (partyName) { fields.push('PartyName = ?'); params.push(partyName); }
    if (positionId) { fields.push('PositionID = ?'); params.push(positionId); }
    params.push(parseInt(id));
    const [result] = await db.promise().query(`UPDATE Candidate SET ${fields.join(', ')} WHERE CandidateID = ?`, params);
    if (result.affectedRows === 0) throw errorHandler.NotFoundError('Candidate not found');
    res.json({ success: true, message: 'Candidate updated' });
}));

// Results Management
router.get('/results', errorHandler.asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, position = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    let params = [];
    
    if (position) {
        whereClause = 'WHERE r.PositionID = ?';
        params.push(position);
    }

    const query = `
        SELECT 
            r.ResultID,
            r.PositionID,
            p.Title as PositionTitle,
            c.CandidateID,
            CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as CandidateName,
            pp.PartyName,
            pp.Symbol,
            r.TotalVotes,
            w.Name as WardName,
            cst.Name as ConstituencyName,
            d.DistrictName,
            d.Region
        FROM Results r
        JOIN Positions p ON r.PositionID = p.PositionID
        JOIN Candidate c ON r.CandidateID = c.CandidateID
        JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
        JOIN PoliticalParty pp ON c.PartyName = pp.PartyName
        LEFT JOIN Ward w ON r.WardID = w.WardID
        LEFT JOIN Constituency cst ON r.ConstituencyID = cst.ConstituencyID
        LEFT JOIN District d ON cst.DistrictID = d.DistrictID
        ${whereClause}
        ORDER BY r.PositionID, r.TotalVotes DESC
        LIMIT ? OFFSET ?
    `;

    const [results] = await db.promise().query(query, [...params, parseInt(limit), parseInt(offset)]);
    const [[{ total }]] = await db.promise().query(`
        SELECT COUNT(*) as total 
        FROM Results r
        ${whereClause}
    `, params);

    res.json({
        success: true,
        data: results,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            pages: Math.ceil(total / limit)
        }
    });
}));

router.put('/results/:id', validateInput, errorHandler.asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { totalVotes } = req.body;
    
    if (totalVotes === undefined || totalVotes < 0) {
        throw errorHandler.ValidationError('Valid vote count is required');
    }

    const [result] = await db.promise().query(
        'UPDATE Results SET TotalVotes = ? WHERE ResultID = ?',
        [parseInt(totalVotes), parseInt(id)]
    );

    if (result.affectedRows === 0) {
        throw errorHandler.NotFoundError('Result not found');
    }

    res.json({
        success: true,
        message: 'Result updated successfully'
    });
}));

// Get all positions
router.get('/positions', errorHandler.asyncHandler(async (req, res) => {
    const [positions] = await db.promise().query('SELECT PositionID, Title FROM Positions ORDER BY PositionID');
    
    res.json({
        success: true,
        data: positions
    });
}));

// Get all parties
router.get('/parties', errorHandler.asyncHandler(async (req, res) => {
    const [parties] = await db.promise().query('SELECT PartyName, Symbol FROM PoliticalParty ORDER BY PartyName');
    
    res.json({
        success: true,
        data: parties
    });
}));

// Get all polling stations
router.get('/stations', errorHandler.asyncHandler(async (req, res) => {
    const [stations] = await db.promise().query(`
        SELECT 
            ps.StationID,
            ps.Name as StationName,
            w.Name as WardName,
            cst.Name as ConstituencyName,
            d.DistrictName,
            d.Region
        FROM PollingStation ps
        LEFT JOIN Ward w ON ps.WardID = w.WardID
        LEFT JOIN Constituency cst ON w.ConstituencyID = cst.ConstituencyID
        LEFT JOIN District d ON cst.DistrictID = d.DistrictID
        ORDER BY d.Region, d.DistrictName, ps.Name
    `);
    
    res.json({
        success: true,
        data: stations
    });
}));

// Generate and import final winners from Results into finalwinners table
// POST /api/admin/final-winners/generate?electionId=<id>
router.post('/final-winners/generate', errorHandler.asyncHandler(async (req, res) => {

    // Delete previous winners
    await db.promise().query('DELETE FROM finalwinners');

    // Use provided query to select winners
    const winnerQuery = `
        SELECT 
            p.PositionID,
            p.Title AS PositionTitle,
            c.CandidateID,
            CONCAT(ec.FName, ' ', IFNULL(ec.MName, ''), ' ', ec.SName) AS WinnerName,
            c.PartyName,
            c.ConstituencyID,
            c.WardID,
            COUNT(*) AS TotalVotes
        FROM vote v
        JOIN candidate c ON v.CandidateID = c.CandidateID
        JOIN positions p ON c.PositionID = p.PositionID
        JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
        WHERE v.CandidateID <> 0
          AND (v.VoterID, v.PositionID) NOT IN (
              SELECT VoterID, PositionID
              FROM vote
              WHERE CandidateID <> 0
              GROUP BY VoterID, PositionID
              HAVING COUNT(DISTINCT CandidateID) > 1
          )
        GROUP BY v.CandidateID, c.PositionID, c.ConstituencyID, c.WardID
        HAVING 
            (c.PositionID = 'PRES' AND COUNT(*) = (
                SELECT MAX(cnt) FROM (
                    SELECT COUNT(*) AS cnt
                    FROM vote v2
                    JOIN candidate c2 ON v2.CandidateID = c2.CandidateID
                    WHERE v2.CandidateID <> 0
                      AND (v2.VoterID, v2.PositionID) NOT IN (
                          SELECT VoterID, PositionID
                          FROM vote
                          WHERE CandidateID <> 0
                          GROUP BY VoterID, PositionID
                          HAVING COUNT(DISTINCT CandidateID) > 1
                      )
                      AND c2.PositionID = 'PRES'
                    GROUP BY v2.CandidateID
                ) AS sub
            ))
            OR
            (c.PositionID = 'MP' AND COUNT(*) = (
                SELECT MAX(cnt) FROM (
                    SELECT COUNT(*) AS cnt
                    FROM vote v2
                    JOIN candidate c2 ON v2.CandidateID = c2.CandidateID
                    WHERE v2.CandidateID <> 0
                      AND (v2.VoterID, v2.PositionID) NOT IN (
                          SELECT VoterID, PositionID
                          FROM vote
                          WHERE CandidateID <> 0
                          GROUP BY VoterID, PositionID
                          HAVING COUNT(DISTINCT CandidateID) > 1
                      )
                      AND c2.PositionID = 'MP'
                      AND c2.ConstituencyID = c.ConstituencyID
                    GROUP BY v2.CandidateID
                ) AS sub
            ))
            OR
            (c.PositionID = 'COUNC' AND COUNT(*) = (
                SELECT MAX(cnt) FROM (
                    SELECT COUNT(*) AS cnt
                    FROM vote v2
                    JOIN candidate c2 ON v2.CandidateID = c2.CandidateID
                    WHERE v2.CandidateID <> 0
                      AND (v2.VoterID, v2.PositionID) NOT IN (
                          SELECT VoterID, PositionID
                          FROM vote
                          WHERE CandidateID <> 0
                          GROUP BY VoterID, PositionID
                          HAVING COUNT(DISTINCT CandidateID) > 1
                      )
                      AND c2.PositionID = 'COUNC'
                      AND c2.WardID = c.WardID
                    GROUP BY v2.CandidateID
                ) AS sub
            ))
        ORDER BY p.Title, c.ConstituencyID, c.WardID;
    `;

    const [rows] = await db.promise().query(winnerQuery);

    // Insert winners into finalwinners table
    if (rows && rows.length) {
        const insertSql = `INSERT INTO finalwinners (
            PositionID, CandidateID, TotalVotes, ConstituencyID, WardID, Date
        ) VALUES ?`;
        const values = rows.map(r => [
            r.PositionID,
            r.CandidateID,
            r.TotalVotes,
            r.ConstituencyID,
            r.WardID,
            new Date()
        ]);
        await db.promise().query(insertSql, [values]);
    }

    // Clear caches that may depend on final winners
    cache.clearPattern('general', '^final-winners:');
    res.json({ success: true, message: 'Final winners generated and imported successfully', count: rows.length });
}));

module.exports = router;
