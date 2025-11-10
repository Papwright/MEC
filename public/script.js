// Global variables
let currentUser = null;
let currentAdmin = null;
let currentSection = 'home';

// DOM elements
const sections = {
    home: document.getElementById('homeSection'),
    login: document.getElementById('loginSection'),
    voting: document.getElementById('votingSection'),
    results: document.getElementById('resultsSection'),
    admin: document.getElementById('adminSection')
};

const navButtons = {
    home: document.getElementById('homeBtn'),
    voting: document.getElementById('voteBtn'),
    results: document.getElementById('resultsBtn'),
    admin: document.getElementById('adminBtn')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    initializeApp();
    setupEventListeners();
    checkAuthStatus();
    checkAdminStatus();
    loadHomeStats();
    
    // Show home section by default
    showSection('home');
});

// Initialize the application
function initializeApp() {
    // Don't load polling stations here - they'll be loaded when needed
    // loadPollingStations(); // Removed - only load when admin is logged in
    
    // Hide voting section on initialization
    hideVotingSection();
}

// Function to hide voting section when not needed
function hideVotingSection() {
    const votingSection = document.getElementById('votingSection');
    if (votingSection) {
        votingSection.style.display = 'none';
        votingSection.classList.remove('active');
        console.log('Voting section hidden');
    }
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Navigation
    Object.keys(navButtons).forEach(key => {
        if (navButtons[key]) {
            navButtons[key].addEventListener('click', () => {
                console.log('Navigation button clicked:', key);
                navigateToSection(key);
            });
            console.log('Added listener for', key);
        } else {
            console.log('Button not found:', key);
        }
    });

    // Authentication
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            console.log('Login button clicked');
            showSection('login');
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Admin Authentication
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', () => {
            console.log('Admin login button clicked');
            document.getElementById('adminLoginModal').style.display = 'block';
        });
    }

    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', adminLogout);
    }

    // Admin Control Buttons
    const statsBtn = document.getElementById('statsBtn');
    const candidatesBtn = document.getElementById('candidatesBtn');
    const stationsBtn = document.getElementById('stationsBtn');
    const votersBtn = document.getElementById('votersBtn');

    if (statsBtn) {
        statsBtn.addEventListener('click', () => {
            updateAdminButtonStates('stats');
            loadAdminContent('stats');
        });
    }

    if (candidatesBtn) {
        candidatesBtn.addEventListener('click', () => {
            updateAdminButtonStates('candidates');
            loadAdminContent('candidates');
        });
    }

    if (stationsBtn) {
        stationsBtn.addEventListener('click', () => {
            updateAdminButtonStates('stations');
            loadAdminContent('stations');
        });
    }

    if (votersBtn) {
        votersBtn.addEventListener('click', () => {
            updateAdminButtonStates('voters');
            loadAdminContent('voters');
        });
    }
    
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', showRegisterForm);
    }
    
    const showLoginBtn = document.getElementById('showLoginBtn');
    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', showLoginForm);
    }
    
    // Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    
    // Voting
    document.getElementById('viewHistoryBtn').addEventListener('click', viewVotingHistory);
    
    // Results
    document.getElementById('liveResultsBtn').addEventListener('click', () => {
        loadResults('live');
        updateResultsButtonStates('liveResults');
    });
    document.getElementById('nationalSummaryBtn').addEventListener('click', () => {
        loadResults('summary');
        updateResultsButtonStates('nationalSummary');
    });
    document.getElementById('winnersBtn').addEventListener('click', () => {
        loadResults('winners');
        updateResultsButtonStates('winners');
    });
    
    // Modal
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Navigation functions
function navigateToSection(sectionName) {
    console.log('Navigating to section:', sectionName);
    console.log('Current user:', currentUser);
    console.log('Current admin:', currentAdmin);
    
    // Only redirect to admin section if admin is logged in and trying to access home
    if (sectionName === 'home' && currentAdmin) {
        console.log('Admin logged in, redirecting to admin section');
        showSection('admin');
        updateNavigation('admin');
        return;
    }
    
    if (sectionName === 'voting' && !currentUser) {
        console.log('No user logged in, redirecting to login');
        showSection('login');
        return;
    }
    
    if (sectionName === 'admin' && !currentAdmin) {
        console.log('No admin logged in, redirecting to admin login');
        document.getElementById('adminLoginModal').style.display = 'block';
        return;
    }
    
    // Special handling for admin section to ensure proper content loading
    if (sectionName === 'admin' && currentAdmin) {
        console.log('Admin section requested, loading stats by default');
        showSection('admin');
        updateNavigation('admin');
        loadAdminContent('stats');
        updateAdminButtonStates('stats');
        return;
    }
    
    // No special handling needed here - let the normal section switching work
    
    console.log('Showing section:', sectionName);
    showSection(sectionName);
    updateNavigation(sectionName);
}

function showSection(sectionName) {
    console.log('Showing section:', sectionName);
    console.log('Current admin status:', currentAdmin);
    
    // Hide all sections first
    Object.values(sections).forEach(section => {
        if (section) {
            section.classList.remove('active');
            section.style.display = 'none';
            console.log(`Hidden section: ${section.id}`);
        } else {
            console.log('Section element not found');
        }
    });
    
    // Show target section
    if (sections[sectionName]) {
        sections[sectionName].classList.add('active');
        sections[sectionName].style.display = 'block';
        currentSection = sectionName;
        console.log(`Section ${sectionName} shown and active`);
        
        // Special handling for voting section - only show when user is logged in
        if (sectionName === 'voting') {
            if (!currentUser) {
                // Redirect to login if not logged in
                navigateToSection('login');
                return;
            } else {
                // Ensure voting section is visible and load interface
                sections[sectionName].style.display = 'block';
                sections[sectionName].classList.add('active');
                console.log('Voting section display set to:', sections[sectionName].style.display);
                console.log('Voting section classes:', sections[sectionName].className);
                loadVotingInterface();
            }
        }
    } else {
        console.log('Section not found:', sectionName);
    }
    
    // Load section-specific content
    switch(sectionName) {
        case 'home':
            loadHomeStats();
            break;
        case 'voting':
            loadVotingInterface();
            break;
        case 'results':
            loadResults('live');
            break;
        case 'admin':
            loadAdminContent('stats');
            updateAdminButtonStates('stats');
            break;
    }
    
    // Hide admin section when showing other sections
    if (sectionName !== 'admin') {
        const adminSection = document.getElementById('adminSection');
        if (adminSection) {
            adminSection.style.display = 'none';
        }
    } else {
        // Show admin section when specifically requested
        const adminSection = document.getElementById('adminSection');
        if (adminSection) {
            adminSection.style.display = 'block';
        }
    }
}

function updateNavigation(activeSection) {
    // Remove active class from all navigation buttons
    Object.values(navButtons).forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    // Add active class to the current section button
    if (navButtons[activeSection]) {
        navButtons[activeSection].classList.add('active');
    }
}

function updateAdminButtonStates(activeButton) {
    const adminButtons = ['statsBtn', 'candidatesBtn', 'stationsBtn', 'votersBtn'];
    adminButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
            if (btnId === activeButton + 'Btn') {
                btn.classList.add('active');
            }
        }
    });
}

function updateResultsButtonStates(activeButton) {
    const resultsButtons = ['liveResultsBtn', 'nationalSummaryBtn', 'winnersBtn'];
    resultsButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            if (btnId === activeButton + 'Btn') {
                btn.classList.add('active');
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            }
        }
    });
}

function updateAdminButtonStates(activeButton) {
    const adminButtons = ['statsBtn', 'candidatesBtn', 'stationsBtn', 'votersBtn'];
    adminButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('active');
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            if (btnId === activeButton + 'Btn') {
                btn.classList.add('active');
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            }
        }
    });
}

// Authentication functions
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/check', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.loggedIn) {
            currentUser = data.voter;
            updateUserInterface();
        } else {
            currentUser = null;
            updateUserInterface();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/auth/admin/check', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.isAdmin) {
            currentAdmin = data.admin;
            updateAdminInterface();
        } else {
            currentAdmin = null;
            updateAdminInterface();
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const nationalId = formData.get('nationalId');
    const password = formData.get('password');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ nationalId, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.voter;
            updateUserInterface();
            showSection('voting');
            
            // Show login success without VoterID
            showNotification(`Login successful! Welcome ${data.voter.name}.`, 'success');
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Login failed. Please try again.', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const nationalId = formData.get('nationalId');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const stationId = formData.get('station');
    
    // Validate password
    if (password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long!', 'error');
        return;
    }
    
    // Validate all required fields
    if (!nationalId || !password || !stationId) {
        showNotification('Please fill in all required fields!', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ 
                nationalId, 
                password,
                stationId 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const customVoterID = data.customVoterID || 'N/A';
            const voterName = data.voter ? data.voter.name : 'Unknown';
            
            // Show only the first green success notification
            showNotification(`Registration successful! Welcome ${voterName}. Your VoterID: ${customVoterID}`, 'success');
            
            showLoginForm();
        } else {
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { 
            method: 'POST',
            credentials: 'include'
        });
        currentUser = null;
        updateUserInterface();
        showSection('home');
        
        // Clear login form for security
        clearLoginForm();
        
        showNotification('Logout successful', 'success');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');
    
    try {
        const response = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentAdmin = data.admin;
            updateAdminInterface();
            document.getElementById('adminLoginModal').style.display = 'none';
            e.target.reset();
            
            // Automatically navigate to admin section and load content
            showSection('admin');
            updateNavigation('admin');
            loadAdminContent('stats');
            
            showNotification('Admin login successful!', 'success');
        } else {
            showNotification(data.error || 'Admin login failed', 'error');
        }
    } catch (error) {
        console.error('Admin login error:', error);
        showNotification('Admin login failed. Please try again.', 'error');
    }
}

async function adminLogout() {
    try {
        await fetch('/api/auth/admin/logout', { 
            method: 'POST',
            credentials: 'include'
        });
        currentAdmin = null;
        updateAdminInterface();
        if (currentSection === 'admin') {
            showSection('home');
            updateNavigation('home');
        }
        showNotification('Admin logout successful', 'success');
    } catch (error) {
        console.error('Admin logout error:', error);
    }
}

function updateUserInterface() {
    const userInfo = document.getElementById('userInfo');
    const loginSection = document.getElementById('loginSection');
    const userName = document.getElementById('userName');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const homeBtn = document.getElementById('homeBtn');
    const loginButtonContainer = document.getElementById('loginButtonContainer');
    
    if (currentUser) {
        userInfo.style.display = 'flex';
        loginSection.style.display = 'none';
        
        // Display user name with VoterID in brackets
        const customVoterID = currentUser.customId || `VID${currentUser.id.toString().padStart(3, '0')}`;
        userName.textContent = `${currentUser.name} (${customVoterID})`;
        
        // Hide all login options when user is logged in
        if (loginButtonContainer) {
            loginButtonContainer.style.display = 'none';
        }
        
        // Hide registration text when user is logged in
        if (showRegisterBtn) {
            showRegisterBtn.style.display = 'none';
        }
        
        // Show home button when user is logged in
        if (homeBtn) {
            homeBtn.style.display = 'inline-block';
        }
    } else {
        userInfo.style.display = 'none';
        
        // Show login options when user is not logged in
        if (loginButtonContainer) {
            loginButtonContainer.style.display = 'flex';
        }
        
        // Only show login section if admin is not logged in
        if (loginSection) {
            loginSection.style.display = !currentAdmin ? 'block' : 'none';
        }
        
        // Show registration text when user is not logged in (and admin is not logged in)
        if (showRegisterBtn && !currentAdmin) {
            showRegisterBtn.style.display = 'inline';
        }
        
        // Show home button when user is not logged in (and admin is not logged in)
        if (homeBtn && !currentAdmin) {
            homeBtn.style.display = 'inline-block';
        }
    }
}

function updateAdminInterface() {
    const adminInfo = document.getElementById('adminInfo');
    const adminName = document.getElementById('adminName');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const adminBtn = document.getElementById('adminBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const homeBtn = document.getElementById('homeBtn');
    const loginSection = document.getElementById('loginSection');
    const adminSection = document.getElementById('adminSection');
    const loginButtonContainer = document.getElementById('loginButtonContainer');
    
    if (currentAdmin) {
        adminInfo.style.display = 'flex';
        adminLoginBtn.style.display = 'none';
        adminName.textContent = `Admin: ${currentAdmin.username}`;
        adminBtn.style.display = 'block';
        
        // Hide all login options when admin is logged in
        if (loginButtonContainer) {
            loginButtonContainer.style.display = 'none';
        }
        
        // Hide home button, registration text, and login section when admin is logged in
        if (homeBtn) {
            homeBtn.style.display = 'none';
        }
        if (showRegisterBtn) {
            showRegisterBtn.style.display = 'none';
        }
        if (loginSection) {
            loginSection.style.display = 'none';
        }
        
        // Ensure admin section is accessible
        if (adminSection) {
            adminSection.style.display = 'block';
        }
        
        // Hide other sections when admin is logged in
        const otherSections = ['homeSection', 'loginSection', 'votingSection', 'resultsSection'];
        otherSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });
    } else {
        adminInfo.style.display = 'none';
        adminLoginBtn.style.display = 'inline-block';
        adminBtn.style.display = 'none';
        
        // Show login options when admin is not logged in
        if (loginButtonContainer) {
            loginButtonContainer.style.display = 'flex';
        }
        
        // Show home button and registration text when admin is not logged in
        if (homeBtn) {
            homeBtn.style.display = 'inline-block';
        }
        if (showRegisterBtn) {
            showRegisterBtn.style.display = 'inline';
        }
        if (loginSection) {
            loginSection.style.display = 'block';
        }
        
        // Show other sections when admin is not logged in
        const otherSections = ['homeSection', 'loginSection', 'votingSection', 'resultsSection'];
        otherSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });
        
        // Hide admin section when admin is not logged in
        if (adminSection) {
            adminSection.style.display = 'none';
        }
    }
}

function showLoginForm() {
    document.getElementById('registerCard').style.display = 'none';
    document.querySelector('.auth-card').style.display = 'block';
    
    // Clear any existing form data for security
    clearLoginForm();
}

function showRegisterForm() {
    document.querySelector('.auth-card').style.display = 'none';
    document.getElementById('registerCard').style.display = 'block';
    
    // Clear any existing form data for security
    clearRegistrationForm();
    
    // Load districts when registration form is shown
    loadDistrictsForRegistration();
}

// Voting functions
async function loadVotingInterface() {
    console.log('Loading voting interface...');
    console.log('Current user:', currentUser);
    
    if (!currentUser) {
        console.log('No current user, cannot load voting interface');
        return;
    }
    
    try {
        console.log('Fetching positions...');
        // Load positions
        const positionsResponse = await fetch('/api/voting/positions');
        const positionsData = await positionsResponse.json();
        console.log('Positions data:', positionsData);
        
        console.log('Fetching voting status...');
        // Load voting status
        const statusResponse = await fetch('/api/voting/status');
        const statusData = await statusResponse.json();
        console.log('Status data:', statusData);
        console.log('Status structure:', {
            totalPositions: statusData.totalPositions,
            votedPositions: statusData.votedPositions,
            votedPositionsType: typeof statusData.votedPositions,
            isArray: Array.isArray(statusData.votedPositions)
        });
        
        displayVotingInterface(positionsData.positions, statusData);
        
    } catch (error) {
        console.error('Error loading voting interface:', error);
        showNotification('Failed to load voting interface', 'error');
    }
}

function displayVotingInterface(positions, status) {
    const container = document.getElementById('positionsContainer');
    const voterNameDisplay = document.getElementById('voterNameDisplay');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const votingProgress = document.querySelector('.voting-progress');
    
    voterNameDisplay.textContent = currentUser.name;
    
    // Show the voting progress section when user is voting
    if (votingProgress) {
        votingProgress.style.display = 'block';
    }
    
    // Ensure votedPositions is an array and handle progress calculation safely
    const votedPositions = Array.isArray(status.votedPositions) ? status.votedPositions : [];
    const votedCount = votedPositions.length;
    
    // Update progress
    const progress = status.totalPositions > 0 ? (votedCount / status.totalPositions) * 100 : 0;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${votedCount} of ${status.totalPositions} positions completed`;
    
    // Display positions
    container.innerHTML = positions.map(position => {
        const isCompleted = votedPositions.includes(position.PositionID);
        const statusClass = isCompleted ? 'completed' : 'pending';
        const statusText = isCompleted ? 'Completed' : 'Pending';
        
        return `
            <div class="position-card">
                <h3>
                    <i class="fas fa-${getPositionIcon(position.Title)}"></i>
                    ${position.Title}
                    <span class="status ${statusClass}">${statusText}</span>
                </h3>
                ${!isCompleted ? 
                    `<button class="vote-btn" onclick="voteForPosition('${position.PositionID}', '${position.Title}')">
                        Vote Now
                    </button>` : 
                    '<p class="text-success"><i class="fas fa-check"></i> Vote cast successfully</p>'
                }
            </div>
        `;
    }).join('');
    
    // Check if voting is complete
    if (status.isComplete) {
        document.getElementById('votingComplete').style.display = 'block';
        container.style.display = 'none';
    }
}

async function voteForPosition(positionId, positionTitle) {
    try {
        // Load candidates for this position
        const response = await fetch(`/api/voting/candidates/${positionId}`);
        const data = await response.json();
        
        if (data.success) {
            showCandidateModal(positionId, positionTitle, data.candidates);
        } else {
            showNotification('Failed to load candidates', 'error');
        }
    } catch (error) {
        console.error('Error loading candidates:', error);
        showNotification('Failed to load candidates', 'error');
    }
}

function showCandidateModal(positionId, positionTitle, candidates) {
    const modal = document.getElementById('candidateModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalCandidates = document.getElementById('modalCandidates');
    
    modalTitle.textContent = `Select Candidate for ${positionTitle}`;
    
         modalCandidates.innerHTML = candidates.map(candidate => `
         <div class="candidate-option" onclick="selectCandidate('${candidate.CandidateID}', '${positionId}')">
             <div>
                 <div class="candidate-name">${candidate.FName} ${candidate.MName || ''} ${candidate.SName || ''}</div>
                 <div class="party-name">${candidate.PartyName}</div>
             </div>
             <div class="candidate-symbol">${candidate.Symbol || '🏛️'}</div>
         </div>
     `).join('');
    
    modal.style.display = 'block';
}

async function selectCandidate(candidateId, positionId) {
    console.log('Selecting candidate:', { candidateId, positionId });
    
    try {
        const requestBody = { candidateId, positionId };
        console.log('Sending request body:', requestBody);
        
        const response = await fetch('/api/voting/cast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            document.getElementById('candidateModal').style.display = 'none';
            showNotification('Vote cast successfully!', 'success');
            loadVotingInterface(); // Refresh the interface
        } else {
            showNotification(data.error || 'Failed to cast vote', 'error');
        }
    } catch (error) {
        console.error('Error casting vote:', error);
        showNotification('Failed to cast vote', 'error');
    }
}

function closeModal() {
    document.getElementById('candidateModal').style.display = 'none';
}

async function viewVotingHistory() {
    try {
        const response = await fetch('/api/voting/history');
        const data = await response.json();
        
        if (data.success) {
            displayVotingHistory(data.votes);
        }
    } catch (error) {
        console.error('Error loading voting history:', error);
        showNotification('Failed to load voting history', 'error');
    }
}

function displayVotingHistory(votes) {
    if (!votes || votes.length === 0) {
        showNotification('No voting history found', 'info');
        return;
    }

    // Create modal content for voting history
    const modal = document.getElementById('candidateModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalCandidates = document.getElementById('modalCandidates');

    modalTitle.textContent = 'Your Voting History';
    
    const historyHTML = `
        <div class="voting-history">
            <div class="history-header">
                <h4><i class="fas fa-history"></i> Your Voting Record</h4>
                <p>You have voted in ${votes.length} position(s)</p>
            </div>
            <div class="history-list">
                ${votes.map(vote => `
                    <div class="history-item">
                        <div class="history-position">
                            <strong>${vote.PositionTitle}</strong>
                        </div>
                        <div class="history-candidate">
                            <span class="candidate-name">${vote.FName} ${vote.SName}</span>
                            <span class="party-name">${vote.PartyName}</span>
                        </div>
                        <div class="history-timestamp">
                            <small>${new Date(vote.Timestamp).toLocaleString()}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="history-footer">
                <button class="btn btn-secondary" onclick="closeVotingHistory()">Close</button>
            </div>
        </div>
    `;

    modalCandidates.innerHTML = historyHTML;
    modal.style.display = 'block';
}

function closeVotingHistory() {
    const modal = document.getElementById('candidateModal');
    modal.style.display = 'none';
}

// Results functions
async function loadResults(type) {
    try {
        let endpoint = '';
        switch(type) {
            case 'live':
                endpoint = '/api/results/live';
                break;
            case 'summary':
                endpoint = '/api/results/national-summary';
                break;
            case 'winners':
                endpoint = '/api/results/winners';
                break;
        }
        
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (data.success) {
            displayResults(type, data);
            // Update button states based on the type
            switch(type) {
                case 'live':
                    updateResultsButtonStates('liveResults');
                    break;
                case 'summary':
                    updateResultsButtonStates('nationalSummary');
                    break;
                case 'winners':
                    updateResultsButtonStates('winners');
                    break;
            }
        }
    } catch (error) {
        console.error('Error loading results:', error);
        showNotification('Failed to load results', 'error');
    }
}

function displayResults(type, data) {
    const container = document.getElementById('resultsContainer');
    
    switch(type) {
        case 'live':
            displayLiveResults(data.results, container);
            break;
        case 'summary':
            displayNationalSummary(data.summary, container);
            break;
        case 'winners':
            displayWinners(data.winners, container);
            break;
    }
}

function displayLiveResults(results, container) {
    container.innerHTML = Object.entries(results).map(([positionId, positionData]) => {
        // Calculate total votes for this position
        const totalVotes = positionData.candidates.reduce((sum, candidate) => sum + candidate.voteCount, 0);
        
        return `
            <div class="result-group">
                <h3><i class="fas fa-chart-bar"></i> ${positionData.positionTitle}</h3>
                ${positionData.candidates.length > 0 ? `
                    <div class="results-content">
                        <div class="results-list">
                            ${positionData.candidates.map(candidate => {
                                const percentage = totalVotes > 0 ? ((candidate.voteCount / totalVotes) * 100).toFixed(1) : 0;
                                return `
                                    <div class="candidate-result">
                                        <div class="candidate-info">
                                            <div class="candidate-name">${candidate.name}</div>
                                            <div class="party-name">${candidate.party}</div>
                                        </div>
                                        <div class="vote-count">
                                            ${candidate.voteCount} votes
                                            <span class="vote-percentage">(${percentage}%)</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="results-chart">
                            <canvas id="chart-${positionId}" width="400" height="300"></canvas>
                        </div>
                    </div>
                ` : 
                    '<p>No candidates found</p>'
                }
            </div>
        `;
    }).join('');
    
    // Create charts for each position
    Object.entries(results).forEach(([positionId, positionData]) => {
        if (positionData.candidates.length > 0) {
            createPositionChart(positionId, positionData.candidates);
        }
    });
}

function displayNationalSummary(summary, container) {
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <h4>Total Registered Voters</h4>
                <div class="value">${summary.totalRegisteredVoters.toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <h4>Total Votes Cast</h4>
                <div class="value">${summary.totalVotesCast.toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <h4>Voter Turnout</h4>
                <div class="value">${summary.turnoutPercentage}%</div>
            </div>
        </div>
        
        <div class="result-group">
            <h3><i class="fas fa-chart-pie"></i> Voter Turnout Overview</h3>
            <div class="chart-container">
                <canvas id="turnoutChart" width="400" height="300"></canvas>
            </div>
        </div>
        
        <div class="result-group">
            <h3><i class="fas fa-chart-bar"></i> Votes by Position</h3>
            <div class="results-content">
                <div class="results-list">
                    ${summary.positions.map(position => {
                        // For national summary, show percentage of total votes cast across all positions
                        const percentage = summary.totalVotesCast > 0 ? ((position.totalVotes / summary.totalVotesCast) * 100).toFixed(1) : 0;
                        return `
                            <div class="candidate-result">
                                <div class="candidate-info">
                                    <div class="candidate-name">${position.Title}</div>
                                </div>
                                <div class="vote-count">
                                    ${position.totalVotes} votes
                                    <span class="vote-percentage">(${percentage}% of total)</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="results-chart">
                    <canvas id="positionChart" width="400" height="300"></canvas>
                </div>
            </div>
        </div>
    `;
    
    // Create turnout chart
    createTurnoutChart(summary);
    
    // Create position chart
    createPositionSummaryChart(summary.positions);
}

function displayWinners(winners, container) {
    container.innerHTML = `
        <div class="result-group">
            <h3><i class="fas fa-trophy"></i> Election Winners</h3>
            <div class="results-content">
                <div class="results-list">
                    ${winners.map(winner => {
                        // Calculate percentage for each winner (assuming they won their position)
                        const voteCount = winner.VoteCount || winner.voteCount || 0;
                        const percentage = voteCount > 0 ? '100%' : '0%';
                        return `
                            <div class="candidate-result">
                                <div class="candidate-info">
                                    <div class="candidate-name">${winner.WinnerName || 'Unknown Candidate'}</div>
                                    <div class="party-name">${winner.PartyName || 'Unknown Party'} - ${winner.PositionTitle || 'Unknown Position'}</div>
                                </div>
                                <div class="vote-count">
                                    ${voteCount} votes
                                    <span class="vote-percentage">(${percentage})</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="results-chart">
                    <canvas id="winnersChart" width="400" height="300"></canvas>
                </div>
            </div>
        </div>
    `;
    
    // Create winners chart
    createWinnersChart(winners);
}

// Create chart for a specific position
function createPositionChart(positionId, candidates) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }
    
    const canvas = document.getElementById(`chart-${positionId}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Prepare data for the chart
    const labels = candidates.map(candidate => candidate.name);
    const data = candidates.map(candidate => candidate.voteCount);
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
    
    // Create the chart
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, candidates.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                title: {
                    display: true,
                    text: 'Vote Distribution',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} votes (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 2000
            }
        }
    });
}

// Create turnout chart for national summary
function createTurnoutChart(summary) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }
    
    const canvas = document.getElementById('turnoutChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const data = [
        summary.totalVotesCast,
        summary.totalRegisteredVoters - summary.totalVotesCast
    ];
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Votes Cast', 'Did Not Vote'],
            datasets: [{
                data: data,
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 3,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                title: {
                    display: true,
                    text: `Turnout: ${summary.turnoutPercentage}%`,
                    font: {
                        size: 18,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = summary.totalRegisteredVoters;
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                duration: 2000
            }
        }
    });
}

// Create position summary chart
function createPositionSummaryChart(positions) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }
    
    const canvas = document.getElementById('positionChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const labels = positions.map(pos => pos.Title);
    const data = positions.map(pos => pos.totalVotes);
    const colors = ['#FF6384', '#36A2EB', '#FFCE56'];
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Votes',
                data: data,
                backgroundColor: colors,
                borderColor: colors.map(color => color + '80'),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Votes by Position',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Votes: ${context.parsed.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Votes'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Positions'
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeInOutQuart'
            }
        }
    });
}

// Create winners chart
function createWinnersChart(winners) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }
    
    const canvas = document.getElementById('winnersChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const labels = winners.map(winner => winner.WinnerName || 'Unknown Candidate');
    const data = winners.map(winner => winner.VoteCount || winner.voteCount || 0);
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Votes Won',
                data: data,
                backgroundColor: colors.slice(0, winners.length),
                borderColor: colors.map(color => color + '80'),
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Winners by Vote Count',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Votes: ${context.parsed.x.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Votes'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Winners'
                    }
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeInOutQuart'
            }
        }
    });
}

// Admin functions
async function loadAdminContent(type) {
    try {
        let endpoint = '';
        switch(type) {
            case 'stats':
                endpoint = '/api/admin/stats';
                break;
            case 'candidates':
                endpoint = '/api/admin/candidates';
                break;
            case 'stations':
                endpoint = '/api/admin/stations';
                break;
            case 'voters':
                endpoint = '/api/admin/voters';
                break;
        }
        
        const response = await fetch(endpoint, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            displayAdminContent(type, data);
        } else {
            showNotification(data.error || 'Failed to load admin content', 'error');
        }
    } catch (error) {
        console.error('Error loading admin content:', error);
        showNotification('Failed to load admin content. Please check your connection.', 'error');
    }
}

function displayAdminContent(type, data) {
    const container = document.getElementById('adminContainer');
    
    // Update button states based on the type
    updateAdminButtonStates(type);
    
    switch(type) {
        case 'stats':
            displayAdminStats(data.stats, container);
            break;
        case 'candidates':
            displayAdminCandidates(data.candidates, container);
            break;
        case 'stations':
            displayAdminStations(data.stations, container);
            break;
        case 'voters':
            displayAdminVoters(data.voters, container);
            break;
    }
}

function displayAdminStats(stats, container) {
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <h4>Total Voters</h4>
                <div class="value">${stats.totalVoters.toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-icon">
                    <i class="fas fa-vote-yea"></i>
                </div>
                <h4>Total Votes</h4>
                <div class="value">${stats.totalVotes.toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-icon">
                    <i class="fas fa-user-tie"></i>
                </div>
                <h4>Total Candidates</h4>
                <div class="value">${stats.totalCandidates.toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <h4>Turnout</h4>
                <div class="value">${stats.turnoutPercentage}%</div>
            </div>
        </div>
        <div class="result-group">
            <h3><i class="fas fa-chart-line"></i> Votes by Position</h3>
            ${stats.votesByPosition.map(position => `
                <div class="candidate-result">
                    <div class="candidate-info">
                        <div class="candidate-name">${position.Title}</div>
                    </div>
                    <div class="vote-count">${position.voteCount} votes</div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayAdminCandidates(candidates, container) {
    container.innerHTML = `
        <div class="add-party-section">
            <h3><i class="fas fa-flag"></i> Add New Political Party</h3>
            <form id="addPartyForm" class="add-party-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="partyName">Party Name</label>
                        <input type="text" id="partyName" required placeholder="Enter Party Name">
                    </div>
                    <div class="form-group">
                        <label for="partySymbol">Party Symbol</label>
                        <input type="text" id="partySymbol" required placeholder="Enter Party Symbol (e.g., 🦁, 🌹, ⭐, 🌽)">
                    </div>
                </div>
                <button type="submit" class="btn btn-success">
                    <i class="fas fa-flag"></i> Add Party
                </button>
            </form>
        </div>
        
        <div class="add-candidate-section">
            <h3><i class="fas fa-user-plus"></i> Add New Candidate</h3>
            <form id="addCandidateForm" class="add-candidate-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="candidateNationalId">National ID</label>
                        <input type="text" id="candidateNationalId" required placeholder="Enter National ID">
                    </div>
                    <div class="form-group">
                        <label for="candidatePosition">Position</label>
                        <select id="candidatePosition" required>
                            <option value="">Select Position</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="candidateParty">Political Party</label>
                        <select id="candidateParty" required>
                            <option value="">Select Party</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="candidateStation">Polling Station (Optional)</label>
                        <select id="candidateStation">
                            <option value="">Select Station (Optional)</option>
                        </select>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-user-plus"></i> Add Candidate
                </button>
            </form>
        </div>
        
        <div class="result-group">
            <h3><i class="fas fa-user-tie"></i> All Candidates (${candidates.length})</h3>
            ${candidates.map(candidate => `
                <div class="candidate-result">
                    <div class="candidate-info">
                        <div class="candidate-name">${candidate.FName} ${candidate.MName || ''} ${candidate.SName || ''}</div>
                        <div class="party-name">${candidate.PartyName} - ${candidate.PositionTitle}</div>
                        <div class="candidate-details">
                            <small>ID: ${candidate.CandidateID} | National ID: ${candidate.NationalID}</small>
                        </div>
                    </div>
                    <div class="candidate-actions">
                        <button class="btn btn-danger btn-sm" onclick="deleteCandidate('${candidate.CandidateID}', '${candidate.FName} ${candidate.MName || ''} ${candidate.SName || ''}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Load positions, parties, and stations for the add candidate form
    loadPositionsForAdmin();
    loadPartiesForAdmin();
    loadPollingStationsForAdmin();
    
    // Add event listeners for the forms
    const addCandidateForm = document.getElementById('addCandidateForm');
    if (addCandidateForm) {
        console.log('Adding event listener to candidate form');
        addCandidateForm.addEventListener('submit', handleAddCandidate);
    } else {
        console.error('Candidate form not found!');
    }
    
    const addPartyForm = document.getElementById('addPartyForm');
    if (addPartyForm) {
        addPartyForm.addEventListener('submit', handleAddParty);
    }
}

function displayAdminStations(stations, container) {
    container.innerHTML = `
        <div class="add-station-section">
            <h3><i class="fas fa-map-marker-alt"></i> Add New Polling Station</h3>
            <button class="btn btn-primary" onclick="openAddStationModal()">
                <i class="fas fa-plus"></i> Add New Station
            </button>
        </div>
        
        <div class="result-group">
            <h3><i class="fas fa-map-marker-alt"></i> All Polling Stations (${stations.length})</h3>
            ${stations.map(station => `
                <div class="candidate-result">
                    <div class="candidate-info">
                        <div class="candidate-name">${station.Name}</div>
                        <div class="party-name">${station.WardName} - ${station.ConstituencyName}</div>
                        <div class="candidate-details">
                            <small>Station ID: ${station.StationID} | District: ${station.DistrictName} | Region: ${station.Region}</small>
                        </div>
                    </div>
                    <div class="candidate-actions">
                        <button class="btn btn-primary btn-sm" onclick="editStation('${station.StationID}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteStation('${station.StationID}', '${station.Name}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayAdminVoters(voters, container) {
    container.innerHTML = `
        <div class="add-voter-section">
            <h3><i class="fas fa-user-plus"></i> Register New Voter</h3>
            <form id="addVoterFormAdmin" class="add-voter-form">
                <div class="form-group">
                    <label for="newNationalId">National ID</label>
                    <input type="text" id="newNationalId" required placeholder="Enter National ID">
                </div>
                <div class="form-group">
                    <label for="newStationId">Polling Station</label>
                    <select id="newStationId" required>
                        <option value="">Select Station</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-user-plus"></i> Register Voter
                </button>
            </form>
        </div>
        
        <div class="result-group">
            <h3><i class="fas fa-users"></i> Registered Voters (${voters.length})</h3>
            <div class="voter-list">
                ${voters.map(voter => `
                    <div class="voter-item">
                        <div class="voter-header">
                            <div>
                                <span class="voter-name">${voter.FName} ${voter.MName || ''} ${voter.SName || ''}</span>
                                <span class="voter-national-id">${voter.NationalID}</span>
                                <span class="voter-custom-id">VoterID: ${voter.CustomVoterID || `VID${voter.VoterID.toString().padStart(3, '0')}`}</span>
                            </div>
                            <div class="voter-actions">
                                <button class="btn btn-secondary btn-sm" onclick="viewVoterDetails('${voter.NationalID}')">
                                    <i class="fas fa-eye"></i> View
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deleteVoter('${voter.NationalID}', '${voter.FName} ${voter.MName || ''} ${voter.SName || ''}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                        <div class="voter-details">
                            <div class="voter-detail">
                                <span class="voter-detail-label">Name</span>
                                <span class="voter-detail-value">${voter.FName} ${voter.MName || ''} ${voter.SName || ''}</span>
                            </div>
                            <div class="voter-detail">
                                <span class="voter-detail-label">Polling Station</span>
                                <span class="voter-detail-value">${voter.StationName}</span>
                            </div>
                            <div class="voter-detail">
                                <span class="voter-detail-label">Voter ID</span>
                                <span class="voter-detail-value">${voter.VoterID}</span>
                            </div>
                            ${voter.DOB ? `
                            <div class="voter-detail">
                                <span class="voter-detail-label">Age</span>
                                <span class="voter-detail-value">${calculateAgeFromDOB(voter.DOB)} years old</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Load polling stations for the add voter form
    loadPollingStationsForAdmin();
    
    // Add event listener for the add voter form
    document.getElementById('addVoterFormAdmin').addEventListener('submit', handleAddVoter);
}

// Utility functions
async function loadHomeStats() {
    try {
        const response = await fetch('/api/results/public-stats', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const totalVotersElement = document.getElementById('totalVoters');
            const totalVotesElement = document.getElementById('totalVotes');
            const turnoutElement = document.getElementById('turnout');
            
            if (totalVotersElement) totalVotersElement.textContent = data.stats.totalVoters.toLocaleString();
            if (totalVotesElement) totalVotesElement.textContent = data.stats.totalVotes.toLocaleString();
            if (turnoutElement) turnoutElement.textContent = data.stats.turnoutPercentage + '%';
        }
    } catch (error) {
        console.error('Error loading home stats:', error);
    }
}

async function loadPollingStations() {
    try {
        const response = await fetch('/api/admin/stations/public', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('addStationId');
            if (select) {
                select.innerHTML = '<option value="">Select Polling Station</option>' +
                    data.stations.map(station => 
                        `<option value="${station.StationID}">${station.Name} - ${station.WardName}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading polling stations:', error);
    }
}

// Load districts for voter registration
async function loadDistrictsForRegistration() {
    try {
        const response = await fetch('/api/auth/districts');
        const data = await response.json();
        
        if (data.success) {
            const districtSelect = document.getElementById('regDistrict');
            if (districtSelect) {
                districtSelect.innerHTML = '<option value="">Select District</option>';
                data.districts.forEach(district => {
                    districtSelect.innerHTML += `<option value="${district.DistrictID}">${district.DistrictName} (${district.Region})</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Error loading districts for registration:', error);
    }
}

// Load constituencies by district for voter registration
async function loadConstituenciesForRegistration(districtId) {
    try {
        const response = await fetch(`/api/auth/constituencies/${districtId}`);
        const data = await response.json();
        
        if (data.success) {
            const constituencySelect = document.getElementById('regConstituency');
            const stationSelect = document.getElementById('regStation');
            
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            constituencySelect.disabled = false;
            
            // Reset dependent dropdown
            stationSelect.innerHTML = '<option value="">Select Polling Station</option>';
            stationSelect.disabled = true;
            
            data.constituencies.forEach(constituency => {
                constituencySelect.innerHTML += `<option value="${constituency.ConstituencyID}">${constituency.Name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading constituencies for registration:', error);
    }
}

// Load polling stations by constituency for voter registration
async function loadStationsForRegistration(constituencyId) {
    try {
        const response = await fetch(`/api/auth/stations/by-constituency/${constituencyId}`);
        const data = await response.json();
        
        if (data.success) {
            const stationSelect = document.getElementById('regStation');
            if (stationSelect) {
                stationSelect.innerHTML = '<option value="">Select Polling Station</option>';
                stationSelect.disabled = false;
                
                data.stations.forEach(station => {
                    stationSelect.innerHTML += `<option value="${station.StationID}">${station.Name} - ${station.WardName || 'Unknown Ward'}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Error loading stations for registration:', error);
    }
}



function getPositionIcon(title) {
    switch(title.toLowerCase()) {
        case 'president':
            return 'user-tie';
        case 'member of parliament':
            return 'building';
        case 'councillor':
            return 'map-marker-alt';
        default:
            return 'user';
    }
}

// Utility function to calculate age from date of birth (frontend)
function calculateAgeFromDOB(dateOfBirth) {
    if (!dateOfBirth) return 'Unknown';
    
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

// VoterID Lookup Functions
function showVoterIDLookup() {
    const modal = document.getElementById('voteridLookupModal');
    modal.style.display = 'block';
    
    // Clear previous results
    const resultDiv = document.getElementById('voteridLookupResult');
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    
    // Clear form
    document.getElementById('lookupNationalId').value = '';
}

function closeVoterIDLookup() {
    const modal = document.getElementById('voteridLookupModal');
    modal.style.display = 'none';
}

async function handleVoterIDLookup(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const nationalId = formData.get('nationalId');
    
    if (!nationalId) {
        showNotification('Please enter your National ID', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/lookup-voterid', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ nationalId })
        });
        
        const data = await response.json();
        const resultDiv = document.getElementById('voteridLookupResult');
        
        if (data.success) {
            resultDiv.className = 'lookup-result success';
            resultDiv.innerHTML = `
                <h4><i class="fas fa-check-circle"></i> VoterID Found!</h4>
                <div class="voter-info">
                    <div class="info-item">
                        <span class="info-label">Name:</span>
                        <span class="info-value">${data.voter.name}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">National ID:</span>
                        <span class="info-value">${data.voter.nationalId}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">VoterID:</span>
                        <span class="info-value" style="color: #007bff; font-weight: bold;">${data.voter.customVoterID}</span>
                    </div>
                </div>
                <div style="margin-top: 1rem; text-align: center;">
                    <button class="btn btn-primary" onclick="closeVoterIDLookup()">
                        <i class="fas fa-sign-in-alt"></i> Use This VoterID to Login
                    </button>
                </div>
            `;
        } else {
            resultDiv.className = 'lookup-result error';
            resultDiv.innerHTML = `
                <h4><i class="fas fa-exclamation-triangle"></i> VoterID Not Found</h4>
                <p>${data.error}</p>
                <div style="margin-top: 1rem; text-align: center;">
                    <button class="btn btn-secondary" onclick="closeVoterIDLookup()">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            `;
        }
        
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error('VoterID lookup error:', error);
        showNotification('Failed to lookup VoterID. Please try again.', 'error');
    }
}

// Password Reset Functions
function showPasswordReset() {
    closeVoterIDLookup();
    const modal = document.getElementById('passwordResetModal');
    modal.style.display = 'block';
    
    // Clear previous results
    const resultDiv = document.getElementById('passwordResetResult');
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
    
    // Clear form
    document.getElementById('resetNationalId').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

function closePasswordReset() {
    const modal = document.getElementById('passwordResetModal');
    modal.style.display = 'none';
}

async function handlePasswordReset(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const nationalId = formData.get('nationalId');
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');
    
    if (!nationalId || !newPassword || !confirmPassword) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ nationalId, newPassword })
        });
        
        const data = await response.json();
        const resultDiv = document.getElementById('passwordResetResult');
        
        if (data.success) {
            resultDiv.className = 'lookup-result success';
            resultDiv.innerHTML = `
                <h4><i class="fas fa-check-circle"></i> Password Reset Successful!</h4>
                <div class="voter-info">
                    <div class="info-item">
                        <span class="info-label">Name:</span>
                        <span class="info-value">${data.voter.name}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">National ID:</span>
                        <span class="info-value">${data.voter.nationalId}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">VoterID:</span>
                        <span class="info-value" style="color: #007bff; font-weight: bold;">${data.voter.customVoterID}</span>
                    </div>
                </div>
                <div style="margin-top: 1rem; text-align: center;">
                    <button class="btn btn-primary" onclick="closePasswordReset()">
                        <i class="fas fa-sign-in-alt"></i> Login with New Password
                    </button>
                </div>
            `;
        } else {
            resultDiv.className = 'lookup-result error';
            resultDiv.innerHTML = `
                <h4><i class="fas fa-exclamation-triangle"></i> Password Reset Failed</h4>
                <p>${data.error}</p>
                <div style="margin-top: 1rem; text-align: center;">
                    <button class="btn btn-secondary" onclick="closePasswordReset()">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            `;
        }
        
        resultDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Password reset error:', error);
        showNotification('Failed to reset password. Please try again.', 'error');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 3000;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    
    // Set background color based on type
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#28a745';
            break;
        case 'error':
            notification.style.backgroundColor = '#dc3545';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ffc107';
            notification.style.color = '#212529';
            break;
        default:
            notification.style.backgroundColor = '#007bff';
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Clear login form for security
function clearLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.reset();
        
        // Also clear any stored values in sessionStorage/localStorage if they exist
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('loginNationalId');
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('loginNationalId');
        }
    }
}

// Clear registration form for security
function clearRegistrationForm() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.reset();
        
        // Reset dropdowns to initial state
        const constituencySelect = document.getElementById('regConstituency');
        const stationSelect = document.getElementById('regStation');
        
        if (constituencySelect) {
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            constituencySelect.disabled = true;
        }
        
        if (stationSelect) {
            stationSelect.innerHTML = '<option value="">Select Polling Station</option>';
            stationSelect.disabled = true;
        }
    }
}

// Password visibility toggle function
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const toggleIcon = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        toggleIcon.classList.add('show-password');
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        toggleIcon.classList.remove('show-password');
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// Add CSS animations for notifications and form styling
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .add-candidate-section, .add-voter-section, .add-party-section {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        border: 1px solid #dee2e6;
    }
    
    .form-row {
        display: flex;
        gap: 15px;
        margin-bottom: 15px;
    }
    
    .form-row .form-group {
        flex: 1;
    }
    
    .form-group {
        margin-bottom: 15px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #495057;
    }
    
    .form-group input, .form-group select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
    }
    
    .candidate-actions, .voter-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    
    .candidate-details {
        margin-top: 5px;
        color: #6c757d;
    }
`;
document.head.appendChild(style);

// Voter Management Functions
async function loadPollingStationsForAdmin() {
    try {
        const response = await fetch('/api/admin/stations', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            // Update both the voter form and candidate form station selects
            const newStationSelect = document.getElementById('newStationId');
            const candidateStationSelect = document.getElementById('candidateStation');
            
            const options = '<option value="">Select Polling Station</option>' +
                data.stations.map(station => 
                    `<option value="${station.StationID}">${station.Name} - ${station.WardName}</option>`
                ).join('');
            
            if (newStationSelect) newStationSelect.innerHTML = options;
            if (candidateStationSelect) candidateStationSelect.innerHTML = options;
        }
    } catch (error) {
        console.error('Error loading polling stations for admin:', error);
    }
}

async function handleAddVoter(e) {
    e.preventDefault();
    
    const nationalId = document.getElementById('newNationalId').value;
    const stationId = document.getElementById('newStationId').value;
    
    if (!nationalId || !stationId) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/voters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ nationalId, stationId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const customVoterID = data.customVoterID || 'N/A';
            const voterName = data.voter ? data.voter.name : 'Unknown';
            showNotification(`Voter registered successfully! VoterID: ${customVoterID}`, 'success');
            
            // Show detailed success message
            setTimeout(() => {
                showNotification(`Registration Details:\nName: ${voterName}\nVoterID: ${customVoterID}\nDatabase ID: ${data.voterId}`, 'info');
            }, 1000);
            
            document.getElementById('newNationalId').value = '';
            document.getElementById('newStationId').value = '';
            // Refresh the voters list
            loadAdminContent('voters');
        } else {
            showNotification(data.error || 'Failed to register voter', 'error');
        }
    } catch (error) {
        console.error('Error registering voter:', error);
        showNotification('Failed to register voter. Please try again.', 'error');
    }
}

async function viewVoterDetails(nationalId) {
    try {
        const response = await fetch(`/api/admin/voters/${nationalId}`);
        const data = await response.json();
        
        if (data.success) {
            const voter = data.voter;
            
            // Show voter details in a simple alert or notification
            const age = voter.DOB ? calculateAgeFromDOB(voter.DOB) : 'Unknown';
            const customVoterID = voter.CustomVoterID || `VID${voter.VoterID.toString().padStart(3, '0')}`;
            const details = `Voter Details:\nName: ${voter.FName} ${voter.MName || ''} ${voter.SName || ''}\nNational ID: ${voter.NationalID}\nAge: ${age} years old\nPolling Station: ${voter.StationName}\nVoter ID: ${customVoterID}\nDatabase ID: ${voter.VoterID}`;
            alert(details);
        } else {
            showNotification('Failed to load voter details', 'error');
        }
    } catch (error) {
        console.error('Error loading voter details:', error);
        showNotification('Failed to load voter details', 'error');
    }
}

// Voter update functionality removed - only viewing is supported

async function handleDeleteVoter(nationalId) {
    if (!confirm('Are you sure you want to delete this voter? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/voters/${nationalId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Voter removed successfully!', 'success');
            // Refresh the voters list
            loadAdminContent('voters');
        } else {
            showNotification(data.error || 'Failed to delete voter', 'error');
        }
    } catch (error) {
        console.error('Error deleting voter:', error);
        showNotification('Failed to delete voter. Please try again.', 'error');
    }
}

// Voter modal functionality removed - only viewing is supported

function closeAddVoterModal() {
    document.getElementById('addVoterModal').style.display = 'none';
}

function closeVoterModal() {
    document.getElementById('voterModal').style.display = 'none';
}

// Candidate Management Functions
async function loadPositionsForAdmin() {
    try {
        const response = await fetch('/api/admin/positions', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('candidatePosition');
            if (select) {
                select.innerHTML = '<option value="">Select Position</option>' +
                    data.positions.map(position => 
                        `<option value="${position.PositionID}">${position.Title}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading positions for admin:', error);
    }
}

async function loadPartiesForAdmin() {
    try {
        const response = await fetch('/api/admin/parties', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const select = document.getElementById('candidateParty');
            if (select) {
                select.innerHTML = '<option value="">Select Party</option>' +
                    data.parties.map(party => 
                        `<option value="${party.PartyName}">${party.PartyName}</option>`
                    ).join('');
            }
        }
    } catch (error) {
        console.error('Error loading parties for admin:', error);
    }
}

async function handleAddCandidate(e) {
    e.preventDefault();
    console.log('handleAddCandidate called');
    
    const nationalId = document.getElementById('candidateNationalId').value;
    const positionId = document.getElementById('candidatePosition').value;
    const partyName = document.getElementById('candidateParty').value;
    const stationId = document.getElementById('candidateStation').value || null;
    
    console.log('Form data:', { nationalId, positionId, partyName, stationId });
    
    if (!nationalId || !positionId || !partyName) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/candidates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ 
                nationalId, 
                positionId, 
                partyName, 
                stationId: stationId || undefined 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate added successfully!', 'success');
            document.getElementById('addCandidateForm').reset();
            // Refresh the candidates list
            loadAdminContent('candidates');
        } else {
            showNotification(data.error || 'Failed to add candidate', 'error');
        }
    } catch (error) {
        console.error('Error adding candidate:', error);
        showNotification('Failed to add candidate. Please try again.', 'error');
    }
}

async function deleteCandidate(candidateId, candidateName) {
    if (!confirm(`Are you sure you want to delete candidate: ${candidateName}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/candidates/${candidateId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Candidate deleted successfully!', 'success');
            // Refresh the candidates list
            loadAdminContent('candidates');
        } else {
            showNotification(data.error || 'Failed to delete candidate', 'error');
        }
    } catch (error) {
        console.error('Error deleting candidate:', error);
        showNotification('Failed to delete candidate. Please try again.', 'error');
    }
}

async function handleAddParty(e) {
    e.preventDefault();
    
    const partyName = document.getElementById('partyName').value;
    const partySymbol = document.getElementById('partySymbol').value;
    
    if (!partyName || !partySymbol) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/parties', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ partyName, symbol: partySymbol })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Political party added successfully!', 'success');
            document.getElementById('addPartyForm').reset();
            // Refresh the candidates list to update party dropdowns
            loadAdminContent('candidates');
        } else {
            showNotification(data.error || 'Failed to add political party', 'error');
        }
    } catch (error) {
        console.error('Error adding political party:', error);
        showNotification('Failed to add political party. Please try again.', 'error');
    }
}

function closeAdminLoginModal() {
    document.getElementById('adminLoginModal').style.display = 'none';
}

// ===== POLLING STATION MANAGEMENT FUNCTIONS =====

// Open add station modal
function openAddStationModal() {
    document.getElementById('stationModal').style.display = 'block';
    document.getElementById('stationModalTitle').textContent = 'Add New Polling Station';
    document.getElementById('stationForm').reset();
    
    // Reset and disable dependent dropdowns
    document.getElementById('constituencySelect').innerHTML = '<option value="">Select Constituency</option>';
    document.getElementById('wardSelect').innerHTML = '<option value="">Select Ward</option>';
    document.getElementById('constituencySelect').disabled = true;
    document.getElementById('wardSelect').disabled = true;
    
    // Load districts
    loadDistricts();
}

// Close add station modal
function closeStationModal() {
    document.getElementById('stationModal').style.display = 'none';
}

// Open edit station modal
function editStation(stationId) {
    // Load station details and populate form
    loadStationDetails(stationId);
    document.getElementById('editStationModal').style.display = 'block';
}

// Close edit station modal
function closeEditStationModal() {
    document.getElementById('editStationModal').style.display = 'none';
}

// Load districts for dropdown
async function loadDistricts() {
    try {
        const response = await fetch('/api/admin/districts', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const districtSelect = document.getElementById('districtSelect');
            const editDistrictSelect = document.getElementById('editDistrictSelect');
            
            districtSelect.innerHTML = '<option value="">Select District</option>';
            editDistrictSelect.innerHTML = '<option value="">Select District</option>';
            
            data.districts.forEach(district => {
                districtSelect.innerHTML += `<option value="${district.DistrictID}">${district.DistrictName} (${district.Region})</option>`;
                editDistrictSelect.innerHTML += `<option value="${district.DistrictID}">${district.DistrictName} (${district.Region})</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading districts:', error);
    }
}

// Load constituencies by district
async function loadConstituencies(districtId, isEdit = false) {
    try {
        const response = await fetch(`/api/admin/constituencies/${districtId}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const constituencySelect = isEdit ? document.getElementById('editConstituencySelect') : document.getElementById('constituencySelect');
            
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            constituencySelect.disabled = false;
            
            data.constituencies.forEach(constituency => {
                constituencySelect.innerHTML += `<option value="${constituency.ConstituencyID}">${constituency.Name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading constituencies:', error);
    }
}

// Load wards by constituency
async function loadWards(constituencyId, isEdit = false) {
    try {
        const response = await fetch(`/api/admin/wards/${constituencyId}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const wardSelect = isEdit ? document.getElementById('editWardSelect') : document.getElementById('wardSelect');
            
            wardSelect.innerHTML = '<option value="">Select Ward</option>';
            wardSelect.disabled = false;
            
            data.wards.forEach(ward => {
                wardSelect.innerHTML += `<option value="${ward.WardID}">${ward.Name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading wards:', error);
    }
}

// Load station details for editing
async function loadStationDetails(stationId) {
    try {
        const response = await fetch(`/api/admin/stations/${stationId}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success) {
            const station = data.station;
            
            // Populate form fields
            document.getElementById('editStationId').value = station.StationID;
            document.getElementById('editStationName').value = station.Name;
            
            // Load and set district
            await loadDistricts();
            document.getElementById('editDistrictSelect').value = station.DistrictID;
            
            // Load and set constituency
            await loadConstituencies(station.DistrictID, true);
            document.getElementById('editConstituencySelect').value = station.ConstituencyID;
            
            // Load and set ward
            await loadWards(station.ConstituencyID, true);
            document.getElementById('editWardSelect').value = station.WardID;
        }
    } catch (error) {
        console.error('Error loading station details:', error);
        showNotification('Failed to load station details', 'error');
    }
}

// Add event listeners for station forms
document.addEventListener('DOMContentLoaded', function() {
    // District change event for add station form
    const districtSelect = document.getElementById('districtSelect');
    if (districtSelect) {
        districtSelect.addEventListener('change', function() {
            const constituencySelect = document.getElementById('constituencySelect');
            const wardSelect = document.getElementById('wardSelect');
            
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            wardSelect.innerHTML = '<option value="">Select Ward</option>';
            constituencySelect.disabled = true;
            wardSelect.disabled = true;
            
            if (this.value) {
                loadConstituencies(this.value);
            }
        });
    }
    
    // Constituency change event for add station form
    const constituencySelect = document.getElementById('constituencySelect');
    if (constituencySelect) {
        constituencySelect.addEventListener('change', function() {
            const wardSelect = document.getElementById('wardSelect');
            wardSelect.innerHTML = '<option value="">Select Ward</option>';
            wardSelect.disabled = true;
            
            if (this.value) {
                loadWards(this.value);
            }
        });
    }
    
    // District change event for edit station form
    const editDistrictSelect = document.getElementById('editDistrictSelect');
    if (editDistrictSelect) {
        editDistrictSelect.addEventListener('change', function() {
            const constituencySelect = document.getElementById('editConstituencySelect');
            const wardSelect = document.getElementById('editWardSelect');
            
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            wardSelect.innerHTML = '<option value="">Select Ward</option>';
            constituencySelect.disabled = true;
            wardSelect.disabled = true;
            
            if (this.value) {
                loadConstituencies(this.value, true);
            }
        });
    }
    
    // Constituency change event for edit station form
    const editConstituencySelect = document.getElementById('editConstituencySelect');
    if (editConstituencySelect) {
        editConstituencySelect.addEventListener('change', function() {
            const wardSelect = document.getElementById('editWardSelect');
            wardSelect.innerHTML = '<option value="">Select Ward</option>';
            wardSelect.disabled = true;
            
            if (this.value) {
                loadWards(this.value, true);
            }
        });
    }
    
    // Add station form submission
    const stationForm = document.getElementById('stationForm');
    if (stationForm) {
        stationForm.addEventListener('submit', handleAddStation);
    }
    
    // Edit station form submission
    const editStationForm = document.getElementById('editStationForm');
    if (editStationForm) {
        editStationForm.addEventListener('submit', handleEditStation);
    }
    
    // Delete station button
    const deleteStationBtn = document.getElementById('deleteStationBtn');
    if (deleteStationBtn) {
        deleteStationBtn.addEventListener('click', handleDeleteStation);
    }
});

// Handle add station form submission
async function handleAddStation(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const stationData = {
        stationId: formData.get('stationId'),
        name: formData.get('name'),
        wardId: formData.get('wardId')
    };
    
    try {
        const response = await fetch('/api/admin/stations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(stationData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Polling station added successfully!', 'success');
            closeStationModal();
            // Refresh the stations list
            loadAdminContent('stations');
        } else {
            showNotification(data.error || 'Failed to add polling station', 'error');
        }
    } catch (error) {
        console.error('Error adding polling station:', error);
        showNotification('Failed to add polling station. Please try again.', 'error');
    }
}

// Handle edit station form submission
async function handleEditStation(e) {
    e.preventDefault();
    
    const stationId = document.getElementById('editStationId').value;
    const formData = new FormData(e.target);
    const stationData = {
        name: formData.get('name'),
        wardId: formData.get('wardId')
    };
    
    try {
        const response = await fetch(`/api/admin/stations/${stationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(stationData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Polling station updated successfully!', 'success');
            closeEditStationModal();
            // Refresh the stations list
            loadAdminContent('stations');
        } else {
            showNotification(data.error || 'Failed to update polling station', 'error');
        }
    } catch (error) {
        console.error('Error updating polling station:', error);
        showNotification('Failed to update polling station. Please try again.', 'error');
    }
}

// Handle delete station
async function handleDeleteStation() {
    const stationId = document.getElementById('editStationId').value;
    const stationName = document.getElementById('editStationName').value;
    
    if (!confirm(`Are you sure you want to delete polling station: ${stationName}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/stations/${stationId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Polling station deleted successfully!', 'success');
            closeEditStationModal();
            // Refresh the stations list
            loadAdminContent('stations');
        } else {
            showNotification(data.error || 'Failed to delete polling station', 'error');
        }
    } catch (error) {
        console.error('Error deleting polling station:', error);
        showNotification('Failed to delete polling station. Please try again.', 'error');
    }
}

// Global delete station function (called from HTML onclick)
async function deleteStation(stationId, stationName) {
    if (!confirm(`Are you sure you want to delete polling station: ${stationName}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/stations/${stationId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Polling station deleted successfully!', 'success');
            // Refresh the stations list
            loadAdminContent('stations');
        } else {
            showNotification(data.error || 'Failed to delete polling station', 'error');
        }
    } catch (error) {
        console.error('Error deleting polling station:', error);
        showNotification('Failed to delete polling station. Please try again.', 'error');
    }
}

// Global delete voter function (called from HTML onclick)
async function deleteVoter(nationalId, voterName) {
    if (!confirm(`Are you sure you want to delete voter: ${voterName}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/voters/${nationalId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Voter deleted successfully!', 'success');
            // Refresh the voters list
            loadAdminContent('voters');
        } else {
            showNotification(data.error || 'Failed to delete voter', 'error');
        }
    } catch (error) {
        console.error('Error deleting voter:', error);
        showNotification('Failed to delete voter. Please try again.', 'error');
    }
}

// Add event listeners for the forms
document.addEventListener('DOMContentLoaded', function() {
    // Clear forms on page load for security
    clearLoginForm();
    clearRegistrationForm();
    
    // Add event listener for the modal voter form
    const modalVoterForm = document.getElementById('addVoterForm');
    if (modalVoterForm) {
        modalVoterForm.addEventListener('submit', handleAddVoter);
    }
    
    // Add modal close functionality
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Close modal when clicking outside of it
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });
    
    // Add event listeners for candidate and party forms
    const addPartyForm = document.getElementById('addPartyForm');
    
    // Add event listener for VoterID lookup form
    const voteridLookupForm = document.getElementById('voteridLookupForm');
    if (voteridLookupForm) {
        voteridLookupForm.addEventListener('submit', handleVoterIDLookup);
    }
    
    // Add event listener for password reset form
    const passwordResetForm = document.getElementById('passwordResetForm');
    if (passwordResetForm) {
        passwordResetForm.addEventListener('submit', handlePasswordReset);
    }
    if (addPartyForm) {
        addPartyForm.addEventListener('submit', handleAddParty);
    }
    
    // Add event listeners for registration form cascading dropdowns
    const regDistrictSelect = document.getElementById('regDistrict');
    if (regDistrictSelect) {
        regDistrictSelect.addEventListener('change', function() {
            const constituencySelect = document.getElementById('regConstituency');
            const stationSelect = document.getElementById('regStation');
            
            constituencySelect.innerHTML = '<option value="">Select Constituency</option>';
            stationSelect.innerHTML = '<option value="">Select Polling Station</option>';
            constituencySelect.disabled = true;
            stationSelect.disabled = true;
            
            if (this.value) {
                loadConstituenciesForRegistration(this.value);
            }
        });
    }
    
    const regConstituencySelect = document.getElementById('regConstituency');
    if (regConstituencySelect) {
        regConstituencySelect.addEventListener('change', function() {
            const stationSelect = document.getElementById('regStation');
            
            stationSelect.innerHTML = '<option value="">Select Polling Station</option>';
            stationSelect.disabled = true;
            
            if (this.value) {
                loadStationsForRegistration(this.value);
            }
        });
    }
});
