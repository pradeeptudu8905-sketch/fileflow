# FileFlow — deployment-ready starter

## Architecture
- Static frontend: Netlify, publishing the `frontend/` directory.
- API: Render Web Service using Docker from the `backend/` directory.
- Browser: image compression and JPG/PNG-to-PDF.
- Backend: PDF-to-JPG and PPT/PPTX-to-PDF. Docker image installs LibreOffice.

## Deploy the backend to Render
1. Push this project to a GitHub repository.
2. In Render, choose **New > Web Service**, connect the repository.
3. Set **Root Directory** to `backend`.
4. Set **Runtime/Language** to **Docker**.
5. Deploy. Render builds `backend/Dockerfile`; the service should bind to `$PORT`.
6. Copy the deployed `https://....onrender.com` URL.

## Deploy the frontend to Netlify
1. Open https://app.netlify.com/drop and sign in.
2. Upload the `frontend/` folder (or connect the repository and set the publish directory to `frontend`).
3. After the backend has deployed, edit `frontend/config.js` before deploying the frontend:
   ```js
   window.FILEFLOW_API_URL = "https://YOUR-RENDER-SERVICE.onrender.com";
   ```
   Replace the example URL with your actual Render URL, then redeploy the `frontend/` folder.

## Configure backend CORS
In Render's environment variables, add:
`CORS_ORIGINS=https://YOUR-SITE.netlify.app`
Replace with the exact Netlify site origin. If using a custom domain, include it too, comma-separated.

## Local development
Backend:
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload --port 8000
```
Frontend (from project root, in another terminal):
```powershell
py -m http.server 5500 --directory frontend
```
For local development, keep `frontend/config.js` set to `http://127.0.0.1:8000`.

## Important
- The backend is publicly accessible after deployment. This starter has basic extension/size limits but is not hardened for a high-traffic public service.
- Before sharing widely, add rate limiting, request timeouts/resource limits, file-signature validation, and monitoring.
- Free hosting plans may sleep or have usage/resource limits. Check provider terms and current pricing.
- Uploaded files are processed temporarily and not intentionally stored.
