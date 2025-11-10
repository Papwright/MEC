// VoterID Generator Utility
// Generates custom VoterIDs in format VID### (e.g., VID000, VID001, VID251)

const db = require('../config/database');

/**
 * Generates a new VoterID in the format VID###
 * @returns {Promise<string>} The generated VoterID
 */
async function generateVoterID() {
    try {
        // Get the actual next available VoterID by finding the highest existing ID and adding 1
        const [maxResult] = await db.promise().query(`
            SELECT COALESCE(MAX(VoterID), 0) as maxId 
            FROM voter
        `);
        
        const nextId = maxResult[0].maxId + 1;
        
        // Format the ID with leading zeros (3 digits minimum)
        const formattedId = nextId.toString().padStart(3, '0');
        return `VID${formattedId}`;
        
    } catch (error) {
        console.error('Error generating VoterID:', error);
        // Fallback to timestamp-based ID if database query fails
        const timestamp = Date.now().toString().slice(-6);
        return `VID${timestamp}`;
    }
}

/**
 * Validates if a VoterID follows the correct format
 * @param {string} voterId - The VoterID to validate
 * @returns {boolean} True if valid format, false otherwise
 */
function validateVoterIDFormat(voterId) {
    const pattern = /^VID\d{3,}$/;
    return pattern.test(voterId);
}

/**
 * Extracts the numeric part from a VoterID
 * @param {string} voterId - The VoterID (e.g., "VID251")
 * @returns {number} The numeric part (e.g., 251)
 */
function extractVoterIDNumber(voterId) {
    if (!validateVoterIDFormat(voterId)) {
        throw new Error('Invalid VoterID format');
    }
    return parseInt(voterId.replace('VID', ''));
}

module.exports = {
    generateVoterID,
    validateVoterIDFormat,
    extractVoterIDNumber
};
