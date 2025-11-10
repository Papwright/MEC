const db = require('../config/database');


async function safeQuery(sql, params = []) {
    const start = Date.now();
    try {
        const [rows] = await db.promise().query(sql, params);
        const duration = Date.now() - start;
        if (duration > 5000) {
            console.warn(`Slow query (${duration}ms):`, sql.slice(0, 120));
        }
        return rows;
    } catch (error) {
        const duration = Date.now() - start;
        console.error('DB Query Failed', {
            sql: sql.slice(0, 160),
            params,
            duration: `${duration}ms`,
            error: error.message
        });
        throw error;
    }
}

// Common fragments to avoid duplication
const candidateJoins = `
    LEFT JOIN EligibleCitizen ec ON c.NationalID = ec.NationalID
    LEFT JOIN Positions p ON c.PositionID = p.PositionID
    LEFT JOIN PoliticalParty pp ON c.PartyName = pp.PartyName
    LEFT JOIN Ward w ON c.WardID = w.WardID
    LEFT JOIN Constituency cst ON c.ConstituencyID = cst.ConstituencyID
    LEFT JOIN District d ON cst.DistrictID = d.DistrictID
`;

const candidateGroupBy = `
GROUP BY c.CandidateID, p.PositionID, p.Title, ec.FName, ec.MName, ec.SName,
         pp.PartyName, pp.Symbol, w.Name, cst.Name, d.DistrictName, d.Region
`;

module.exports = {
    safeQuery,
    fragments: {
        candidateJoins,
        candidateGroupBy
    }
};
