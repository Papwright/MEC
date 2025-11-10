const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/database');
const { generateVoterID } = require('../utils/voterIdGenerator');

// Voter login (VoterID only)
router.post('/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;

        // Only accept VoterID format (starts with VID)
        if (!nationalId.toUpperCase().startsWith('VID')) {
            return res.status(401).json({ error: 'Please use your VoterID (e.g., VID000) to login' });
        }

        // Extract the numeric part from VoterID (e.g., VID000 -> 0)
        const voterIdNumber = nationalId.replace(/^VID/i, '');
        if (!/^\d+$/.test(voterIdNumber)) {
            return res.status(401).json({ error: 'Invalid VoterID format. Please use format like VID000' });
        }

        // Check if voter exists and is registered using VoterID
        const [voters] = await db.promise().query(
            `SELECT v.VoterID, v.NationalID, v.Password, ec.FName, ec.MName, ec.SName, v.StationID, ps.Name as StationName
             FROM voter v
             JOIN eligiblecitizen ec ON v.NationalID = ec.NationalID
             JOIN pollingstation ps ON v.StationID = ps.StationID
             WHERE v.VoterID = ?`,
            [parseInt(voterIdNumber)]
        );

        if (voters.length === 0) {
            return res.status(401).json({ error: 'Invalid VoterID or not registered to vote' });
        }

        const voter = voters[0];

        // Check if password matches the stored hashed password
        // Handle case where Password column might not exist yet (for existing voters)
        if (voter.Password) {
            const isPasswordValid = await bcrypt.compare(password, voter.Password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        } else {
            // Fallback for existing voters without passwords (using National ID as password)
            if (nationalId !== password) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }

        // Set session
        req.session.voterId = voter.VoterID;
        req.session.nationalId = voter.NationalID;
        req.session.stationId = voter.StationID;
        req.session.voterName = `${voter.FName} ${voter.MName || ''} ${voter.SName}`;

        // Generate custom VoterID for display
        const customVoterID = `VID${voter.VoterID.toString().padStart(3, '0')}`;
        
        res.json({
            success: true,
            message: 'Login successful',
            voter: {
                id: voter.VoterID,
                customId: customVoterID,
                name: `${voter.FName} ${voter.MName || ''} ${voter.SName}`,
                station: voter.StationName,
                nationalId: voter.NationalID
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
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

// Voter registration (for eligible citizens)
router.post('/register', async (req, res) => {
    try {
        const { nationalId, password, stationId } = req.body;

        // Check if citizen is eligible
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
                    error: `You must be at least 18 years old to register to vote. You are currently ${age} years old.` 
                });
            }
        } else {
            // If no date of birth is recorded, we cannot verify age
            return res.status(400).json({ 
                error: 'Date of birth not found in records. Please contact the electoral commission to update your information.' 
            });
        }

        // Check if already registered
        const [existingVoters] = await db.promise().query(
            'SELECT * FROM voter WHERE NationalID = ?',
            [nationalId]
        );

        if (existingVoters.length > 0) {
            return res.status(400).json({ error: 'Already registered to vote' });
        }

        // Check if station exists
        const [stations] = await db.promise().query(
            'SELECT * FROM pollingstation WHERE StationID = ?',
            [stationId]
        );

        if (stations.length === 0) {
            return res.status(400).json({ error: 'Invalid polling station' });
        }

        // Hash the password for secure storage
        const hashedPassword = await bcrypt.hash(password, 10);
        
        try {
            // Try to register voter with hashed password
            const [result] = await db.promise().query(
                'INSERT INTO voter (NationalID, StationID, Password) VALUES (?, ?, ?)',
                [nationalId, stationId, hashedPassword]
            );
            
            // Generate custom VoterID after successful registration using the actual inserted ID
            const customVoterID = `VID${result.insertId.toString().padStart(3, '0')}`;
            
            res.json({
                success: true,
                message: 'Voter registration successful',
                voterId: result.insertId,
                customVoterID: customVoterID,
                voter: {
                    id: result.insertId,
                    customId: customVoterID,
                    name: `${citizen.FName} ${citizen.MName || ''} ${citizen.SName}`,
                    stationId: stationId
                }
            });
        } catch (dbError) {
            // If Password column doesn't exist, try without it
            if (dbError.code === 'ER_BAD_FIELD_ERROR' && dbError.message.includes('Password')) {
                console.log('Password column not found, registering without password');
                const [result] = await db.promise().query(
                    'INSERT INTO voter (NationalID, StationID) VALUES (?, ?)',
                    [nationalId, stationId]
                );
                
                // Generate custom VoterID after successful registration using the actual inserted ID
                const customVoterID = `VID${result.insertId.toString().padStart(3, '0')}`;
                
                res.json({
                    success: true,
                    message: 'Voter registration successful (password not stored - database update needed)',
                    voterId: result.insertId,
                    customVoterID: customVoterID,
                    voter: {
                        id: result.insertId,
                        customId: customVoterID,
                        name: `${citizen.FName} ${citizen.MName || ''} ${citizen.SName}`,
                        stationId: stationId
                    }
                });
            } else {
                throw dbError; // Re-throw other database errors
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Public endpoints for geographical data (no authentication required)

// Get all districts for public use
router.get('/districts', async (req, res) => {
    try {
        const [districts] = await db.promise().query(`
            SELECT DistrictID, DistrictName, Region 
            FROM district 
            ORDER BY DistrictName
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

// Get constituencies by district for public use
router.get('/constituencies/:districtId', async (req, res) => {
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

// Get wards by constituency for public use
router.get('/wards/:constituencyId', async (req, res) => {
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

// Get all polling stations for public use
router.get('/stations', async (req, res) => {
    try {
        const [stations] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, w.Name as WardName
            FROM pollingstation ps
            LEFT JOIN ward w ON ps.WardID = w.WardID
            ORDER BY ps.Name
        `);
        
        res.json({
            success: true,
            stations: stations
        });
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});

// Get polling stations by constituency for public use
router.get('/stations/by-constituency/:constituencyId', async (req, res) => {
    try {
        const { constituencyId } = req.params;
        
        const [stations] = await db.promise().query(`
            SELECT ps.StationID, ps.Name, w.Name as WardName
            FROM pollingstation ps
            JOIN ward w ON ps.WardID = w.WardID
            WHERE w.ConstituencyID = ?
            ORDER BY ps.Name
        `, [constituencyId]);
        
        res.json({
            success: true,
            stations: stations
        });
    } catch (error) {
        console.error('Error fetching stations by constituency:', error);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});

// Get polling stations by ward for public use (keeping for backward compatibility)
router.get('/stations/by-ward/:wardId', async (req, res) => {
    try {
        const { wardId } = req.params;
        
        const [stations] = await db.promise().query(`
            SELECT StationID, Name 
            FROM pollingstation 
            WHERE WardID = ? 
            ORDER BY Name
        `, [wardId]);
        
        res.json({
            success: true,
            stations: stations
        });
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});

// Check if user is logged in
router.get('/check', (req, res) => {
    if (req.session.voterId) {
        res.json({
            loggedIn: true,
            voter: {
                id: req.session.voterId,
                nationalId: req.session.nationalId,
                name: req.session.voterName,
                stationId: req.session.stationId
            }
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logout successful' });
    });
});

// Admin login
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // For demo purposes, using hardcoded admin credentials
        // In production, this should be stored in database with proper hashing
        if (username === 'admin' && password === 'admin123') {
            // Set admin session
            req.session.isAdmin = true;
            req.session.adminId = 'admin';
            
            res.json({
                success: true,
                message: 'Admin login successful',
                admin: {
                    id: 'admin',
                    username: 'admin',
                    role: 'administrator'
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid admin credentials' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Admin login failed' });
    }
});

// VoterID lookup - allows users to find their VoterID using National ID
router.post('/lookup-voterid', async (req, res) => {
    try {
        const { nationalId } = req.body;

        if (!nationalId) {
            return res.status(400).json({ error: 'National ID is required' });
        }

        // Check if voter exists and get their VoterID
        const [voters] = await db.promise().query(`
            SELECT v.VoterID, ec.FName, ec.MName, ec.SName
            FROM voter v
            JOIN eligiblecitizen ec ON v.NationalID = ec.NationalID
            WHERE v.NationalID = ?
        `, [nationalId]);

        if (voters.length === 0) {
            return res.status(404).json({ 
                error: 'No voter found with this National ID. Please check your National ID or register first.' 
            });
        }

        const voter = voters[0];
        const customVoterID = `VID${voter.VoterID.toString().padStart(3, '0')}`;

        res.json({
            success: true,
            message: 'VoterID found successfully',
            voter: {
                name: `${voter.FName} ${voter.MName || ''} ${voter.SName}`,
                nationalId: nationalId,
                voterId: voter.VoterID,
                customVoterID: customVoterID
            }
        });

    } catch (error) {
        console.error('VoterID lookup error:', error);
        res.status(500).json({ error: 'Failed to lookup VoterID' });
    }
});

// Password reset - allows users to reset their password using National ID
router.post('/reset-password', async (req, res) => {
    try {
        const { nationalId, newPassword } = req.body;

        if (!nationalId || !newPassword) {
            return res.status(400).json({ error: 'National ID and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // Check if voter exists
        const [voters] = await db.promise().query(`
            SELECT v.VoterID, ec.FName, ec.MName, ec.SName
            FROM voter v
            JOIN eligiblecitizen ec ON v.NationalID = ec.NationalID
            WHERE v.NationalID = ?
        `, [nationalId]);

        if (voters.length === 0) {
            return res.status(404).json({ 
                error: 'No voter found with this National ID. Please check your National ID or register first.' 
            });
        }

        // Update the password
        await db.promise().query(`
            UPDATE voter 
            SET Password = ? 
            WHERE NationalID = ?
        `, [newPassword, nationalId]);

        const voter = voters[0];
        const customVoterID = `VID${voter.VoterID.toString().padStart(3, '0')}`;

        res.json({
            success: true,
            message: 'Password reset successfully',
            voter: {
                name: `${voter.FName} ${voter.MName || ''} ${voter.SName}`,
                nationalId: nationalId,
                voterId: voter.VoterID,
                customVoterID: customVoterID
            }
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Test route without database
router.post('/test', (req, res) => {
    res.json({ success: true, message: 'Test route working' });
});

// Check admin authentication status
router.get('/admin/check', (req, res) => {
    if (req.session.isAdmin) {
        res.json({
            isAdmin: true,
            admin: {
                id: req.session.adminId,
                username: 'admin',
                role: 'administrator'
            }
        });
    } else {
        res.json({ isAdmin: false });
    }
});

// Admin logout
router.post('/admin/logout', (req, res) => {
    req.session.isAdmin = false;
    req.session.adminId = null;
    res.json({ success: true, message: 'Admin logout successful' });
});

module.exports = router;
