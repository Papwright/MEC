# Malawi Tripartite Elections - Online Voting System

A comprehensive online voting system built with Node.js and MySQL for Malawi's tripartite elections (President, Member of Parliament, and Councillor).

## Features

### 🗳️ **Voting System**
- **Tripartite Elections**: Vote for President, MP, and Councillor
- **Secure Authentication**: National ID-based voter verification
- **Real-time Progress Tracking**: Monitor voting completion status
- **Candidate Selection**: Interactive candidate selection interface
- **Vote Verification**: Prevent duplicate voting for same position

### 📊 **Results & Analytics**
- **Live Results**: Real-time election results display
- **National Summary**: Overall voter turnout and statistics
- **Position-wise Results**: Detailed results for each position
- **Winner Declaration**: Automatic winner calculation
- **Station-wise Results**: Local polling station results

### 👥 **Administrative Features**
- **System Statistics**: Voter registration and turnout metrics
- **Candidate Management**: Add and manage election candidates
- **Polling Station Management**: View all polling stations
- **Voter Registration**: Register eligible citizens to vote

### 🎨 **User Interface**
- **Modern Design**: Responsive, mobile-friendly interface
- **Malawi Theme**: National colors and flag integration
- **Intuitive Navigation**: Easy-to-use voting process
- **Real-time Updates**: Live statistics and progress indicators

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MySQL
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Authentication**: Session-based with express-session
- **Validation**: express-validator
- **Styling**: Custom CSS with responsive design

## Prerequisites

- **Node.js** (v14 or higher)
- **MySQL** (v8.0 or higher)
- **WAMP Server** (for local development)
- **Git** (for version control)

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd malawi-tripartite-voting
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup
1. **Start WAMP Server** and ensure MySQL is running
2. **Create Database**: 
   ```sql
   CREATE DATABASE tripartite_elections_mw;
   ```
3. **Run SQL Scripts**: Execute the provided SQL schema in your database

### 4. Environment Configuration
1. **Copy config.env.example** to `config.env`
2. **Update Database Settings**:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=tripartite_elections_mw
   DB_PORT=3306
   SESSION_SECRET=your_secret_key
   PORT=3000
   ```

### 5. Start the Application
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 6. Access the Application
Open your browser and navigate to: `http://localhost:3000`

## Database Schema

The system uses the following main tables:

- **EligibleCitizen**: Registered citizens eligible to vote
- **District/Constituency/Ward**: Geographic hierarchy
- **PollingStation**: Voting locations
- **Position**: Election positions (President, MP, Councillor)
- **PoliticalParty**: Political parties and symbols
- **Candidate**: Election candidates
- **Voter**: Registered voters
- **Vote**: Individual votes cast
- **Result**: Election results and winners

## Usage Guide

### For Voters

1. **Registration**: 
   - Navigate to Login section
   - Click "Register here"
   - Enter National ID and select polling station
   - Submit registration

2. **Voting**:
   - Login with National ID (same as password for demo)
   - View available positions
   - Click "Vote Now" for each position
   - Select candidate from modal
   - Confirm vote

3. **View Results**:
   - Navigate to Results section
   - View live results, national summary, or winners

### For Administrators

1. **View Statistics**:
   - Navigate to Admin section
   - View system overview and metrics

2. **Manage Candidates**:
   - View all registered candidates
   - Add new candidates (via API)

3. **Monitor Polling Stations**:
   - View all polling stations
   - Check voter registration by station

## API Endpoints

### Authentication
- `POST /api/auth/login` - Voter login
- `POST /api/auth/register` - Voter registration
- `GET /api/auth/check` - Check authentication status
- `POST /api/auth/logout` - User logout

### Voting
- `GET /api/voting/positions` - Get all positions
- `GET /api/voting/candidates/:positionId` - Get candidates for position
- `POST /api/voting/cast` - Cast a vote
- `GET /api/voting/status` - Get voting progress
- `GET /api/voting/history` - Get voting history

### Results
- `GET /api/results/live` - Get live results
- `GET /api/results/position/:positionId` - Get results for specific position
- `GET /api/results/station/:stationId` - Get station results
- `GET /api/results/national-summary` - Get national summary
- `GET /api/results/winners` - Get election winners

### Administration
- `GET /api/admin/stats` - Get system statistics
- `GET /api/admin/candidates` - Get all candidates
- `GET /api/admin/stations` - Get all polling stations
- `POST /api/admin/candidates` - Add new candidate

## Security Features

- **Session Management**: Secure session handling
- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Prevention**: Parameterized queries
- **Authentication Required**: Protected voting routes
- **Duplicate Vote Prevention**: One vote per position per voter

## Development

### Project Structure
```
malawi-tripartite-voting/
├── config/
│   └── database.js          # Database configuration
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── voting.js            # Voting functionality
│   ├── results.js           # Results and analytics
│   └── admin.js             # Administrative functions
├── public/
│   ├── index.html           # Main application
│   ├── styles.css           # Styling
│   └── script.js            # Frontend logic
├── server.js                # Main server file
├── package.json             # Dependencies
└── config.env               # Environment variables
```

### Adding New Features

1. **New Routes**: Add to appropriate route file
2. **Database Changes**: Update schema and queries
3. **Frontend**: Modify HTML/CSS/JavaScript as needed
4. **Testing**: Test thoroughly before deployment

## Deployment

### Production Considerations

1. **Environment Variables**: Secure all sensitive data
2. **Database Security**: Use strong passwords and restricted access
3. **HTTPS**: Enable SSL/TLS encryption
4. **Rate Limiting**: Implement API rate limiting
5. **Logging**: Add comprehensive logging
6. **Backup**: Regular database backups

### Deployment Options

- **Heroku**: Easy deployment with add-ons
- **AWS**: Scalable cloud infrastructure
- **DigitalOcean**: VPS hosting
- **Local Server**: On-premises deployment

## Troubleshooting

### Common Issues

1. **Database Connection Error**:
   - Check WAMP Server status
   - Verify database credentials
   - Ensure MySQL service is running

2. **Port Already in Use**:
   - Change PORT in config.env
   - Kill existing process on port 3000

3. **Module Not Found**:
   - Run `npm install`
   - Check package.json dependencies

4. **CORS Issues**:
   - Verify CORS configuration in server.js
   - Check browser console for errors

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes and test
4. Submit pull request
5. Ensure code follows project standards

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## Future Enhancements

- **Biometric Authentication**: Fingerprint/face recognition
- **Blockchain Integration**: Immutable vote records
- **Mobile App**: Native mobile application
- **Advanced Analytics**: Machine learning insights
- **Multi-language Support**: Local language support
- **Real-time Notifications**: SMS/email updates

---

**Note**: This is a demonstration system. For production use, implement additional security measures, proper authentication, and compliance with electoral regulations.
