const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const resultManager = require('../utils/resultManager');

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session.voterId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Get candidates for a specific position at voter's station
router.get('/candidates/:positionId', requireAuth, async (req, res) => {
    try {
        const { positionId } = req.params;
        const { stationId } = req.session;

        let query = `
            SELECT c.CandidateID, c.NationalID, ec.FName, ec.MName, ec.SName, 
                   pp.PartyName, pp.Symbol, p.Title as PositionTitle
            FROM candidate c
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            JOIN positions p ON c.PositionID = p.PositionID
            WHERE c.PositionID = ?
        `;

        let params = [positionId];

        // For local positions (Councillor), filter by station
        if (positionId === 'POS003') { // Assuming POS003 is Councillor
            query += ' AND c.StationID = ?';
            params.push(stationId);
        }

        const [candidates] = await db.promise().query(query, params);

        res.json({
            success: true,
            candidates: candidates,
            position: positionId
        });

    } catch (error) {
        console.error('Error fetching candidates:', error);
        res.status(500).json({ error: 'Failed to fetch candidates' });
    }
});

// Get all positions
router.get('/positions', requireAuth, async (req, res) => {
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

// Cast a vote
router.post('/cast', requireAuth, [
    body('positionId').notEmpty().withMessage('Position is required'),
    body('candidateId').notEmpty().withMessage('Candidate is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { positionId, candidateId } = req.body;
        const { voterId, stationId } = req.session;
        
        console.log('Vote request:', { positionId, candidateId, voterId, stationId });

        // Check if voter has already voted for this position
        const [existingVotes] = await db.promise().query(
            'SELECT * FROM vote WHERE VoterID = ? AND PositionID = ?',
            [voterId, positionId]
        );

        if (existingVotes.length > 0) {
            return res.status(400).json({ error: 'You have already voted for this position' });
        }

        // Verify candidate exists and is valid for the position
        console.log('Verifying candidate:', { candidateId, positionId });
        const [candidates] = await db.promise().query(
            'SELECT * FROM candidate WHERE CandidateID = ? AND PositionID = ?',
            [candidateId, positionId]
        );
        
        console.log('Found candidates:', candidates);

        if (candidates.length === 0) {
            return res.status(400).json({ error: 'Invalid candidate for this position' });
        }

        // For local positions, verify candidate is from voter's station
        if (positionId === 'POS003') { // Councillor
            const candidate = candidates[0];
            if (candidate.StationID !== stationId) {
                return res.status(400).json({ error: 'Candidate is not from your polling station' });
            }
        }

        // Cast the vote
        const [result] = await db.promise().query(
            'INSERT INTO vote (VoterID, StationID, PositionID, CandidateID) VALUES (?, ?, ?, ?)',
            [voterId, stationId, positionId, candidateId]
        );

        // Update candidate results and final winners after successful vote
        try {
            await resultManager.updateResultsAfterVote(positionId);
            console.log('Results updated successfully after vote');
        } catch (resultError) {
            console.error('Error updating results after vote:', resultError);
            // Don't fail the vote if result update fails
        }

        res.json({
            success: true,
            message: 'Vote cast successfully',
            voteId: result.insertId
        });

    } catch (error) {
        console.error('Error casting vote:', error);
        res.status(500).json({ error: 'Failed to cast vote' });
    }
});

// Get voter's voting history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const { voterId } = req.session;

        const [votes] = await db.promise().query(
            `SELECT v.VoteID, v.Timestamp, v.PositionID, p.Title as PositionTitle,
                    c.CandidateID, ec.FName, ec.SName, pp.PartyName
             FROM vote v
            JOIN positions p ON v.PositionID = p.PositionID
            JOIN candidate c ON v.CandidateID = c.CandidateID
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
             WHERE v.VoterID = ?
             ORDER BY v.Timestamp DESC`,
            [voterId]
        );

        res.json({
            success: true,
            votes: votes
        });

    } catch (error) {
        console.error('Error fetching voting history:', error);
        res.status(500).json({ error: 'Failed to fetch voting history' });
    }
});

// Check if voter has completed all positions
router.get('/status', requireAuth, async (req, res) => {
    try {
        const { voterId } = req.session;

        // Get all positions
        const [positions] = await db.promise().query('SELECT * FROM positions ORDER BY PositionID');
        
        // Get voter's votes
        const [votes] = await db.promise().query(
            'SELECT PositionID FROM vote WHERE VoterID = ?',
            [voterId]
        );

        const votedPositions = votes.map(v => v.PositionID);
        const remainingPositions = positions.filter(p => !votedPositions.includes(p.PositionID));

        res.json({
            success: true,
            totalPositions: positions.length,
            votedPositions: votedPositions, // Send the actual array of position IDs
            votedPositionsCount: votedPositions.length, // Send count separately if needed
            remainingPositions: remainingPositions.length,
            isComplete: remainingPositions.length === 0,
            remaining: remainingPositions
        });

    } catch (error) {
        console.error('Error checking voting status:', error);
        res.status(500).json({ error: 'Failed to check voting status' });
    }
});

module.exports = router;
