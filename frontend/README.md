# Delivery Dispatch Agent: Frontend (React + Vite)

    npm install
    npm run dev

The frontend runs on mock data and a simulated GPS loop. All data access is in `src/api/client.js`.
When the Next.js backend is ready, replace the mock functions there with `fetch(VITE_API_URL + '/api/...')`.
The map is an SVG placeholder; swap `MapView` in `src/components.jsx` for Google Maps or Mapbox later.
