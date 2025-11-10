const db = require('../config/database');

/**
 * Update candidate result table with current vote count
 */
async function updateCandidateResult(candidateId, positionId, voteCount) {
    try {
        // Check if candidate result record exists
        const [existing] = await db.promise().query(
            'SELECT * FROM candidateresult WHERE CandidateID = ? AND PositionID = ?',
            [candidateId, positionId]
        );

        if (existing.length > 0) {
            // Update existing record
            await db.promise().query(
                'UPDATE candidateresult SET TotalVotes = ?, VoteCount = ?, LastUpdated = NOW() WHERE CandidateID = ? AND PositionID = ?',
                [voteCount, voteCount, candidateId, positionId]
            );
        } else {
            // Insert new record
            await db.promise().query(
                'INSERT INTO candidateresult (CandidateID, PositionID, TotalVotes, VoteCount, LastUpdated) VALUES (?, ?, ?, ?, NOW())',
                [candidateId, positionId, voteCount, voteCount]
            );
        }
        
        console.log(`Updated candidate result: Candidate ${candidateId}, Position ${positionId}, Votes: ${voteCount}`);
    } catch (error) {
        console.error('Error updating candidate result:', error);
        throw error;
    }
}

/**
 * Update final winner table for a specific position
 */
async function updateFinalWinner(positionId) {
    try {
        // Get the candidate with the most votes for this position
        const [winners] = await db.promise().query(`
            SELECT c.CandidateID, c.PositionID, ec.FName, ec.SName, 
                   pp.PartyName, COUNT(v.VoteID) as VoteCount
            FROM candidate c
            JOIN eligiblecitizen ec ON c.NationalID = ec.NationalID
            JOIN politicalparty pp ON c.PartyName = pp.PartyName
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID
            WHERE c.PositionID = ?
            GROUP BY c.CandidateID, c.PositionID, ec.FName, ec.SName, pp.PartyName
            ORDER BY VoteCount DESC
            LIMIT 1
        `, [positionId]);

        if (winners.length === 0) {
            console.log(`No candidates found for position ${positionId}`);
            return;
        }

        const winner = winners[0];

        // Check if final winner record exists for this position
        const [existingWinner] = await db.promise().query(
            'SELECT * FROM finalwinner WHERE PositionID = ?',
            [positionId]
        );

        if (existingWinner.length > 0) {
            // Update existing winner record
            await db.promise().query(
                `UPDATE finalwinner SET 
                 CandidateID = ?, 
                 WinnerName = ?, 
                 PartyName = ?, 
                 VoteCount = ?, 
                 LastUpdated = NOW() 
                 WHERE PositionID = ?`,
                [winner.CandidateID, `${winner.FName} ${winner.SName}`, winner.PartyName, winner.VoteCount, positionId]
            );
        } else {
            // Insert new winner record
            await db.promise().query(
                `INSERT INTO finalwinner 
                 (PositionID, CandidateID, WinnerName, PartyName, VoteCount, LastUpdated) 
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [positionId, winner.CandidateID, `${winner.FName} ${winner.SName}`, winner.PartyName, winner.VoteCount]
            );
        }

        console.log(`Updated final winner for position ${positionId}: ${winner.FName} ${winner.SName} with ${winner.VoteCount} votes`);
    } catch (error) {
        console.error('Error updating final winner:', error);
        throw error;
    }
}

/**
 * Update all candidate results and final winners after a vote is cast
 */
async function updateResultsAfterVote(positionId) {
    try {
        // Get all candidates for this position with their current vote counts
        const [candidates] = await db.promise().query(`
            SELECT c.CandidateID, c.PositionID, COUNT(v.VoteID) as VoteCount
            FROM candidate c
            LEFT JOIN vote v ON c.CandidateID = v.CandidateID
            WHERE c.PositionID = ?
            GROUP BY c.CandidateID, c.PositionID
        `, [positionId]);

        // Update candidate results for all candidates in this position
        for (const candidate of candidates) {
            await updateCandidateResult(candidate.CandidateID, candidate.PositionID, candidate.VoteCount);
        }

        // Update final winner for this position
        await updateFinalWinner(positionId);

        console.log(`Successfully updated all results for position ${positionId}`);
    } catch (error) {
        console.error('Error updating results after vote:', error);
        throw error;
    }
}

/**
 * Initialize result tables with current data (useful for setup)
 */
async function initializeResultTables() {
    try {
        // Get all positions
        const [positions] = await db.promise().query('SELECT PositionID FROM positions');
        
        for (const position of positions) {
            await updateResultsAfterVote(position.PositionID);
        }
        
        console.log('Result tables initialized successfully');
    } catch (error) {
        console.error('Error initializing result tables:', error);
        throw error;
    }
}

module.exports = {
    updateCandidateResult,
    updateFinalWinner,
    updateResultsAfterVote,
    initializeResultTables
};

