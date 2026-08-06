# 🔥 Fire & Flavour — Setup & Run Guide

## Project Structure

```
F&F/
├── server/              ← Node.js + Express backend
│   ├── server.js        ← Entry point
│   ├── db/connection.js ← TiDB connection + schema init
│   ├── middleware/auth.js
│   └── routes/          ← auth, menu, billing, bills, dashboard, settings
├── client/              ← Static frontend (served by Express)
│   ├── index.html       ← Login page
│   ├── dashboard.html
│   ├── billing.html     ← Main POS interface
│   ├── recent-bills.html
│   ├── menu.html
│   ├── settings.html
│   ├── css/style.css
│   └── js/api.js
└── .env                 ← Your credentials (edit this first!)
```

## Step 1: Configure `.env`

Edit `/home/abhilashreddy/F&F/.env`:

```env
DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=your_tidb_username
DB_PASSWORD=your_tidb_password
DB_NAME=fire_and_flavour

JWT_SECRET=any_long_random_string_here
PORT=3000
```

> Get TiDB credentials from: https://tidbcloud.com → Your Cluster → Connect

## Step 2: Create TiDB Database

In TiDB Cloud SQL console, run:
```sql
CREATE DATABASE IF NOT EXISTS fire_and_flavour;
```
The tables are auto-created on first server start.

## Step 3: Run the Server

```bash
cd /home/abhilashreddy/F&F/server
npm run dev       # development (auto-restart)
# OR
npm start         # production
```

Open: **http://localhost:3000**

## Step 4: First-Time Setup

1. Open http://localhost:3000 → Click **"Set up admin account"**
2. Create your admin username + password
3. Login → You're in! 🔥

## Printer Setup (TVS RP3230)

1. Connect printer to Wi-Fi (same network as the server PC)
2. Note the printer's IP address
3. Go to **Settings** in the app → Enter IP + Port (9100)
4. Enable Auto-print Receipt and Auto-print KOT

## Menu Upload

1. Go to **Menu** → Download the Excel template
2. Fill in: Item Code | Item Name | Category | Default Price  
3. Upload the file → Menu is updated instantly

## Development

```bash
cd server && npm run dev    # nodemon auto-restart
```
