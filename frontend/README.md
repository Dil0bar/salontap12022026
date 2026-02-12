# SalonTap — Lightweight Salon Booking App

**What's included**
- Frontend: static HTML + TailwindCSS + vanilla JS (pages: index, find, add_salon, login, admin_panel, salon)
- Backend: Node.js + Express, SQLite (file `backend/db/salon.db`)
- Admin registration/login (JWT)
- Admin panel: edit salon, add masters, add schedules, upload photos
- Thumbnails for salon cards
- Booking flow: users select master, day, time slot → booking saved and (optionally) Telegram notification sent

**IMPORTANT - Telegram token**
Do **NOT** leave real bot token in repo. Open `backend/config.js` and set:
```
TELEGRAM_BOT_TOKEN = "YOUR_NEW_TOKEN"
TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
JWT_SECRET = "a_long_random_secret"
```
Revoke any token you previously posted publicly.

## Quick start (local)

1. Install Node.js (v16+).
2. Unzip project and open terminal.
3. Backend:
   ```bash
   cd backend
   npm install
   node index.js
   ```
   Server starts on http://localhost:3000 and creates `backend/db/salon.db`.

4. Frontend:
   - Open `frontend/index.html` in a browser **or** run a static server:
     ```
     npx http-server frontend
     ```
   - Use the UI:
     - "Добавить салон" → register admin + create salon
     - "Войти" → login using email/password → admin panel
     - In admin panel: upload photos, add masters, add time slots.
     - In find/index list, thumbnails appear.
     - On salon page, users can see masters' schedules by weekday and book a slot.

## Notes
- If you run frontend via `file://` and experience issues, use `npx http-server frontend` or VSCode Live Server.
- Uploaded photos are saved to `backend/uploads/`.
- DB init is automatic on server start.
