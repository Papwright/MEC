# Age Restriction Update for Malawi Tripartite Elections

## Overview
This update adds age validation to ensure only eligible citizens above 18 years old can register as voters or candidates in the voting system.

## Changes Made

### 1. Backend Changes

#### Routes Updated:
- **`routes/auth.js`**: Added age validation to voter registration endpoint
- **`routes/admin.js`**: Added age validation to admin voter registration and candidate registration endpoints

#### New Features:
- **Age Calculation Function**: Added `calculateAge()` utility function to calculate age from date of birth
- **Age Validation**: All registration endpoints now check if the citizen is at least 18 years old
- **Enhanced Error Messages**: Clear error messages indicating age requirements and current age

#### Database Queries Updated:
- Added `DateOfBirth` field to voter listing queries
- Added `DateOfBirth` field to eligible citizens queries
- Enhanced voter detail queries to include age information

### 2. Frontend Changes

#### JavaScript Updates:
- **`public/script.js`**: Added `calculateAgeFromDOB()` function for frontend age calculation
- **Voter Display**: Enhanced voter listing to show age information
- **Voter Details**: Updated voter detail view to include age

### 3. Database Schema Update

#### New Column:
- **`DateOfBirth`**: Added to `eligiblecitizen` table for age validation
- **Index**: Added index on `DateOfBirth` for better query performance

## Installation Instructions

### 1. Database Update
Run the provided SQL script to add the DateOfBirth column:

```sql
-- Execute the database_update.sql file
mysql -u your_username -p your_database < database_update.sql
```

### 2. Update Existing Data
For existing eligible citizens, you'll need to populate the DateOfBirth field:

```sql
-- Example: Update existing records with sample dates
-- Replace with actual birth dates from your records
UPDATE eligiblecitizen SET DateOfBirth = '1990-01-01' WHERE DateOfBirth IS NULL;
```

### 3. Restart Application
Restart your Node.js application to apply the changes:

```bash
npm start
# or
npm run dev
```

## Age Validation Rules

### Voter Registration:
- **Minimum Age**: 18 years old
- **Validation**: Checks date of birth from eligiblecitizen table
- **Error Handling**: Clear messages for underage citizens
- **Missing Data**: Requires date of birth to be present in records

### Candidate Registration:
- **Minimum Age**: 18 years old
- **Validation**: Same as voter registration
- **Error Handling**: Prevents underage candidates from being added

### Admin Registration:
- **Same Rules**: Admin voter registration follows same age requirements
- **Enhanced Messages**: Admin-specific error messages for better clarity

## Error Messages

### For Underage Citizens:
- **Voter Registration**: "You must be at least 18 years old to register to vote. You are currently X years old."
- **Candidate Registration**: "Candidate must be at least 18 years old. Current age: X years."
- **Admin Registration**: "Citizen must be at least 18 years old to register to vote. Current age: X years."

### For Missing Date of Birth:
- **Voter Registration**: "Date of birth not found in records. Please contact the electoral commission to update your information."
- **Candidate Registration**: "Date of birth not found in records. Please update citizen information before adding as candidate."
- **Admin Registration**: "Date of birth not found in records. Please update citizen information before registration."

## Testing

### Test Cases:
1. **Valid Registration**: Citizen 18+ with valid date of birth
2. **Underage Registration**: Citizen under 18 should be rejected
3. **Missing Date of Birth**: Citizen without date of birth should be rejected
4. **Invalid Date**: Invalid date format should be handled gracefully

### Test Data:
```sql
-- Test with different ages
INSERT INTO eligiblecitizen (NationalID, FName, SName, DateOfBirth) VALUES 
('TEST001', 'John', 'Doe', '2000-01-01'),  -- 24 years old (valid)
('TEST002', 'Jane', 'Smith', '2010-01-01'), -- 14 years old (invalid)
('TEST003', 'Bob', 'Johnson', '1995-06-15'); -- 29 years old (valid)
```

## Security Considerations

### Data Validation:
- **Server-side Validation**: Age validation happens on the server
- **Date Validation**: Proper date format validation
- **SQL Injection Prevention**: Parameterized queries maintained

### Privacy:
- **Date of Birth**: Sensitive information properly handled
- **Age Display**: Only age is shown, not exact date of birth
- **Access Control**: Admin-only access to detailed voter information

## Future Enhancements

### Potential Improvements:
1. **Age Verification**: Integration with national ID system for automatic age verification
2. **Age Groups**: Statistics by age groups for demographic analysis
3. **Voting Eligibility**: Different age requirements for different positions
4. **Audit Trail**: Log age validation attempts for security

## Troubleshooting

### Common Issues:

#### 1. DateOfBirth Column Missing:
```sql
-- Check if column exists
DESCRIBE eligiblecitizen;
-- If missing, run the database update script
```

#### 2. Age Calculation Errors:
- Verify date format in database (YYYY-MM-DD)
- Check for NULL values in DateOfBirth field
- Ensure proper timezone handling

#### 3. Registration Failures:
- Check database connection
- Verify eligiblecitizen table has DateOfBirth data
- Review error logs for specific validation failures

## Support

For issues or questions regarding this update:
1. Check the error logs in the application
2. Verify database schema matches requirements
3. Test with known valid data
4. Contact system administrator for database issues

---

**Note**: This update maintains backward compatibility while adding the new age validation feature. Existing functionality remains unchanged except for the new age requirements.
