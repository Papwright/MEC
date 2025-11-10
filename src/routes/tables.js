const express = require('express');
const router = express.Router();
const db = require('../config/database');
const errorHandler = require('../middleware/errorHandler');

// Helper function to handle database queries with fallback
const safeQuery = async (query, params = []) => {
    const startTime = Date.now();
    try {
        const result = await db.promise().query(query, params);
        const duration = Date.now() - startTime;
        if (duration > 5000) {
            console.warn(`Slow query detected: ${duration}ms`, { query: query.substring(0, 100) });
        }
        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('Database query failed:', { 
            query: query.substring(0, 100), 
            duration: `${duration}ms`,
            error: error.message 
        });
        throw error;
    }
};

// Parse limit helper with support for limit=all and safety cap
const parseLimit = (req, defaultLimit = 10, maxLimit = 5000) => {
    const raw = (req.query.limit || defaultLimit.toString()).toString().toLowerCase();
    if (raw === 'all' || raw === '0' || raw === '-1') return maxLimit;
    const parsed = parseInt(raw) || defaultLimit;
    return parsed > maxLimit ? maxLimit : parsed;
};

// Helper function to get table names with proper casing
const getTableNames = async () => {
    try {
        const [tables] = await safeQuery('SHOW TABLES');
        const tableMap = {};
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            tableMap[tableName.toLowerCase()] = tableName;
        });
        return tableMap;
    } catch (error) {
        console.error('Failed to get table names:', error);
        return {};
    }
};

// Get all tables
router.get('/', async (req, res) => {
    try {
        const [tables] = await safeQuery('SHOW TABLES');
        const tableNames = tables.map(table => Object.values(table)[0]);
        res.json({ success: true, data: tableNames });
    } catch (error) {
        console.error('Error fetching tables:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch database tables',
            details: error.message 
        });
    }
});


// ELIGIBLE CITIZEN ENDPOINTS


router.get('/eligible-citizens', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        // Support limit=all and cap extreme values for safety
        const limitRaw = (req.query.limit || '10').toString().toLowerCase();
        let limit;
        if (limitRaw === 'all' || limitRaw === '0' || limitRaw === '-1') {
            limit = 5000;
        } else {
            limit = parseInt(limitRaw) || 10;
            if (limit > 5000) limit = 5000;
        }
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE NationalID LIKE ? OR FName LIKE ? OR SName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        // Try different table name casings
        const tableVariants = ['EligibleCitizen', 'eligiblecitizen', 'eligible_citizen'];
        let citizens = [];
        let total = 0;
        let querySuccess = false;

        for (const tableName of tableVariants) {
            try {
                // First check if table exists
                const [tableCheck] = await safeQuery('SHOW TABLES LIKE ?', [tableName]);
                if (tableCheck.length === 0) continue;

                // Get table structure to ensure columns exist
                const [columns] = await safeQuery('DESCRIBE ??', [tableName]);
                const columnNames = columns.map(col => col.Field);

                // Build select clause with only existing columns, handling special names
                const baseCols = [];
                if (columnNames.includes('NationalID')) baseCols.push('NationalID');
                if (columnNames.includes('FName')) baseCols.push('FName');
                if (columnNames.includes('MName')) baseCols.push('MName');
                if (columnNames.includes('SName')) baseCols.push('SName');
                if (columnNames.includes('DOB')) baseCols.push('DOB');
                if (columnNames.includes('Gender')) baseCols.push('Gender');
                if (columnNames.includes('Status')) baseCols.push('Status');

                // Handle spaced column `Registration date` → alias to RegistrationDate
                const specialCols = [];
                if (columnNames.includes('Registration date')) {
                    specialCols.push('`Registration date` AS RegistrationDate');
                }

                const selectColumns = [...baseCols, ...specialCols].join(', ');
                if (!selectColumns) continue;

                const query = `
                    SELECT ${selectColumns}
                    FROM ?? 
                    ${whereClause}
                    ORDER BY NationalID DESC
                    LIMIT ? OFFSET ?
                `;

                const queryParams = [tableName, ...params, limit, offset];
                const [result] = await safeQuery(query, queryParams);
                
                const countQuery = `SELECT COUNT(*) as total FROM ?? ${whereClause}`;
                const countParams = [tableName, ...params];
                const [countRows] = await safeQuery(countQuery, countParams);
                
                citizens = result || [];
                total = countRows && countRows[0] ? countRows[0].total : 0;
                querySuccess = true;
                break;
            } catch (err) {
                console.warn(`Failed to query table ${tableName}:`, err.message);
                continue; // Try next table name variant
            }
        }

        if (!querySuccess) {
            return res.json({
                success: true,
                data: [],
                pagination: { page, limit, total: 0, pages: 0 },
                warning: 'EligibleCitizen table not found or empty'
            });
        }

        res.json({
            success: true,
            data: citizens,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching eligible citizens:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch eligible citizens',
            details: error.message 
        });
    }
});

router.post('/eligible-citizens', async (req, res) => {
    try {
        const { NationalID, FName, MName, SName, DOB, Gender } = req.body;

        if (!NationalID || !FName || !SName || !DOB || !Gender) {
            return res.status(400).json({ success: false, error: 'National ID, First Name, Surname, DOB, and Gender are required' });
        }

        const [result] = await safeQuery(
            'INSERT INTO eligiblecitizen (NationalID, FName, MName, SName, DOB, Gender) VALUES (?, ?, ?, ?, ?, ?)',
            [NationalID, FName, MName || null, SName, DOB, Gender]
        );

        res.json({
            success: true,
            data: { nationalId: NationalID },
            message: 'Eligible citizen created successfully'
        });
    } catch (error) {
        console.error('Error creating eligible citizen:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/eligible-citizens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { FName, MName, SName, DOB, Gender } = req.body;

        if (!FName || !SName || !DOB || !Gender) {
            return res.status(400).json({ success: false, error: 'First Name, Surname, DOB, and Gender are required' });
        }

        const [result] = await safeQuery(
            'UPDATE eligiblecitizen SET FName = ?, MName = ?, SName = ?, DOB = ?, Gender = ? WHERE NationalID = ?',
            [FName, MName || null, SName, DOB, Gender, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Citizen not found' });
        }

        res.json({ success: true, message: 'Citizen updated successfully' });
    } catch (error) {
        console.error('Error updating citizen:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/eligible-citizens/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM eligiblecitizen WHERE NationalID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Citizen not found' });
        }

        res.json({ success: true, message: 'Citizen deleted successfully' });
    } catch (error) {
        console.error('Error deleting citizen:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POLITICAL PARTY ENDPOINTS
// =============================================================================

router.get('/parties', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 5000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE PartyName LIKE ? OR Symbol LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        // Try different table name variants directly
        const tableVariants = ['PoliticalParty', 'politicalparty', 'political_party', 'parties'];
        let parties = [];
        let total = 0;
        let querySuccess = false;

        for (const tableName of tableVariants) {
            try {
                // Check if table exists first
                const [tableCheck] = await safeQuery('SHOW TABLES LIKE ?', [tableName]);
                if (tableCheck.length === 0) continue;

                // Build query with template literal (not ??)
                const query = `
                    SELECT COALESCE(PartyName, '') as PartyName, COALESCE(Symbol, '') as Symbol 
                    FROM ${tableName} 
                    ${whereClause}
                    ORDER BY PartyName
                    LIMIT ? OFFSET ?
                `;

                const [result] = await safeQuery(query, [...params, limit, offset]);
                
                const countQuery = `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`;
                const [countRows] = await safeQuery(countQuery, params);
                
                parties = result || [];
                total = countRows && countRows[0] ? countRows[0].total : 0;
                querySuccess = true;
                break;
            } catch (err) {
                console.warn(`Failed to query table ${tableName}:`, err.message);
                continue;
            }
        }

        if (!querySuccess) {
            return res.json({
                success: true,
                data: [],
                pagination: { page, limit, total: 0, pages: 0 },
                warning: 'PoliticalParty table not found'
            });
        }

        res.json({
            success: true,
            data: parties,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching political parties:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch political parties', 
            details: error.message 
        });
    }
});

router.post('/parties', async (req, res) => {
    try {
        const { PartyName, Symbol } = req.body;

        if (!PartyName || !Symbol) {
            return res.status(400).json({ success: false, error: 'Party Name and Symbol are required' });
        }

        await safeQuery(
            'INSERT INTO politicalparty (PartyName, Symbol) VALUES (?, ?)',
            [PartyName, Symbol]
        );

        res.json({
            success: true,
            data: { partyName: PartyName },
            message: 'Political party created successfully'
        });
    } catch (error) {
        console.error('Error creating political party:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/parties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Symbol } = req.body;

        if (!Symbol) {
            return res.status(400).json({ success: false, error: 'Symbol is required' });
        }

        const [result] = await db.promise().query(
            'UPDATE politicalparty SET Symbol = ? WHERE PartyName = ?',
            [Symbol, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Party not found' });
        }

        res.json({ success: true, message: 'Party updated successfully' });
    } catch (error) {
        console.error('Error updating party:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/parties/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM politicalparty WHERE PartyName = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Party not found' });
        }

        res.json({ success: true, message: 'Party deleted successfully' });
    } catch (error) {
        console.error('Error deleting party:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POSITIONS ENDPOINTS
// =============================================================================

router.get('/positions', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE PositionID LIKE ? OR Title LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(p.PositionID, '') as PositionID, COALESCE(p.Title, '') as Title
            FROM positions p
            ${whereClause}
            ORDER BY p.PositionID
            LIMIT ? OFFSET ?
        `;

        const [positions] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM positions
            ${whereClause}
        `, params);
        
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: positions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch positions', details: error.message });
    }
});

router.post('/positions', async (req, res) => {
    try {
        const { PositionID, Title } = req.body;

        if (!PositionID || !Title) {
            return res.status(400).json({ success: false, error: 'Position ID and Title are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO positions (PositionID, Title) VALUES (?, ?)',
            [PositionID, Title]
        );

        res.json({
            success: true,
            data: { positionId: PositionID },
            message: 'Position created successfully'
        });
    } catch (error) {
        console.error('Error creating position:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/positions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Title } = req.body;

        if (!Title) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }

        const [result] = await db.promise().query(
            'UPDATE positions SET Title = ? WHERE PositionID = ?',
            [Title, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Position not found' });
        }

        res.json({ success: true, message: 'Position updated successfully' });
    } catch (error) {
        console.error('Error updating position:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/positions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM positions WHERE PositionID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Position not found' });
        }

        res.json({ success: true, message: 'Position deleted successfully' });
    } catch (error) {
        console.error('Error deleting position:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// DISTRICT ENDPOINTS
// =============================================================================

router.get('/districts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE DistrictID LIKE ? OR DistrictName LIKE ? OR Region LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        // Try different table name casings
        const tableVariants = ['District', 'district', 'districts'];
        let districts = [];
        let total = 0;
        let querySuccess = false;

        for (const tableName of tableVariants) {
            try {
                const query = `
                    SELECT COALESCE(DistrictID, '') as DistrictID, COALESCE(DistrictName, '') as DistrictName, COALESCE(Region, '') as Region
                    FROM ${tableName}
                    ${whereClause}
                    ORDER BY DistrictID
                    LIMIT ? OFFSET ?
                `;

                const [result] = await safeQuery(query, [...params, limit, offset]);
                const [countRows] = await safeQuery(`
                    SELECT COUNT(*) as total FROM ${tableName}
                    ${whereClause}
                `, params);
                
                districts = result;
                total = countRows && countRows[0] ? countRows[0].total : 0;
                querySuccess = true;
                break;
            } catch (err) {
                continue;
            }
        }

        if (!querySuccess) {
            return res.json({
                success: true,
                data: [],
                pagination: { page, limit, total: 0, pages: 0 },
                warning: 'District table not found or empty'
            });
        }

        res.json({
            success: true,
            data: districts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch districts', details: error.message });
    }
});

router.post('/districts', async (req, res) => {
    try {
        const { DistrictID, DistrictName, Region } = req.body;

        if (!DistrictID || !DistrictName || !Region) {
            return res.status(400).json({ success: false, error: 'District ID, District Name, and Region are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO district (DistrictID, DistrictName, Region) VALUES (?, ?, ?)',
            [DistrictID, DistrictName, Region]
        );

        res.json({
            success: true,
            data: { districtId: DistrictID },
            message: 'District created successfully'
        });
    } catch (error) {
        console.error('Error creating district:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/districts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { DistrictName, Region } = req.body;

        if (!DistrictName || !Region) {
            return res.status(400).json({ success: false, error: 'District Name and Region are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE district SET DistrictName = ?, Region = ? WHERE DistrictID = ?',
            [DistrictName, Region, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'District not found' });
        }

        res.json({ success: true, message: 'District updated successfully' });
    } catch (error) {
        console.error('Error updating district:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/districts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM district WHERE DistrictID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'District not found' });
        }

        res.json({ success: true, message: 'District deleted successfully' });
    } catch (error) {
        console.error('Error deleting district:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// CONSTITUENCY ENDPOINTS
// =============================================================================

router.get('/constituencies', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE c.ConstituencyID LIKE ? OR c.Name LIKE ? OR d.DistrictName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(c.ConstituencyID, '') as ConstituencyID, COALESCE(c.Name, '') as ConstituencyName, 
                   COALESCE(d.DistrictName, '') as DistrictName, COALESCE(d.Region, '') as Region
            FROM constituency c
            JOIN district d ON c.DistrictID = d.DistrictID
            ${whereClause}
            ORDER BY c.ConstituencyID
            LIMIT ? OFFSET ?
        `;

        const [constituencies] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM constituency c
            JOIN district d ON c.DistrictID = d.DistrictID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: constituencies,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching constituencies:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/constituencies', async (req, res) => {
    try {
        const { ConstituencyID, Name, DistrictID } = req.body;

        if (!ConstituencyID || !Name || !DistrictID) {
            return res.status(400).json({ success: false, error: 'Constituency ID, Name, and District ID are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO constituency (ConstituencyID, Name, DistrictID) VALUES (?, ?, ?)',
            [ConstituencyID, Name, DistrictID]
        );

        res.json({
            success: true,
            data: { constituencyId: ConstituencyID },
            message: 'Constituency created successfully'
        });
    } catch (error) {
        console.error('Error creating constituency:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/constituencies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Name, DistrictID } = req.body;

        if (!Name || !DistrictID) {
            return res.status(400).json({ success: false, error: 'Name and District ID are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE constituency SET Name = ?, DistrictID = ? WHERE ConstituencyID = ?',
            [Name, DistrictID, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Constituency not found' });
        }

        res.json({ success: true, message: 'Constituency updated successfully' });
    } catch (error) {
        console.error('Error updating constituency:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/constituencies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM constituency WHERE ConstituencyID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Constituency not found' });
        }

        res.json({ success: true, message: 'Constituency deleted successfully' });
    } catch (error) {
        console.error('Error deleting constituency:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// WARD ENDPOINTS
// =============================================================================

router.get('/wards', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE w.WardID LIKE ? OR w.Name LIKE ? OR c.Name LIKE ? OR d.DistrictName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(w.WardID, '') as WardID, COALESCE(w.Name, '') as WardName, 
                   COALESCE(c.Name, '') as ConstituencyName, COALESCE(d.DistrictName, '') as DistrictName, COALESCE(d.Region, '') as Region
            FROM ward w
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            JOIN district d ON c.DistrictID = d.DistrictID
            ${whereClause}
            ORDER BY w.WardID
            LIMIT ? OFFSET ?
        `;

        const [wards] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM ward w
            JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: wards,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching wards:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/wards', async (req, res) => {
    try {
        const { WardID, Name, ConstituencyID } = req.body;

        if (!WardID || !Name || !ConstituencyID) {
            return res.status(400).json({ success: false, error: 'Ward ID, Name, and Constituency ID are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO ward (WardID, Name, ConstituencyID) VALUES (?, ?, ?)',
            [WardID, Name, ConstituencyID]
        );

        res.json({
            success: true,
            data: { wardId: WardID },
            message: 'Ward created successfully'
        });
    } catch (error) {
        console.error('Error creating ward:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/wards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Name, ConstituencyID } = req.body;

        if (!Name || !ConstituencyID) {
            return res.status(400).json({ success: false, error: 'Name and Constituency ID are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE ward SET Name = ?, ConstituencyID = ? WHERE WardID = ?',
            [Name, ConstituencyID, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Ward not found' });
        }

        res.json({ success: true, message: 'Ward updated successfully' });
    } catch (error) {
        console.error('Error updating ward:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/wards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM ward WHERE WardID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Ward not found' });
        }

        res.json({ success: true, message: 'Ward deleted successfully' });
    } catch (error) {
        console.error('Error deleting ward:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POLLING STATION ENDPOINTS
// =============================================================================

router.get('/polling-stations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE ps.Name LIKE ? OR ps.StationID LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(ps.StationID, '') as StationID, COALESCE(ps.Name, '') as StationName, 
                   COALESCE(w.Name, '') as WardName, COALESCE(c.Name, '') as ConstituencyName,
                   COALESCE(d.DistrictName, '') as DistrictName, COALESCE(d.Region, '') as Region
            FROM pollingstation ps
            LEFT JOIN ward w ON ps.WardID = w.WardID
            LEFT JOIN constituency c ON w.ConstituencyID = c.ConstituencyID
            LEFT JOIN district d ON c.DistrictID = d.DistrictID
            ${whereClause}
            ORDER BY ps.StationID
            LIMIT ? OFFSET ?
        `;

        const [stations] = await safeQuery(query, [...params, limit, offset]);
        const [countRows] = await safeQuery(`
            SELECT COUNT(*) as total FROM pollingstation ps
            LEFT JOIN ward w ON ps.WardID = w.WardID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: stations,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching polling stations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch polling stations', details: error.message });
    }
});

router.post('/polling-stations', async (req, res) => {
    try {
        const { StationID, Name, WardID } = req.body;

        if (!StationID || !Name || !WardID) {
            return res.status(400).json({ success: false, error: 'Station ID, Name, and Ward ID are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO pollingstation (StationID, Name, WardID) VALUES (?, ?, ?)',
            [StationID, Name, WardID]
        );

        res.json({
            success: true,
            data: { stationId: StationID },
            message: 'Polling station created successfully'
        });
    } catch (error) {
        console.error('Error creating polling station:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/polling-stations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Name, WardID } = req.body;

        if (!Name || !WardID) {
            return res.status(400).json({ success: false, error: 'Name and Ward ID are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE pollingstation SET Name = ?, WardID = ? WHERE StationID = ?',
            [Name, WardID, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Polling station not found' });
        }

        res.json({ success: true, message: 'Polling station updated successfully' });
    } catch (error) {
        console.error('Error updating polling station:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/polling-stations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM pollingstation WHERE StationID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Polling station not found' });
        }

        res.json({ success: true, message: 'Polling station deleted successfully' });
    } catch (error) {
        console.error('Error deleting polling station:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/elections', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        // Note: Election table structure may vary, using SELECT * to get all columns
        const query = `
            SELECT *
            FROM election
            ${whereClause}
            LIMIT ? OFFSET ?
        `;

        const [elections] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM election
            ${whereClause}
        `, params);
        
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: elections,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching elections:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch elections', details: error.message });
    }
});

router.post('/elections', async (req, res) => {
    try {
        const { ElectionName, StartDate, EndDate, Type, Status } = req.body;

        if (!ElectionName || !StartDate || !EndDate) {
            return res.status(400).json({ success: false, error: 'Election Name, Start Date, and End Date are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Election (ElectionName, StartDate, EndDate, Type, Status) VALUES (?, ?, ?, ?, ?)',
            [ElectionName, StartDate, EndDate, Type || 'General', Status || 'Planned']
        );

        res.json({
            success: true,
            data: { electionId: result.insertId },
            message: 'Election created successfully'
        });
    } catch (error) {
        console.error('Error creating election:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/elections/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ElectionName, StartDate, EndDate, Type, Status } = req.body;

        if (!ElectionName || !StartDate || !EndDate) {
            return res.status(400).json({ success: false, error: 'Election Name, Start Date, and End Date are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE Election SET ElectionName = ?, StartDate = ?, EndDate = ?, Type = ?, Status = ? WHERE ElectionID = ?',
            [ElectionName, StartDate, EndDate, Type, Status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        res.json({ success: true, message: 'Election updated successfully' });
    } catch (error) {
        console.error('Error updating election:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/elections/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM Election WHERE ElectionID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Election not found' });
        }

        res.json({ success: true, message: 'Election deleted successfully' });
    } catch (error) {
        console.error('Error deleting election:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// VOTER ENDPOINTS


router.get('/voters', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 500;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE v.NationalID LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        // Try different table name casings and fallback queries
        const tableVariants = [
            { voter: 'Voter', citizen: 'EligibleCitizen', station: 'PollingStation' },
            { voter: 'voter', citizen: 'eligiblecitizen', station: 'pollingstation' },
            { voter: 'voters', citizen: 'eligible_citizen', station: 'polling_station' }
        ];
        
        let voters = [];
        let total = 0;
        let querySuccess = false;

        for (const tables of tableVariants) {
            try {
                const query = `
                    SELECT v.VoterID, v.NationalID, 
                           CONCAT(COALESCE(ec.FName, ''), 
                                  CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                                  CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as FullName,
                           COALESCE(ps.Name, '') as StationName, 
                           COALESCE(ec.DOB, '') as DOB, 
                           COALESCE(ec.Gender, '') as Gender, 
                           COALESCE(v.StationID, '') as StationID
                    FROM ${tables.voter} v
                    LEFT JOIN ${tables.citizen} ec ON v.NationalID = ec.NationalID
                    LEFT JOIN ${tables.station} ps ON v.StationID = ps.StationID
                    ${whereClause}
                    ORDER BY v.VoterID DESC
                    LIMIT ? OFFSET ?
                `;

                const [result] = await safeQuery(query, [...params, limit, offset]);
                const [countRows] = await safeQuery(`
                    SELECT COUNT(*) as total FROM ${tables.voter} v
                    LEFT JOIN ${tables.citizen} ec ON v.NationalID = ec.NationalID
                    ${whereClause}
                `, params);
                
                voters = result;
                total = countRows && countRows[0] ? countRows[0].total : 0;
                querySuccess = true;
                break;
            } catch (err) {
                continue;
            }
        }

        // Fallback to simple voter table query with proper data handling
        if (!querySuccess) {
            try {
                // Check if basic Voter table exists
                const [tableCheck] = await safeQuery('SHOW TABLES LIKE ?', ['Voter']);
                if (tableCheck.length > 0) {
                    const simpleQuery = `
                        SELECT 
                            VoterID, 
                            NationalID, 
                            StationID,
                            'Data not linked' as FullName,
                            'Unknown' as StationName,
                            NULL as DOB,
                            NULL as Gender
                        FROM Voter 
                        ORDER BY VoterID DESC 
                        LIMIT ? OFFSET ?
                    `;
                    const [result] = await safeQuery(simpleQuery, [limit, offset]);
                    const [countRows] = await safeQuery('SELECT COUNT(*) as total FROM Voter');
                    
                    voters = result;
                    total = countRows && countRows[0] ? countRows[0].total : 0;
                    querySuccess = true;
                }
            } catch (err) {
                console.warn('Fallback voter query failed:', err.message);
            }
        }

        if (!querySuccess) {
            return res.json({
                success: true,
                data: [],
                pagination: { page, limit, total: 0, pages: 0 },
                warning: 'Voter table not found or empty'
            });
        }

        res.json({
            success: true,
            data: voters,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching voters:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch voters', details: error.message });
    }
});

router.post('/voters', async (req, res) => {
    try {
        const { NationalID, StationID } = req.body;

        if (!NationalID || !StationID) {
            return res.status(400).json({ success: false, error: 'National ID and Station ID are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Voter (NationalID, StationID) VALUES (?, ?)',
            [NationalID, StationID]
        );

        res.json({
            success: true,
            data: { voterId: result.insertId },
            message: 'Voter created successfully'
        });
    } catch (error) {
        console.error('Error creating voter:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/voters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { StationID } = req.body;

        if (!StationID) {
            return res.status(400).json({ success: false, error: 'Station ID is required' });
        }

        const [result] = await db.promise().query(
            'UPDATE Voter SET StationID = ? WHERE VoterID = ?',
            [StationID, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Voter not found' });
        }

        res.json({ success: true, message: 'Voter updated successfully' });
    } catch (error) {
        console.error('Error updating voter:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/voters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM Voter WHERE VoterID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Voter not found' });
        }

        res.json({ success: true, message: 'Voter deleted successfully' });
    } catch (error) {
        console.error('Error deleting voter:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// CANDIDATE ENDPOINTS
// =============================================================================

router.get('/candidates', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE c.NationalID LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ? OR c.PartyName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT c.CandidateID, COALESCE(c.ElectionID, '') as ElectionID, COALESCE(c.NationalID, '') as NationalID,
                   CONCAT(COALESCE(ec.FName, ''), 
                          CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                          CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as FullName,
                   COALESCE(p.Title, '') as Position, COALESCE(c.PartyName, '') as PartyName,
                   COALESCE(w.Name, '') as Ward, COALESCE(con.Name, '') as Constituency,
                   COALESCE(ec.DOB, '') as DOB, COALESCE(ec.Gender, '') as Gender
            FROM Candidate c
            JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
            JOIN Positions p ON c.PositionID = p.PositionID
            LEFT JOIN Ward w ON c.WardID = w.WardID
            LEFT JOIN Constituency con ON c.ConstituencyID = con.ConstituencyID
            ${whereClause}
            ORDER BY c.CandidateID DESC
            LIMIT ? OFFSET ?
        `;

        const [candidates] = await safeQuery(query, [...params, limit, offset]);
        const [countRows] = await safeQuery(`
            SELECT COUNT(*) as total FROM Candidate c
            JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: candidates,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching candidates:', error);
        console.error('Error details:', error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/candidates', async (req, res) => {
    try {
        const { ElectionID, NationalID, PositionID, PartyName, ConstituencyID, WardID } = req.body;

        if (!ElectionID || !NationalID || !PositionID || !PartyName) {
            return res.status(400).json({ success: false, error: 'Election ID, National ID, Position ID, and Party Name are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Candidate (ElectionID, NationalID, PositionID, PartyName, ConstituencyID, WardID) VALUES (?, ?, ?, ?, ?, ?)',
            [ElectionID, NationalID, PositionID, PartyName, ConstituencyID || null, WardID || null]
        );

        res.json({
            success: true,
            data: { candidateId: result.insertId },
            message: 'Candidate created successfully'
        });
    } catch (error) {
        console.error('Error creating candidate:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/candidates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ElectionID, PositionID, PartyName, ConstituencyID, WardID } = req.body;

        if (!ElectionID || !PositionID || !PartyName) {
            return res.status(400).json({ success: false, error: 'Election ID, Position ID, and Party Name are required' });
        }

        const [result] = await db.promise().query(
            'UPDATE Candidate SET ElectionID = ?, PositionID = ?, PartyName = ?, ConstituencyID = ?, WardID = ? WHERE CandidateID = ?',
            [ElectionID, PositionID, PartyName, ConstituencyID || null, WardID || null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Candidate not found' });
        }

        res.json({ success: true, message: 'Candidate updated successfully' });
    } catch (error) {
        console.error('Error updating candidate:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/candidates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.promise().query('DELETE FROM Candidate WHERE CandidateID = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Candidate not found' });
        }

        res.json({ success: true, message: 'Candidate deleted successfully' });
    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// RUNNING MATE ENDPOINTS
// =============================================================================

router.get('/running-mates', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE rm.NationalID LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT rm.NationalID, rm.CandidateID,
                   CONCAT(COALESCE(ec.FName, ''), 
                          CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                          CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as FullName,
                   COALESCE(ec.DOB, '') as DOB, COALESCE(ec.Gender, '') as Gender
            FROM runningmate rm
            LEFT JOIN eligiblecitizen ec ON rm.NationalID = ec.NationalID
            ${whereClause}
            ORDER BY rm.NationalID
            LIMIT ? OFFSET ?
        `;

        const [runningMates] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM runningmate rm
            LEFT JOIN eligiblecitizen ec ON rm.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: runningMates,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching running mates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/running-mates', async (req, res) => {
    try {
        const { CandidateID, NationalID, PartyName } = req.body;

        if (!CandidateID || !NationalID || !PartyName) {
            return res.status(400).json({ success: false, error: 'Candidate ID, National ID, and Party Name are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO RunningMate (CandidateID, NationalID, PartyName) VALUES (?, ?, ?)',
            [CandidateID, NationalID, PartyName]
        );

        res.json({
            success: true,
            data: { runningMateId: result.insertId },
            message: 'Running mate created successfully'
        });
    } catch (error) {
        console.error('Error creating running mate:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// RESULTS ENDPOINTS
// =============================================================================

router.get('/results', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE e.ElectionName LIKE ? OR p.Title LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT r.ResultID, r.ElectionID, r.PositionID, r.CandidateID, r.TotalVotes,
                   r.ConstituencyID, r.WardID, r.DateDeclared,
                   e.ElectionName, p.Title as Position,
                   CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as CandidateName,
                   COALESCE(c.Name, 'N/A') as Constituency, COALESCE(w.Name, 'N/A') as Ward
            FROM results r
            JOIN election e ON r.ElectionID = e.ElectionID
            JOIN positions p ON r.PositionID = p.PositionID
            JOIN candidate cand ON r.CandidateID = cand.CandidateID
            JOIN eligiblecitizen ec ON cand.NationalID = ec.NationalID
            LEFT JOIN constituency c ON r.ConstituencyID = c.ConstituencyID
            LEFT JOIN ward w ON r.WardID = w.WardID
            ${whereClause}
            ORDER BY r.ResultID DESC
            LIMIT ? OFFSET ?
        `;

        const [results] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM results r
            JOIN election e ON r.ElectionID = e.ElectionID
            JOIN candidate cand ON r.CandidateID = cand.CandidateID
            JOIN eligiblecitizen ec ON cand.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: results,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/results', async (req, res) => {
    try {
        const { ElectionID, PositionID, CandidateID, TotalVotes, ConstituencyID, WardID, DateDeclared } = req.body;

        if (!ElectionID || !PositionID || !CandidateID || !TotalVotes || !DateDeclared) {
            return res.status(400).json({ success: false, error: 'Election ID, Position ID, Candidate ID, Total Votes, and Date Declared are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Results (ElectionID, PositionID, CandidateID, TotalVotes, ConstituencyID, WardID, DateDeclared) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ElectionID, PositionID, CandidateID, TotalVotes, ConstituencyID || null, WardID || null, DateDeclared]
        );

        res.json({
            success: true,
            data: { resultId: result.insertId },
            message: 'Result created successfully'
        });
    } catch (error) {
        console.error('Error creating result:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// FINAL WINNERS ENDPOINTS
// =============================================================================

// POST endpoint to calculate and save final winners to database
router.post('/final-winners/calculate', async (req, res) => {
    try {
        console.log('Starting winner calculation and save process...');
        
        // First, get all winners from Vote table
        const winnersQuery = `
            SELECT 
                vote_counts.CandidateID,
                vote_counts.PositionID,
                c.ConstituencyID,
                c.WardID,
                vote_counts.TotalVotes,
                NOW() AS Date
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) AS TotalVotes
                FROM Vote v
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN Candidate c ON vote_counts.CandidateID = c.CandidateID
            WHERE vote_counts.TotalVotes = (
                CASE 
                    WHEN vote_counts.PositionID = 'PRES' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            WHERE v2.PositionID = 'PRES'
                            GROUP BY v2.CandidateID
                        ) pres_votes
                    )
                    WHEN vote_counts.PositionID = 'MP' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'MP'
                            AND c2.ConstituencyID = c.ConstituencyID
                            GROUP BY v2.CandidateID
                        ) mp_votes
                    )
                    WHEN vote_counts.PositionID = 'COUNC' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'COUNC'
                            AND c2.WardID = c.WardID
                            GROUP BY v2.CandidateID
                        ) counc_votes
                    )
                END
            )
        `;

        const [winners] = await db.promise().query(winnersQuery);
        console.log(`Found ${winners.length} winners to save`);

        if (winners.length === 0) {
            return res.json({
                success: false,
                message: 'No winners found. Make sure there are votes in the database.',
                data: { saved: 0, skipped: 0 }
            });
        }

        // Clear existing winners (optional - remove if you want to keep history)
        await db.promise().query('DELETE FROM FinalWinners');
        console.log('Cleared existing winners');

        // Insert each winner into FinalWinners table
        let saved = 0;
        let skipped = 0;
        
        for (const winner of winners) {
            try {
                await db.promise().query(
                    `INSERT INTO FinalWinners 
                    (CandidateID, PositionID, ConstituencyID, WardID, TotalVotes, Date) 
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        winner.CandidateID,
                        winner.PositionID,
                        winner.ConstituencyID || null,
                        winner.WardID || null,
                        winner.TotalVotes,
                        winner.Date
                    ]
                );
                saved++;
                console.log(`Saved winner: CandidateID ${winner.CandidateID}, Position ${winner.PositionID}, Votes: ${winner.TotalVotes}`);
            } catch (error) {
                console.error(`Failed to save winner ${winner.CandidateID}:`, error.message);
                skipped++;
            }
        }

        console.log(`Winner calculation complete: ${saved} saved, ${skipped} skipped`);

        res.json({
            success: true,
            message: `Successfully calculated and saved ${saved} winners to the database`,
            data: {
                saved,
                skipped,
                total: winners.length,
                winners: winners.map(w => ({
                    CandidateID: w.CandidateID,
                    PositionID: w.PositionID,
                    TotalVotes: w.TotalVotes
                }))
            }
        });

    } catch (error) {
        console.error('Error calculating and saving winners:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to calculate and save winners',
            details: error.message 
        });
    }
});

router.get('/final-winners', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];
        if (search) {
            whereClause = 'HAVING (p.Title LIKE ? OR e.FName LIKE ? OR e.SName LIKE ? OR c.PartyName LIKE ?)';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT 
                vote_counts.CandidateID,
                vote_counts.PositionID,
                c.ConstituencyID,
                c.WardID,
                CONCAT(COALESCE(e.FName, ''), 
                       CASE WHEN e.MName IS NOT NULL AND e.MName != '' THEN CONCAT(' ', e.MName) ELSE '' END,
                       CASE WHEN e.SName IS NOT NULL AND e.SName != '' THEN CONCAT(' ', e.SName) ELSE '' END) AS WinnerName,
                vote_counts.TotalVotes,
                p.Title AS PositionTitle,
                COALESCE(c.PartyName, '') AS PartyName,
                COALESCE(con.Name, 'N/A') AS Constituency,
                COALESCE(w.Name, 'N/A') AS Ward
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) AS TotalVotes
                FROM Vote v
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN Candidate c ON vote_counts.CandidateID = c.CandidateID
            JOIN EligibleCitizen e ON c.NationalID = e.NationalID
            JOIN Positions p ON vote_counts.PositionID = p.PositionID
            LEFT JOIN Constituency con ON c.ConstituencyID = con.ConstituencyID
            LEFT JOIN Ward w ON c.WardID = w.WardID
            WHERE vote_counts.TotalVotes = (
                CASE 
                    -- For President: Get max votes nationally
                    WHEN vote_counts.PositionID = 'PRES' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            WHERE v2.PositionID = 'PRES'
                            GROUP BY v2.CandidateID
                        ) pres_votes
                    )
                    -- For MP: Get max votes per constituency
                    WHEN vote_counts.PositionID = 'MP' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'MP'
                            AND c2.ConstituencyID = c.ConstituencyID
                            GROUP BY v2.CandidateID
                        ) mp_votes
                    )
                    -- For Councillor: Get max votes per ward
                    WHEN vote_counts.PositionID = 'COUNC' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'COUNC'
                            AND c2.WardID = c.WardID
                            GROUP BY v2.CandidateID
                        ) counc_votes
                    )
                END
            )
            ${whereClause}
            ORDER BY 
                FIELD(vote_counts.PositionID, 'PRES', 'MP', 'COUNC'),
                vote_counts.PositionID,
                con.Name,
                w.Name,
                vote_counts.TotalVotes DESC
            LIMIT ? OFFSET ?
        `;

        const [winners] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) AS TotalVotes
                FROM Vote v
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN Candidate c ON vote_counts.CandidateID = c.CandidateID
            JOIN EligibleCitizen e ON c.NationalID = e.NationalID
            JOIN Positions p ON vote_counts.PositionID = p.PositionID
            WHERE vote_counts.TotalVotes = (
                CASE 
                    WHEN vote_counts.PositionID = 'PRES' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            WHERE v2.PositionID = 'PRES'
                            GROUP BY v2.CandidateID
                        ) pres_votes
                    )
                    WHEN vote_counts.PositionID = 'MP' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'MP'
                            AND c2.ConstituencyID = c.ConstituencyID
                            GROUP BY v2.CandidateID
                        ) mp_votes
                    )
                    WHEN vote_counts.PositionID = 'COUNC' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'COUNC'
                            AND c2.WardID = c.WardID
                            GROUP BY v2.CandidateID
                        ) counc_votes
                    )
                END
            )
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: winners,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching final winners:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// ELECTION OFFICIAL ENDPOINTS
// =============================================================================

router.get('/election-officials', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE eo.NationalID LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ? OR eo.Role LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT eo.OfficialID, eo.NationalID,
                   CONCAT(ec.FName, ' ', COALESCE(ec.MName, ''), ' ', ec.SName) as FullName,
                   eo.Role, eo.StationID, COALESCE(ps.Name, 'N/A') as StationName
            FROM electionofficial eo
            JOIN eligiblecitizen ec ON eo.NationalID = ec.NationalID
            LEFT JOIN pollingstation ps ON eo.StationID = ps.StationID
            ${whereClause}
            ORDER BY eo.OfficialID DESC
            LIMIT ? OFFSET ?
        `;

        const [officials] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM electionofficial eo
            JOIN eligiblecitizen ec ON eo.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: officials,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching election officials:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/election-officials', async (req, res) => {
    try {
        const { NationalID, Role, StationID } = req.body;

        if (!NationalID || !Role) {
            return res.status(400).json({ success: false, error: 'National ID and Role are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO ElectionOfficial (NationalID, Role, StationID) VALUES (?, ?, ?)',
            [NationalID, Role, StationID || null]
        );

        res.json({
            success: true,
            data: { officialId: result.insertId },
            message: 'Election official created successfully'
        });
    } catch (error) {
        console.error('Error creating election official:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// PARTY AGENT ENDPOINTS
// =============================================================================

router.get('/party-agents', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE pa.NationalID LIKE ? OR ec.FName LIKE ? OR ec.SName LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT pa.NationalID, pa.StationID,
                   CONCAT(COALESCE(ec.FName, ''), 
                          CASE WHEN ec.MName IS NOT NULL AND ec.MName != '' THEN CONCAT(' ', ec.MName) ELSE '' END, 
                          CASE WHEN ec.SName IS NOT NULL AND ec.SName != '' THEN CONCAT(' ', ec.SName) ELSE '' END) as FullName,
                   COALESCE(ps.Name, '') as StationName
            FROM partyagent pa
            LEFT JOIN eligiblecitizen ec ON pa.NationalID = ec.NationalID
            LEFT JOIN pollingstation ps ON pa.StationID = ps.StationID
            ${whereClause}
            ORDER BY pa.NationalID DESC
            LIMIT ? OFFSET ?
        `;

        const [agents] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM partyagent pa
            LEFT JOIN eligiblecitizen ec ON pa.NationalID = ec.NationalID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: agents,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching party agents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/party-agents', async (req, res) => {
    try {
        const { ElectionID, PartyName, NationalID, StationID } = req.body;

        if (!ElectionID || !PartyName || !NationalID || !StationID) {
            return res.status(400).json({ success: false, error: 'Election ID, Party Name, National ID, and Station ID are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO PartyAgent (ElectionID, PartyName, NationalID, StationID) VALUES (?, ?, ?, ?)',
            [ElectionID, PartyName, NationalID, StationID]
        );

        res.json({
            success: true,
            data: { agentId: result.insertId },
            message: 'Party agent created successfully'
        });
    } catch (error) {
        console.error('Error creating party agent:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// BALLOT ENDPOINTS
// =============================================================================

router.get('/ballots', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE b.SerialNumber LIKE ? OR ps.Name LIKE ?';
            params = [`%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT b.BallotID, b.ElectionID, b.StationID, b.SerialNumber,
                   COALESCE(ps.Name, '') as StationName
            FROM ballot b
            LEFT JOIN pollingstation ps ON b.StationID = ps.StationID
            ${whereClause}
            ORDER BY b.BallotID DESC
            LIMIT ? OFFSET ?
        `;

        const [ballots] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM ballot b
            LEFT JOIN pollingstation ps ON b.StationID = ps.StationID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: ballots,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching ballots:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/ballots', async (req, res) => {
    try {
        const { ElectionID, StationID, SerialNumber, IssuedToVoterID } = req.body;

        if (!ElectionID || !StationID || !SerialNumber) {
            return res.status(400).json({ success: false, error: 'Election ID, Station ID, and Serial Number are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Ballot (ElectionID, StationID, SerialNumber, IssuedToVoterID) VALUES (?, ?, ?, ?)',
            [ElectionID, StationID, SerialNumber, IssuedToVoterID || null]
        );

        res.json({
            success: true,
            data: { ballotId: result.insertId },
            message: 'Ballot created successfully'
        });
    } catch (error) {
        console.error('Error creating ballot:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// LOGISTICS ENDPOINTS
// =============================================================================

router.get('/logistics', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE l.ItemName LIKE ? OR ps.Name LIKE ? OR l.Status LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(l.LogisticsID, '') as LogisticsID, COALESCE(l.ElectionID, '') as ElectionID, 
                   COALESCE(l.StationID, '') as StationID, COALESCE(l.ItemName, '') as ItemName, 
                   COALESCE(l.Quantity, '') as Quantity, COALESCE(l.DeliveryDate, '') as DeliveryDate, 
                   COALESCE(l.DeliveredBy, '') as DeliveredBy, COALESCE(l.ReceivedBy, '') as ReceivedBy, 
                   COALESCE(l.Status, '') as Status, COALESCE(ps.Name, '') as StationName
            FROM logistics l
            LEFT JOIN pollingstation ps ON l.StationID = ps.StationID
            ${whereClause}
            ORDER BY l.LogisticsID DESC
            LIMIT ? OFFSET ?
        `;

        const [logistics] = await safeQuery(query, [...params, limit, offset]);
        const [countRows] = await safeQuery(`
            SELECT COUNT(*) as total FROM logistics l
            LEFT JOIN pollingstation ps ON l.StationID = ps.StationID
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: logistics,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching logistics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/logistics', async (req, res) => {
    try {
        const { ElectionID, StationID, ItemName, Quantity, DeliveryDate, DeliveredBy, ReceivedBy, Status } = req.body;

        if (!ElectionID || !StationID || !ItemName || !Quantity || !DeliveryDate) {
            return res.status(400).json({ success: false, error: 'Election ID, Station ID, Item Name, Quantity, and Delivery Date are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Logistics (ElectionID, StationID, ItemName, Quantity, DeliveryDate, DeliveredBy, ReceivedBy, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [ElectionID, StationID, ItemName, Quantity, DeliveryDate, DeliveredBy || null, ReceivedBy || null, Status || 'Pending']
        );

        res.json({
            success: true,
            data: { logisticsId: result.insertId },
            message: 'Logistics item created successfully'
        });
    } catch (error) {
        console.error('Error creating logistics item:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// VOTES ENDPOINTS
// =============================================================================

router.get('/votes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE v.VoteID LIKE ?';
            params = [`%${search}%`];
        }

        const query = `
            SELECT 
                COALESCE(v.VoteID, '') as VoteID, 
                COALESCE(v.VoterID, '') as VoterID, 
                COALESCE(v.CandidateID, '') as CandidateID, 
                COALESCE(v.ElectionID, '') as ElectionID
            FROM vote v
            ${whereClause}
            ORDER BY v.VoteID DESC
            LIMIT ? OFFSET ?
        `;

        const [votes] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total FROM vote v
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: votes,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching votes:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch votes', details: error.message });
    }
});

// =============================================================================
// INCIDENT ENDPOINTS
// =============================================================================

router.get('/incidents', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseLimit(req, 10, 10000);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let params = [];

        if (search) {
            whereClause = 'WHERE i.ReportedBy LIKE ? OR i.Description LIKE ? OR i.Status LIKE ?';
            params = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        const query = `
            SELECT COALESCE(i.IncidentID, '') as IncidentID, COALESCE(i.ElectionID, '') as ElectionID, 
                   COALESCE(i.StationID, '') as StationID, COALESCE(i.ReportedBy, '') as ReportedBy, 
                   COALESCE(i.Description, '') as Description, COALESCE(i.Status, '') as Status, 
                   COALESCE(i.DateReported, '') as DateReported, COALESCE(ps.Name, '') as StationName
            FROM Incident i
            LEFT JOIN PollingStation ps ON i.StationID = ps.StationID
            ${whereClause}
            ORDER BY i.IncidentID DESC
            LIMIT ? OFFSET ?
        `;

        const [incidents] = await safeQuery(query, [...params, limit, offset]);
        const [countRows] = await safeQuery(`
            SELECT COUNT(*) as total FROM Incident i
            ${whereClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: incidents,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching incidents:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/incidents', async (req, res) => {
    try {
        const { ElectionID, StationID, ReportedBy, Description, Status } = req.body;

        if (!ElectionID || !ReportedBy || !Description) {
            return res.status(400).json({ success: false, error: 'Election ID, Reported By, and Description are required' });
        }

        const [result] = await db.promise().query(
            'INSERT INTO Incident (ElectionID, StationID, ReportedBy, Description, Status) VALUES (?, ?, ?, ?, ?)',
            [ElectionID, StationID || null, ReportedBy, Description, Status || 'Open']
        );

        res.json({
            success: true,
            data: { incidentId: result.insertId },
            message: 'Incident created successfully'
        });
    } catch (error) {
        console.error('Error creating incident:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Enhanced final-winners endpoint with position filtering
router.get('/final-winners-filtered', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const position = req.query.position || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let havingClause = '';
        let params = [];
        
        if (position) {
            whereClause = `AND vote_counts.PositionID = ?`;
        }
        
        if (search && position) {
            havingClause = 'HAVING (p.Title LIKE ? OR e.FName LIKE ? OR e.SName LIKE ? OR c.PartyName LIKE ?)';
            params = [position, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        } else if (search) {
            havingClause = 'HAVING (p.Title LIKE ? OR e.FName LIKE ? OR e.SName LIKE ? OR c.PartyName LIKE ?)';
            params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
        } else if (position) {
            params = [position];
        }

        const query = `
            SELECT 
                vote_counts.CandidateID,
                vote_counts.PositionID,
                c.ConstituencyID,
                c.WardID,
                CONCAT(COALESCE(e.FName, ''), 
                       CASE WHEN e.MName IS NOT NULL AND e.MName != '' THEN CONCAT(' ', e.MName) ELSE '' END,
                       CASE WHEN e.SName IS NOT NULL AND e.SName != '' THEN CONCAT(' ', e.SName) ELSE '' END) AS WinnerName,
                vote_counts.TotalVotes,
                p.Title AS PositionTitle,
                COALESCE(c.PartyName, '') AS PartyName,
                COALESCE(con.Name, 'N/A') AS Constituency,
                COALESCE(w.Name, 'N/A') AS Ward
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) AS TotalVotes
                FROM Vote v
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN Candidate c ON vote_counts.CandidateID = c.CandidateID
            JOIN EligibleCitizen e ON c.NationalID = e.NationalID
            JOIN Positions p ON vote_counts.PositionID = p.PositionID
            LEFT JOIN Constituency con ON c.ConstituencyID = con.ConstituencyID
            LEFT JOIN Ward w ON c.WardID = w.WardID
            WHERE vote_counts.TotalVotes = (
                CASE 
                    WHEN vote_counts.PositionID = 'PRES' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            WHERE v2.PositionID = 'PRES'
                            GROUP BY v2.CandidateID
                        ) pres_votes
                    )
                    WHEN vote_counts.PositionID = 'MP' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'MP'
                            AND c2.ConstituencyID = c.ConstituencyID
                            GROUP BY v2.CandidateID
                        ) mp_votes
                    )
                    WHEN vote_counts.PositionID = 'COUNC' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'COUNC'
                            AND c2.WardID = c.WardID
                            GROUP BY v2.CandidateID
                        ) counc_votes
                    )
                END
            )
            ${whereClause}
            ${havingClause}
            ORDER BY 
                FIELD(vote_counts.PositionID, 'PRES', 'MP', 'COUNC'),
                vote_counts.PositionID,
                con.Name,
                w.Name,
                vote_counts.TotalVotes DESC
            LIMIT ? OFFSET ?
        `;

        const [winners] = await db.promise().query(query, [...params, limit, offset]);
        const [countRows] = await db.promise().query(`
            SELECT COUNT(*) as total
            FROM (
                SELECT 
                    v.CandidateID,
                    v.PositionID,
                    COUNT(*) AS TotalVotes
                FROM Vote v
                GROUP BY v.CandidateID, v.PositionID
            ) vote_counts
            JOIN Candidate c ON vote_counts.CandidateID = c.CandidateID
            JOIN EligibleCitizen e ON c.NationalID = e.NationalID
            JOIN Positions p ON vote_counts.PositionID = p.PositionID
            WHERE vote_counts.TotalVotes = (
                CASE 
                    WHEN vote_counts.PositionID = 'PRES' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            WHERE v2.PositionID = 'PRES'
                            GROUP BY v2.CandidateID
                        ) pres_votes
                    )
                    WHEN vote_counts.PositionID = 'MP' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'MP'
                            AND c2.ConstituencyID = c.ConstituencyID
                            GROUP BY v2.CandidateID
                        ) mp_votes
                    )
                    WHEN vote_counts.PositionID = 'COUNC' THEN (
                        SELECT MAX(vote_count)
                        FROM (
                            SELECT COUNT(*) as vote_count
                            FROM Vote v2
                            JOIN Candidate c2 ON v2.CandidateID = c2.CandidateID
                            WHERE v2.PositionID = 'COUNC'
                            AND c2.WardID = c.WardID
                            GROUP BY v2.CandidateID
                        ) counc_votes
                    )
                END
            )
            ${whereClause}
            ${havingClause}
        `, params);
        const total = countRows && countRows[0] ? countRows[0].total : 0;

        res.json({
            success: true,
            data: winners,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching final winners:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch final winners', details: error.message });
    }
});

module.exports = router;
