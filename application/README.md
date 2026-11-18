# Visa For Nation

This workspace contains separate React/Vite apps for the public site and admin dashboard, plus a Node.js/Express API. The API stores form data and Drive file metadata in MongoDB; new document bytes are stored in a private Google Drive folder and streamed to authenticated admins. Legacy local files, if present, can only be retrieved through the authenticated admin route.

## Backend configuration

Copy `backend/.env.example` to `backend/.env`. Configure these on the backend only:

- `MONGODB_URI`: your existing MongoDB Atlas connection string.
- `ADMIN_PASSWORD`: a unique admin login password.
- `JWT_SECRET`: at least 32 random characters. Admin login is disabled until both admin values are set.
- `CAPTCHA_SECRET`: optional dedicated secret for eligibility challenges; when omitted, `JWT_SECRET` is used.
- `CLIENT_URL`: comma-separated exact origins of the public and admin sites (including local origins for development).
- `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`: OAuth credentials and target folder. Uploads with attachments fail if Drive is not configured or the upload fails; there is no local/public storage fallback.

Never put `MONGODB_URI`, admin credentials, or Google OAuth credentials in either frontend's `VITE_*` variables. Only `VITE_API_BASE_URL` belongs in frontend build settings.

### Obtain Google OAuth credentials

1. In Google Cloud Console, select or create a project, enable the Google Drive API, and configure the OAuth consent screen for the Google account that owns or can edit the destination folder.
2. Create a Web application OAuth client and add `https://developers.google.com/oauthplayground` as an authorized redirect URI. Record its client ID and client secret in the backend environment. If the consent screen is in testing mode, add the authorized account as a test user.
3. In Google's OAuth 2.0 Playground settings, enable “Use your own OAuth credentials” and enter that client ID/secret. Select `https://www.googleapis.com/auth/drive`, authorize with the Google account that can access the destination folder, exchange the code, and save the returned refresh token as `GOOGLE_REFRESH_TOKEN`. Do not paste it into this repository or frontend settings.
4. Set `GOOGLE_DRIVE_FOLDER_ID` to the ID from the existing destination folder URL. Ensure the authorized account can add and read files in that folder. The application does not create, share publicly, rename, or delete Drive files/folders.

OAuth consent configuration, organization policy, and a real account authorization are external steps. A successful local build does not verify Drive access; confirm by submitting a test document and opening it while logged into the admin dashboard.

## Local development

Run each app in its own terminal, from its folder:

```powershell
cd .\application\backend
npm ci
npm run dev
```

```powershell
cd .\application\frontend
npm ci
npm run dev
```

```powershell
cd .\application\admin
npm ci
npm run dev
```

Public site: `http://localhost:5173`; admin: `http://localhost:5174`; health: `http://localhost:5000/api/health`.

## Cloudflare Pages deployment

Deploy the public frontend and admin as two separate Pages projects. No company domain is required; the free `pages.dev` addresses work as origins.

For each Pages project, connect the Git repository and set:

| Setting | Public frontend | Admin frontend |
|---|---|---|
| Root directory | `application/frontend` | `application/admin` |
| Build command | `npm run build` | `npm run build` |
| Build output directory | `dist` | `dist` |
| Build variable | `VITE_API_BASE_URL=https://YOUR-BACKEND-URL/api` | `VITE_API_BASE_URL=https://YOUR-BACKEND-URL/api` |

After both sites deploy, add their exact `https://<project>.pages.dev` origins to the backend's `CLIENT_URL` setting. Set API secrets in the backend host's secret/environment settings, never in Pages.

## Backend hosting and Workers assessment

The current API uses Express, Multer memory uploads, Mongoose 8, `googleapis`, Node HTTP server startup, and a local JSON offline queue. Cloudflare Workers now support TCP connections for MongoDB and Mongoose 9+ with Node compatibility, but this project is on Mongoose 8 and uses an Express server/listener, multipart middleware, Google API dependencies, and filesystem-backed queue logic. A safe Workers migration would require upgrading/reworking those pieces and validating the runtime; this project is **not configured for Workers deployment**. Keep it on a Node.js host for now.

For a no-cost starting deployment, Render offers a free Node web service with limits and idle spin-down. Create a Web Service for `application/backend`, use `npm install` (or `npm ci`) as the build command and `npm start` as the start command, and set the backend variables from `.env.example` in its Environment settings. Configure Atlas Network Access with the outbound CIDR ranges listed for your Render service (Dashboard > service > Connect > Outbound); dedicated static egress IPs require a paid plan. Avoid opening Atlas to all IP addresses unless you knowingly accept that broader exposure and use a strong database user/password. Render documents free services as hobby/testing instances, which can sleep after 15 minutes idle and have ephemeral filesystems; the existing JSON offline queue is therefore not durable there, and Atlas must be available for submissions. Check current provider limits before relying on this for production.

## Checks

```powershell
cd .\application\frontend; npm run build; npm run lint
cd ..\admin; npm run build
cd ..\backend; node --check server.js; node test-server.js
```

The backend has no configured build or automated test script; `test-server.js` checks that the existing model module loads.
