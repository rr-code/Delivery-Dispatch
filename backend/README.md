# Delivery Dispatch Agent: Backend

Next.js API routes + service layer + Gemini agent tools, backed by Supabase.
Plain JavaScript, one extra dependency (`@supabase/supabase-js`). No frontend code in here.

## 1. Run it standalone

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run dev                     # http://localhost:3000/api/health
```

## 2. Set up Supabase

1. Create a project at supabase.com.
2. SQL Editor -> run `supabase/schema.sql`, then `supabase/seed.sql` (6 drivers, 6 orders around Chennai; edit the coordinates for your city).
3. Project Settings -> API: copy the project URL into `SUPABASE_URL` and the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY`.
   The service role key is server-only. The React app should use the **anon** key, and only for read/Realtime.

## 3. Paste into your existing Next.js project

Copy these into the same locations in your project (if your project uses a `src/` folder, put `app` and `lib` inside `src/`; all imports are relative so nothing else needs changing):

| Copy | Notes |
|---|---|
| `app/api/` | All API routes |
| `lib/` | Services, agent, helpers |
| `supabase/` | SQL to run in Supabase (not part of the app bundle) |
| `.env.example` | Merge the variables into your `.env.local` |
| `next.config.js` | **Merge only the `headers()` block** into your existing config, and only if the React app runs on a different origin |

Do **not** copy `app/layout.js` and `app/page.js` (standalone shell only).
Then run: `npm install @supabase/supabase-js`.

Requirements: Next.js 14.2+ (App Router) and Node 18+. This project is written against Next 15; route handlers read `params` with `await ctx.params`, which also works on Next 14. If your project uses the Pages Router instead, tell me and the routes can be converted.

## 4. Response format

Success: `{ "data": ... }`. Failure: `{ "error": "message", "details": ... }` with an HTTP status (400 bad input, 404 not found, 409 conflict / invalid transition, 422 business-rule violation, 502 external service failed).

## 5. Endpoints

| Method + path | Body / query | Purpose |
|---|---|---|
| GET `/api/health` | | Config check |
| GET `/api/orders` | `?status=&limit=` | List orders |
| POST `/api/orders` | `pickup_address, drop_address, pickup_lat?, pickup_lng?, drop_lat?, drop_lng?, weight_kg?, priority? (normal\|urgent), time_window_end? (ISO), customer_name?, customer_phone?` | Create order. Coordinates are geocoded from the address if omitted (needs mapbox/google) |
| GET `/api/orders/:id` | | Order + its deliveries |
| PATCH `/api/orders/:id` | `priority?, time_window_end?, status? ("cancelled" only)` | Edit / cancel before pickup |
| GET `/api/drivers` | `?status=` | Drivers with latest `location` and `active_orders` |
| POST `/api/drivers` | `name, vehicle_type?, capacity_kg?, max_active_orders?, phone?, lat?, lng?` | Create driver |
| GET `/api/drivers/:id` | | One driver |
| PATCH `/api/drivers/:id` | `status?, name?, ...` | Setting `offline`/`on_break` auto-reassigns un-picked deliveries |
| POST `/api/drivers/:id/location` | `lat, lng, speed_kmh?` | Push a GPS point |
| POST `/api/dispatch/assign` | `order_id, driver_id?, reason?` | Manual (with driver_id) or automatic assignment |
| GET `/api/dispatch/candidates` | `?order_id=` | Eligible drivers ranked by routed pickup ETA |
| POST `/api/dispatch/run` | `mode? (auto\|agent\|rules), instruction?` | Assign all pending orders with the Gemini agent (or rules if no key) |
| POST `/api/dispatch/reassign` | `delivery_id, new_driver_id?, reason?` | Move a still-`assigned` delivery |
| POST `/api/routes/preview` | `from:{lat,lng}, to:{lat,lng}` | Distance, duration, polyline from the routing service |
| GET `/api/deliveries` | `?active=true\|false&status=&driver_id=` | Deliveries with `orders` and `drivers` embedded |
| PATCH `/api/deliveries/:id/status` | `status, reason?` | Validated status change |
| POST `/api/monitor/check` | `threshold_min?` | Re-estimate ETAs, flag delays |
| POST `/api/simulation/tick` | `step_seconds?, auto_progress?` | Move simulated drivers one step |
| GET `/api/events` | `?limit=&order_id=` | Audit log feed |

Status values. Order: `pending, assigned, picked_up, in_transit, delivered, failed, cancelled`. Delivery: same list without `pending`, plus `released` (set when a delivery is reassigned). Driver: `available, busy, offline, on_break`.

## 6. Business rules (all in `lib/services/assignment.js`)

1. Driver must be `available`, with capacity >= order weight and fewer than `max_active_orders` live deliveries.
2. Order must be `pending`; the claim is an atomic `pending -> assigned` update plus a unique index, so double assignment is impossible.
3. Ranking: lowest routed ETA to pickup. For normal orders ETAs within the same minute tie -> fewer active orders -> higher rating. Urgent orders use pure fastest ETA and are processed first.
4. Assignment is rejected (422) if the estimated delivery time misses `time_window_end`.
5. Status flow: `assigned -> picked_up -> in_transit -> delivered` (or `failed`/`cancelled` where allowed). Anything else is 409.
6. Delay = new routed ETA vs `time_window_end` (or the original planned ETA). At or above `DELAY_THRESHOLD_MIN` a `delay` event is logged.
7. Driver goes offline/on break: deliveries still `assigned` are released and reassigned; picked-up ones get a `manual_handling_required` event.
8. Every change writes `delivery_events`; every agent run is saved in `agent_runs`.

## 7. AI agent

`lib/agent/tools.js` defines 8 read tools and 5 write tools (Gemini function calling). Each one calls the same service layer as the REST routes, so the AI cannot bypass validation, and rule violations come back to the model as `{ error }`. `lib/agent/gemini.js` runs the loop (max 8 model calls) using the Gemini REST API via `fetch`. Set `GEMINI_MODEL` if the default model name is retired.

## 8. Routing and simulated GPS

- `ROUTING_PROVIDER=mapbox` or `google` gives real driving distances/ETAs. The default `mock` is a straight-line estimate (responses say `source: "estimate"`) so you can demo without a key; use a real provider for anything you present as route optimisation.
- Driver GPS is simulated: call `POST /api/simulation/tick` every few seconds. Drivers with live deliveries move in a straight line to pickup, then drop, and statuses advance automatically. The map polyline is the real routed one.

## 9. Frontend: live updates

Subscribe with the Supabase anon key to Realtime on `orders`, `deliveries`, `driver_locations`, `delivery_events` (enabled by `schema.sql`, read-only policies included). All writes go through the API.

## 10. Known gaps (decide next)

- **No authentication yet.** Every route is open. Add a dispatcher login before deploying anywhere public.
- The frontend's data shapes are unknown to me. Share its field names and I'll align the responses.
- Not run against a live Supabase / Gemini / Maps account yet, so test with your keys and report any errors.

## Quick test (after seeding)

```bash
curl localhost:3000/api/health
curl -X POST localhost:3000/api/dispatch/run -H "Content-Type: application/json" -d '{"mode":"rules"}'
curl -X POST localhost:3000/api/simulation/tick
curl localhost:3000/api/deliveries
```
