Project repacked by assistant.
Structure:
- frontend/  (static site: index.html, admin.html, salon.html, css/, js/, assets/)
- backend/   (Node/Express server, serves ../frontend and provides API)

How to run:
1) Install backend dependencies:
   cd backend
   npm install
2) Start server:
   PORT=3000 node index.js
   or: npm start (if package.json has script)
3) Open browser: http://localhost:3000/

Notes:
- node_modules folders were removed from the archive. Run npm install in backend.
- .env contains default values; set JWT_SECRET and Telegram tokens as needed.
