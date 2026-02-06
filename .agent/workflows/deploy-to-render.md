---
description: Deploy changes to Render production environment
---

# Deploy to Production

This workflow handles the deployment of local changes to the GitHub repository, which triggers the Render build pipeline.

1.  **Run Build Check**
    // turbo
    Run `npm.cmd run build` to ensure the project builds locally without errors.
    *If this fails, STOP and fix the errors.*

2.  **Git Status Check**
    // turbo
    Run `git status` to see pending changes.

3.  **Commit Changes**
    Ask the user for a commit message if there are uncommitted changes.
    Run `git add .`
    Run `git commit -m "[User Message]"`

4.  **Push to GitHub**
    // turbo
    Run `git push origin main`

5.  **Verify Deployment**
    Notify the user: "Code pushed to GitHub. Render deployment triggered. Please check Render dashboard for progress."
