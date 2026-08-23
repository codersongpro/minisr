<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/322ea91a-86d5-48b0-8a51-a8114f013f66

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY`, `APP_PASSWORD`, and `SESSION_SECRET` in Vercel Environment Variables
3. Run the app:
   `npm run dev`

For local Vercel Function testing, use `vercel dev` after setting the same environment variables locally. Never put `GEMINI_API_KEY` in a public browser variable.
