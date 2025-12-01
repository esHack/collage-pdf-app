# Deployment Instructions for Vercel

## Prerequisites
- GitHub account
- Vercel account (sign up at vercel.com)

## Steps to Deploy

### 1. Initialize Git Repository (if not already done)
```bash
cd /Users/eswar.yaga/IdeaProjects/collage-pdf-app
git init
git add .
git commit -m "Initial commit - Collage PDF App"
```

### 2. Push to GitHub
```bash
# Create a new repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/collage-pdf-app.git
git branch -M main
git push -u origin main
```

### 3. Deploy on Vercel

**Option A: Using Vercel CLI (Recommended)**
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
cd /Users/eswar.yaga/IdeaProjects/collage-pdf-app
vercel
```

**Option B: Using Vercel Dashboard**
1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your GitHub repository
4. Vercel will auto-detect the configuration from `vercel.json`
5. Click "Deploy"

### 4. Environment Variables (if needed)
No environment variables are required for basic deployment.

### 5. Custom Domain (Optional)
After deployment:
1. Go to your project in Vercel dashboard
2. Click "Settings" > "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

## Configuration Files Created

- `vercel.json` - Vercel configuration
- `.gitignore` - Git ignore patterns
- `.vercelignore` - Files to ignore during deployment
- `backend/api/generate-pdf.js` - Serverless function for PDF generation
- Updated `backend/package.json` - Added Chromium for serverless
- Updated `frontend/src/App.js` - Environment-aware API calls

## Testing Deployment

After deployment, Vercel will provide a URL like:
`https://your-project-name.vercel.app`

Test the app:
1. Upload images
2. Arrange them on canvas
3. Click "Download PDF"
4. Verify PDF generation works

## Troubleshooting

### PDF Generation Fails
- Check function logs in Vercel dashboard
- Ensure memory is set to 3008MB in vercel.json
- Check that @sparticuz/chromium is installed

### Images Not Loading
- Verify CORS is properly configured
- Check network tab for failed requests

### Build Fails
- Ensure all dependencies are in package.json
- Check build logs in Vercel dashboard

## Free Tier Limits
- 100GB bandwidth/month
- 12,000 serverless function invocations/day
- 100 hours function execution time/month

Perfect for testing and small-scale use!
