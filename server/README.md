# VLESS Config Distribution System

Persian (Farsi, RTL) VLESS config-distribution website built with static frontend + Supabase backend.

## Architecture

```
Frontend (Static HTML/CSS/JS)  →  Supabase Edge Functions (Service Role)  →  Postgres + Auth + Storage
        ↑                                  ↑
   Anon Key Only                    Service Role Key
```

## Features

- **RTL Persian UI** — Modern dark theme with animations
- **Secure Auth Flow** — One-time entry codes + email/password
- **Atomic Config Assignment** — PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` prevents race conditions
- **Admin Panel** — User management, config pool, entry codes, video uploads
- **No Build Step** — Plain HTML/CSS/JS, runs by opening files

## Setup Instructions

### 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a project
2. Note your **Project URL** and **Anon Key** from Settings → API

### 2. Database Schema

1. Go to SQL Editor in Supabase Dashboard
2. Copy the contents of `supabase/migrations/20260729000000_initial_schema.sql`
3. Run the SQL

### 3. Edge Functions

Deploy each function using the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Deploy each function
supabase functions deploy verify-entry-code
supabase functions deploy assign-config
supabase functions deploy admin-login
supabase functions deploy admin-add-configs
supabase functions deploy admin-activate-code
supabase functions deploy admin-get-users
supabase functions deploy admin-upload-video
```

### 4. Storage Bucket

1. Go to Storage in Supabase Dashboard
2. Create a bucket named `videos`
3. Set it to **public** (or configure RLS policies)

### 5. Frontend Config

1. Open `js/config.js`
2. Replace `YOUR_PROJECT_ID` and `YOUR_ANON_KEY` with your actual values

### 6. Change Admin Password

Passwords are stored as SHA-256 hashes with a salt. To generate a new hash:

```bash
# Generate hash (replace 'yourpassword' with your actual password)
echo -n 'yourpassword_salt_vless_admin' | sha256sum
```

Then update the SQL or run this after setup:

```sql
-- Replace 'YOUR_NEW_HASH' with the output from sha256sum (the hex string only)
UPDATE admin_users 
SET password_hash = 'YOUR_NEW_HASH' 
WHERE username = 'admin';
```

### 7. Deploy Frontend

**Option A: GitHub Pages**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO
git push -u origin main

# Enable GitHub Pages in repo settings
```

**Option B: Any Static Host**
Just upload the files to any static hosting service (Netlify, Vercel, Cloudflare Pages, etc.)

### 8. Configure CORS

In Supabase Dashboard → Settings → API:
- Add your frontend domain to **Additional allowed CORS origins**

## Security Model

| Layer | What's Protected |
|-------|-----------------|
| **RLS** | Users can only read their own config and profile |
| **Edge Functions** | All privileged ops (config assignment, admin actions) go through server-side functions |
| **Service Role** | Never exposed to frontend — only used inside Edge Functions |
| **Entry Codes** | 5-minute expiry, single use, rate-limited |
| **Admin Auth** | Separate from user auth, session tokens with expiry |

## File Structure

```
/
├── index.html              # Landing / Login page
├── dashboard.html          # User panel
├── admin.html              # Admin panel
├── css/
│   └── styles.css          # RTL Persian styles
├── js/
│   ├── config.js           # Supabase credentials (EDIT THIS)
│   └── utils.js            # Shared utilities
├── supabase/
│   ├── migrations/
│   │   └── 20260729000000_initial_schema.sql
│   └── functions/
│       ├── verify-entry-code/index.ts
│       ├── assign-config/index.ts
│       ├── admin-login/index.ts
│       ├── admin-add-configs/index.ts
│       ├── admin-activate-code/index.ts
│       ├── admin-get-users/index.ts
│       └── admin-upload-video/index.ts
└── README.md
```

## Usage

### For Users
1. Get an entry code from the admin
2. Go to the website → Register tab
3. Enter your name, email, password, and the 6-digit code
4. After registration, click "Get My Config"
5. Copy the config and import it into your VLESS client

### For Admin
1. Go to `/admin.html`
2. Login with admin credentials
3. **Manage Users** — View all users and their config status
4. **Add Configs** — Paste VLESS URIs (one per line)
5. **Generate Codes** — Create one-time entry codes (valid 5 minutes)
6. **Add Videos** — Upload tutorial videos (YouTube/Vimeo links or file upload)

## Important Notes

- **Never** put your Supabase service role key in frontend code
- Change the default admin password before production use
- The `anon` key in `config.js` is safe to expose — RLS protects the data
- Config assignment is atomic — no two users will ever get the same config
- Entry codes expire after 5 minutes and can only be used once

## License

Made by [amirlwf.ir](https://amirlwf.ir)
