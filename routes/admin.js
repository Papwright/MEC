const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const { generateVoterID } = require('../utils/voterIdGenerator');
const resultManager = require('../utils/resultManager');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Admin access required' });
    }
};

// Get system statistics
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        // Total registered voters
        const [voterCount] = await db.promise().query('SELECT COUNT(*) as count FROM voter');
        
        // Total votes cast
        const [voteCount] = await db.promise().query('SELECT COUNT(*) as count FROM vote');
        
        // Total candidates
        const [candidateCount] = await db.promise().query('SELECT COUNT(*) as count FROM candidate');
        
        // Get unique voters who have voted (for turnout calculation)
        const [votersWhoVoted] = await db.promise().query('SELECT COUNT(DISTINCT VoterID) as count FROM vote');
        
        // Votes by position
        const [votesByPosition] = await db.promise().query(`
            SELECT p.Title, COUNT(v.VoteID) as voteCount
            FROM positions p
            LEFT JOIN vote v ON p.PositionID = v.PositionID
            GROUP BY p.PositionID, p.Title
        `);

        // Voter turnout percentage - (voters who voted / total registered voters) × 100
        const turnoutPercentage = voterCount[0].count > 0 ? 
            ((votersWhoVoted[0].count / voterCount[0].count) * 100).toFixed(2) : 0;

        res.json({
            success: true,
            stats: {
                totalVoters: voterCount[0].count,
                totalVotes: voteCount[0].count,
                totalCandidates: candidateCount[0].count,
                turnoutPercentage: turnoutPercentage,
                votesByPosition: votesByPosition
            }
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Add new candidate
router.post('/candidates', requireAdmin, [
    body('nationalId').notEmpty().withMessage('National ID is required'),
    body('positionId').notEmpty().withMessage('Position is required'),
    body('partyName').notEmpty().withMessage('Party name is required'),
    body('stationId').optional()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nationalId, positionId, partyName, stationId } = req.body;

        // Check if citizen exists
        const [citizens] = await db.promise().query(
            'SELECT * FROM eligiblecitizen WHERE NationalID = ?',
            [nationalId]
        );

        if (citizens.length === 0) {
            return res.status(400).json({ error: 'National ID not found in eligible citizens list' });
        }

        const citizen = citizens[0];

        // Check age requirement (must be 18 or older)
        if (citizen.DOB) {
            const age = calculateAge(citizen.DOB);
            if (age === null) {
                return res.status(400).json({ error: 'Invalid date of birth in records' });
            }
            if (age < 18) {
                return res.status(400).json({ 
                    error: `Candidate must be at least 18 years old. Current age: ${age} years.` 
                });
            }
        } else {
            // If no date of birth is recorded, we cannot verify age
            return res.status(400).json({ 
                error: 'Date of birth not found in records. Please update citizen information before adding as candidate.' 
            });
        }

        // Note: Voters CAN register as candidates, so we don't block this

        // Check if party exists
        const [parties] = await db.promise().query(
            'SELECT * FROM politicalparty WHERE PartyName = ?',
            [partyName]
        );

        if (parties.length === 0) {
            return res.status(400).json({ error: 'Political party not found' });
        }

        // Check if position exists
        const [positions] = await db.promise().query(
            'SELECT * FROM positions WHERE PositionID = ?',
            [positionId]
        );

        if (positions.length === 0) {
            return res.status(400).json({ error: 'Position not found' });
        }

        // Check if already a candidate for this position
        const [existingCandidates] = await db.promise().query(
            'SELECT * FROM candidate WHERE NationalID = ? AND PositionID = ?',
            [nationalId, positionId]
        );

        if (existingCandidates.length > 0) {
            return res.status(400).json({ error: 'Already a candidate for this position' });
        }

        // Check if citizen is already a candidate for ANY position
        const [existingCandidatesAny] = await db.promise().query(
            'SELECT c.*, p.Title as PositionTitle FROM candidate c JOIN positions p ON c.PositionID = p.PositionID WHERE c.NationalID = ?',
            [nationalId]
        );

        if (existingCandidatesAny.length > 0) {
            const positions = existingCandidatesAny.map(c => c.PositionTitle).join(', ');
            return res.status(400).json({ 
                error: `Citizen is already a candidate for position(s): ${positions}. A citizen can only be a candidate for one position.` 
            });
        }

        // Add candidate
        const [result] = await db.promise().query(
            'INSERT INTO candidate (NationalID, PositionID, PartyName, StationID) VALUES (?, ?, ?, ?)',
            [nationalId, positionId, partyName, stationId]
        );

        res.json({
            success: true,
            message: 'Candidate added successfully',
            candidateId: result.insertId
        });

    } catch (error) {
        console.error('Error adding candidate:', error);
        res.status(500).json({ error: 'Failed to add candidate' });
    }
});

// Delete candidate
router.delete('/candidates/:candidateId', requireAdmin, async (req, res) => {
    try {
        const { candidateId } = req.params;

        // Check if candidate exists
        const [candidates] = await db.promise().query(
            'SELECT * FROM candidate WHERE CandidateID = ?',
            [candidateId]
        );

        if (candidates.length === 0) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        // Check if candidate has received votes
        const [votes] = await db.promise().query(
            'SELECT * FROM vote WHERE CandidateID = ?',
            [candidateId]
        );

        if (votes.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete candidate who has received votes. Consider deactivating instead.' 
            });
        }

        // Delete candidate
        await db.promise().query(
            'DELETE FROM candidate WHERE CandidateID = ?',
            [candidateId]
        );

        res.json({
            success: true,
            message: 'Candidate deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ error: 'Failed to delete candidate' });
    }
});

// Get all political parties
router.get('/parties', requireAdmin, async (req, res) => {
    try {
        const [parties] = await db.promise().query(`
            SELECT PartyName, Symbol
            FROM politicalparty
            ORDER BY PartyName
        `);

        res.json({
            success: true,
            parties: parties
        });

    } catch (error) {
        console.error('Error fetching parties:', error);
        res.status(500).json({ error: 'Failed to fetch parties' });
    }
});

// Get all positions for admin
router.get('/positions', requireAdmin, async (req, res) => {
    try {
        const [positions] = await db.promise().query('SELECT * FROM positions ORDER BY PositionID');
        
        res.json({
            success: true,
            positions: positions
        });

    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
});

// Add new political party
router.post('/parties', requireAdmin, [
    body('partyName').notEmpty().withMessage('Party name is required'),
    body('symbol').notEmpty().withMessage('Party symbol is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { partyName, symbol } = req.body;

        // Check if party already exists
        const [existingParties] = await db.promise().query(
            'SELECT * FROM politicalparty WHERE PartyName = ?',
            [partyName]
        );

        if (existingParties.length > 0) {
            return res.status(400).json({ error: 'Political party already exists' });
        }

        // Add new party
        await db.promise().query(
            'INSERT INTO politicalparty (PartyName, Symbol) VALUES (?, ?)',
            [partyName, symbol]
        );

        res.json({
            success: true,
            message: 'Political party added successfully'
        });

    } catch (error) {
        console.error('Error adding political party:', error);
        res.status(500).json({ error: 'Failed to add political party' });
    }
});

// Get all candidates
router.get('/candidates', requireAdmin, async (req, res) => {
    try {
        const [candidates] = await db.promise().query(`
            SELECT c.CandidateID, c.NationalID, ec.FName, ec.MName, ec.SName,
                   c.PositionID, p.Title as PositionTitle,
                   c.PartyName, pp.Symbol, c.StationID,
                   ps.Name as StationName
            FROM candidate c
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN positions p ON c.PositionID = p.PositionID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN pollingstation ps ON c.StationID = ps.StationID
            ORDER BY c.PositionID, c.PartyName
        `);

        res.json({
            success: true,
            candidates: candidates
        });

    } catch (error) {
        console.error('Error fetching candidates:', error);
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});

// Get all polling stations (public endpoint for registration)
router.get('/stations/public', async (req, res) => {
    try {
        const [stations] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, w.Name as WardName
            FROM pollingstation ps
            JOIN ward w ON ps.WardID = w.WardID
            ORDER BY ps.Name
        `);

        res.json({
            success: true,
            stations: stations
        });

    } catch (error) {
        console.error('Error fetching public stations:', error);
        res.status(500).json({ error: 'Failed to fetch polling stations' });
    }
});

// Get all polling stations (admin endpoint with full details)
router.get('/stations', requireAdmin, async (req, res) => {
    try {
        const [stations] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, w.Name as WardName,
                   c.Name as ConstituencyName, d.DistrictName, d.Region
            FROM pollingstation ps
            JOIN ward w ON ps.WardID = w.WardID
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            JOIN district d ON c.DistrictID = d.DistrictID
            ORDER BY d.Region, d.DistrictName, c.Name, w.Name
        `);

        res.json({
            success: true,
            stations: stations
        });

    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Failed to fetch polling stations' });
    }
});

// Get voter registration by station
router.get('/voters-by-station', requireAdmin, async (req, res) => {
    try {
        const [votersByStation] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, COUNT(v.VoterID) as registeredVoters,
                   COUNT(vt.VoteID) as votesCast
            FROM pollingstation ps
            LEFT JOIN voter v ON ps.StationID = v.StationID
            LEFT JOIN vote vt ON v.VoterID = vt.VoterID
            GROUP BY ps.StationID, ps.Name
            ORDER BY ps.Name
        `);

        res.json({
            success: true,
            votersByStation: votersByStation
        });

    } catch (error) {
        console.error('Error fetching voters by station:', error);
        res.status(500).json({ error: 'Failed to fetch voter data' });
    }
});

// Get all registered voters with details
router.get('/voters', requireAdmin, async (req, res) => {
    try {
                            const [voters] = await db.promise().query(`
            SELECT v.NationalID, v.StationID, v.VoterID,
                   CONCAT('VID', LPAD(v.VoterID, 3, '0')) as CustomVoterID,
                   ec.FName, ec.MName, ec.SName, ec.DOB,
                   ps.Name as StationName, w.Name as WardName, 
                   c.Name as ConstituencyName, d.DistrictName
            FROM voter v
            JOIN eligiblecitizen ec ON v.NationalID = ec.NationalID
            JOIN pollingstation ps ON v.StationID = ps.StationID
            JOIN ward w ON ps.WardID = w.WardID
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            JOIN district d ON c.DistrictID = d.DistrictID
            ORDER BY v.VoterID DESC
        `);
        
        res.json({
            success: true,
            voters: voters
        });
    } catch (error) {
        console.error('Error fetching voters:', error);
        res.status(500).json({ error: 'Failed to fetch voters' });
    }
});

// Get voter details by National ID
router.get('/voters/:nationalId', requireAdmin, async (req, res) => {
    try {
        const { nationalId } = req.params;
        
        const [voters] = await db.promise().query(`
            SELECT v.NationalID, v.StationID, v.VoterID,
                   CONCAT('VID', LPAD(v.VoterID, 3, '0')) as CustomVoterID,
                   ec.FName, ec.MName, ec.SName, ec.DOB,
                   ps.Name as StationName, w.Name as WardName, 
                   c.Name as ConstituencyName, d.DistrictName
            FROM voter v
            JOIN eligiblecitizen ec ON v.NationalID = ec.NationalID
            JOIN pollingstation ps ON v.StationID = ps.StationID
            JOIN ward w ON ps.WardID = w.WardID
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            JOIN district d ON c.DistrictID = d.DistrictID
            WHERE v.NationalID = ?
        `, [nationalId]);
        
        if (voters.length === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }
        
        res.json({
            success: true,
            voter: voters[0]
        });
    } catch (error) {
        console.error('Error fetching voter:', error);
        res.status(500).json({ error: 'Failed to fetch voter' });
    }
});

// Update voter information
router.put('/voters/:nationalId', requireAdmin, [
    body('stationId').notEmpty().withMessage('Station ID is required'),
    body('fName').notEmpty().withMessage('First name is required'),
    body('sName').notEmpty().withMessage('Surname is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nationalId } = req.params;
        const { stationId, fName, sName } = req.body;

        // Check if voter exists
        const [existingVoters] = await db.promise().query(
            'SELECT * FROM voter WHERE NationalID = ?',
            [nationalId]
        );

        if (existingVoters.length === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }

        // Check if station exists
        const [stations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (stations.length === 0) {
            return res.status(400).json({ error: 'Invalid polling station' });
        }

        // Update eligible citizen information (only existing fields)
        await db.promise().query(`
            UPDATE eligiblecitizen 
            SET FName = ?, MName = ?
            WHERE NationalID = ?
        `, [fName, sName, nationalId]);

        // Update voter station
        await db.promise().query(`
            UPDATE voter 
            SET StationID = ?
            WHERE NationalID = ?
        `, [stationId, nationalId]);

        res.json({
            success: true,
            message: 'Voter information updated successfully'
        });

    } catch (error) {
        console.error('Error updating voter:', error);
        res.status(500).json({ error: 'Failed to update voter' });
    }
});

// Delete voter (remove from voter table but keep in eligiblecitizen)
router.delete('/voters/:nationalId', requireAdmin, async (req, res) => {
    try {
        const { nationalId } = req.params;

        // Check if voter exists
        const [existingVoters] = await db.promise().query(
            'SELECT * FROM voter WHERE NationalID = ?',
            [nationalId]
        );

        if (existingVoters.length === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }

        // Check if voter has already voted
        const [votes] = await db.promise().query(
            'SELECT * FROM vote WHERE VoterID = ?',
            [existingVoters[0].VoterID]
        );

        if (votes.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete voter who has already cast votes. Consider deactivating instead.' 
            });
        }

        // Delete voter (but keep in eligiblecitizen table)
        await db.promise().query(
            'DELETE FROM voter WHERE NationalID = ?',
            [nationalId]
        );

        res.json({
            success: true,
            message: 'Voter removed successfully'
        });

    } catch (error) {
        console.error('Error deleting voter:', error);
        res.status(500).json({ error: 'Failed to delete voter' });
    }
});

// Get eligible citizens who are not registered voters
router.get('/eligible-citizens', requireAdmin, async (req, res) => {
    try {
        const [citizens] = await db.promise().query(`
            SELECT ec.NationalID, ec.FName, ec.MName, ec.DOB
            FROM eligiblecitizen ec
            LEFT JOIN voter v ON ec.NationalID = v.NationalID
            WHERE v.NationalID IS NULL
            ORDER BY ec.FName, ec.MName
        `);
        
        res.json({
            success: true,
            citizens: citizens
        });
    } catch (error) {
        console.error('Error fetching eligible citizens:', error);
        res.status(500).json({ error: 'Failed to fetch eligible citizens' });
    }
});

// Utility function to calculate age from date of birth
function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// Register a new voter (admin can register eligible citizens)
router.post('/voters', requireAdmin, [
    body('nationalId').notEmpty().withMessage('National ID is required'),
    body('stationId').notEmpty().withMessage('Station ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nationalId, stationId } = req.body;

        // Check if citizen is eligible
        const [citizens] = await db.promise().query(
            'SELECT * FROM eligiblecitizen WHERE NationalID = ?',
            [nationalId]
        );

        if (citizens.length === 0) {
            return res.status(400).json({ error: 'Citizen not found in eligible citizens list' });
        }

        const citizen = citizens[0];

        // Check age requirement (must be 18 or older)
        if (citizen.DOB) {
            const age = calculateAge(citizen.DOB);
            if (age === null) {
                return res.status(400).json({ error: 'Invalid date of birth in records' });
            }
            if (age < 18) {
                return res.status(400).json({ 
                    error: `Citizen must be at least 18 years old to register to vote. Current age: ${age} years.` 
                });
            }
        } else {
            // If no date of birth is recorded, we cannot verify age
            return res.status(400).json({ 
                error: 'Date of birth not found in records. Please update citizen information before registration.' 
            });
        }

        // Check if already registered as voter
        const [existingVoters] = await db.promise().query(
            'SELECT * FROM voter WHERE NationalID = ?',
            [nationalId]
        );

        if (existingVoters.length > 0) {
            return res.status(400).json({ error: 'Citizen is already registered as a voter' });
        }

        // Note: Candidates CAN register as voters, so we don't block this

        // Check if station exists
        const [stations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (stations.length === 0) {
            return res.status(400).json({ error: 'Invalid polling station' });
        }

        // Register as voter
        const [result] = await db.promise().query(
            'INSERT INTO voter (NationalID, StationID) VALUES (?, ?)',
            [nationalId, stationId]
        );

        // Generate custom VoterID after successful registration using the actual inserted ID
        const customVoterID = `VID${result.insertId.toString().padStart(3, '0')}`;

        res.json({
            success: true,
            message: 'Voter registered successfully',
            voterId: result.insertId,
            customVoterID: customVoterID,
            voter: {
                id: result.insertId,
                customId: customVoterID,
                name: `${citizen.FName} ${citizen.MName || ''} ${citizen.SName}`,
                nationalId: nationalId,
                stationId: stationId
            }
        });

    } catch (error) {
        console.error('Error registering voter:', error);
        res.status(500).json({ error: 'Failed to register voter' });
    }
});

// Get candidate results from candidateresult table
router.get('/candidate-results', requireAdmin, async (req, res) => {
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
        console.error('Error fetching candidate results:', error);
        res.status(500).json({ error: 'Failed to fetch candidate results' });
    }
});

// Get final winners from finalwinner table
router.get('/final-winners', requireAdmin, async (req, res) => {
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
        console.error('Error fetching final winners:', error);
        res.status(500).json({ error: 'Failed to fetch final winners' });
    }
});

// Manually trigger result updates for all positions
router.post('/update-results', requireAdmin, async (req, res) => {
    try {
        // Get all positions
        const [positions] = await db.promise().query('SELECT PositionID FROM positions');
        
        // Update results for each position
        for (const position of positions) {
            await resultManager.updateResultsAfterVote(position.PositionID);
        }

        res.json({
            success: true,
            message: 'All results updated successfully',
            positionsUpdated: positions.length
        });

    } catch (error) {
        console.error('Error updating results:', error);
        res.status(500).json({ error: 'Failed to update results' });
    }
});

// Initialize result tables with current data
router.post('/initialize-results', requireAdmin, async (req, res) => {
    try {
        await resultManager.initializeResultTables();

        res.json({
            success: true,
            message: 'Result tables initialized successfully'
        });

    } catch (error) {
        console.error('Error initializing result tables:', error);
        res.status(500).json({ error: 'Failed to initialize result tables' });
    }
});

// ===== POLLING STATION MANAGEMENT =====

// Get all districts for dropdown
router.get('/districts', requireAdmin, async (req, res) => {
    try {
        const [districts] = await db.promise().query(`
            SELECT DistrictID, DistrictName, Region
            FROM district
            ORDER BY Region, DistrictName
        `);

        res.json({
            success: true,
            districts: districts
        });

    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ error: 'Failed to fetch districts' });
    }
});

// Get constituencies by district for dropdown
router.get('/constituencies/:districtId', requireAdmin, async (req, res) => {
    try {
        const { districtId } = req.params;

        const [constituencies] = await db.promise().query(`
            SELECT ConstituencyID, Name
            FROM constituency
            WHERE DistrictID = ?
            ORDER BY Name
        `, [districtId]);

        res.json({
            success: true,
            constituencies: constituencies
        });

    } catch (error) {
        console.error('Error fetching constituencies:', error);
        res.status(500).json({ error: 'Failed to fetch constituencies' });
    }
});

// Get wards by constituency for dropdown
router.get('/wards/:constituencyId', requireAdmin, async (req, res) => {
    try {
        const { constituencyId } = req.params;

        const [wards] = await db.promise().query(`
            SELECT WardID, Name
            FROM ward
            WHERE ConstituencyID = ?
            ORDER BY Name
        `, [constituencyId]);

        res.json({
            success: true,
            wards: wards
        });

    } catch (error) {
        console.error('Error fetching wards:', error);
        res.status(500).json({ error: 'Failed to fetch wards' });
    }
});

// Add new polling station
router.post('/stations', requireAdmin, [
    body('stationId').notEmpty().withMessage('Station ID is required')
        .isLength({ min: 3, max: 10 }).withMessage('Station ID must be 3-10 characters'),
    body('name').notEmpty().withMessage('Station name is required')
        .isLength({ min: 3, max: 50 }).withMessage('Station name must be 3-50 characters'),
    body('wardId').notEmpty().withMessage('Ward is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { stationId, name, wardId } = req.body;

        // Check if station ID already exists
        const [existingStations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (existingStations.length > 0) {
            return res.status(400).json({ error: 'Station ID already exists' });
        }

        // Check if ward exists
        const [wards] = await db.promise().query(
            'SELECT * FROM ward WHERE WardID = ?',
            [wardId]
        );

        if (wards.length === 0) {
            return res.status(400).json({ error: 'Invalid ward selected' });
        }

        // Add new polling station
        await db.promise().query(
            'INSERT INTO pollingstation (StationID, Name, WardID) VALUES (?, ?, ?)',
            [stationId, name, wardId]
        );

        res.json({
            success: true,
            message: 'Polling station added successfully',
            stationId: stationId
        });

    } catch (error) {
        console.error('Error adding polling station:', error);
        res.status(500).json({ error: 'Failed to add polling station' });
    }
});

// Update existing polling station
router.put('/stations/:stationId', requireAdmin, [
    body('name').notEmpty().withMessage('Station name is required')
        .isLength({ min: 3, max: 50 }).withMessage('Station name must be 3-50 characters'),
    body('wardId').notEmpty().withMessage('Ward is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { stationId } = req.params;
        const { name, wardId } = req.body;

        // Check if station exists
        const [existingStations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (existingStations.length === 0) {
            return res.status(404).json({ error: 'Polling station not found' });
        }

        // Check if ward exists
        const [wards] = await db.promise().query(
            'SELECT * FROM ward WHERE WardID = ?',
            [wardId]
        );

        if (wards.length === 0) {
            return res.status(400).json({ error: 'Invalid ward selected' });
        }

        // Update polling station
        await db.promise().query(
            'UPDATE pollingstation SET Name = ?, WardID = ? WHERE StationID = ?',
            [name, wardId, stationId]
        );

        res.json({
            success: true,
            message: 'Polling station updated successfully'
        });

    } catch (error) {
        console.error('Error updating polling station:', error);
        res.status(500).json({ error: 'Failed to update polling station' });
    }
});

// Delete polling station
router.delete('/stations/:stationId', requireAdmin, async (req, res) => {
    try {
        const { stationId } = req.params;

        // Check if station exists
        const [existingStations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (existingStations.length === 0) {
            return res.status(404).json({ error: 'Polling station not found' });
        }

        // Check if station has registered voters
        const [voters] = await db.promise().query(
            'SELECT COUNT(*) as count FROM voter WHERE StationID = ?',
            [stationId]
        );

        if (voters[0].count > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete polling station with registered voters. Remove all voters first.' 
            });
        }

        // Check if station has candidates
        const [candidates] = await db.promise().query(
            'SELECT COUNT(*) as count FROM candidate WHERE StationID = ?',
            [stationId]
        );

        if (candidates[0].count > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete polling station with candidates. Remove all candidates first.' 
            });
        }

        // Delete polling station
        await db.promise().query(
            'DELETE FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        res.json({
            success: true,
            message: 'Polling station deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting polling station:', error);
        res.status(500).json({ error: 'Failed to delete polling station' });
    }
});

// Get polling station details by ID
router.get('/stations/:stationId', requireAdmin, async (req, res) => {
    try {
        const { stationId } = req.params;

        const [stations] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, ps.WardID,
                   w.Name as WardName, w.ConstituencyID,
                   c.Name as ConstituencyName, c.DistrictID,
                   d.DistrictName, d.Region
            FROM pollingstation ps
            JOIN ward w ON ps.WardID = w.WardID
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            JOIN district d ON c.DistrictID = d.DistrictID
            WHERE ps.StationID = ?
        `, [stationId]);

        if (stations.length === 0) {
            return res.status(404).json({ error: 'Polling station not found' });
        }

        res.json({
            success: true,
            station: stations[0]
        });

    } catch (error) {
        console.error('Error fetching station details:', error);
        res.status(500).json({ error: 'Failed to fetch station details' });
    }
});

module.exports = router;
