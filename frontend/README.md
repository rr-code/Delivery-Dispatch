# Delivery Dispatch Agent: Frontend (React + Vite)

    npm install
    npm run dev

Set `VITE_API_URL` in `frontend/.env.local` to the backend URL (for example `http://localhost:3001`).
Sign in with the app passcode configured on the backend (`APP_PASSCODE`).

All data comes from the Next.js backend through `src/api/client.js` and refreshes every 10 seconds.
The map uses Leaflet with OpenStreetMap tiles (no API key needed).
