# Deployment Guide

## Quick Deploy to Render.com (Recommended - Free Tier Available)

### 1. Push to GitHub (Already Done)
Your code is now on GitHub at: https://github.com/Papwright/MEC

### 2. Deploy to Render
1. Go to https://render.com and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select the `Papwright/MEC` repository
5. Configure:
   - **Name**: malawi-elections
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free (or paid for production)

6. Add Environment Variables (click "Advanced"):
   ```
   NODE_ENV=production
   PORT=3000
   DB_HOST=your-mysql-host
   DB_USER=your-mysql-user
   DB_PASSWORD=your-mysql-password
   DB_NAME=tripartite_elections_mw
   SESSION_SECRET=your-secure-random-string
   JWT_SECRET=your-secure-random-string
   ```

7. Click "Create Web Service"

### 3. Add MySQL Database on Render
1. Click "New +" → "MySQL"
2. Configure database and note credentials
3. Update your web service environment variables with database details

## Alternative: Deploy to Railway.app

1. Go to https://railway.app
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose `Papwright/MEC`
5. Add MySQL database from Railway
6. Add environment variables
7. Deploy!

## Alternative: Deploy to Heroku

```bash
# Install Heroku CLI first
heroku login
heroku create malawi-elections
heroku addons:create jawsdb-maria:kitefin
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-secret
git push heroku main
```

## Post-Deployment Steps

1. Import your database schema to production database
2. Test all functionality
3. Set up custom domain (optional)
4. Enable SSL (automatic on Render/Railway/Heroku)
5. Monitor logs and performance

## Your Live URL
After deployment, you'll get a URL like:
- Render: `https://malawi-elections.onrender.com`
- Railway: `https://malawi-elections.up.railway.app`
- Heroku: `https://malawi-elections.herokuapp.com`
