# The Gig Bandit — Get 'Em Gigs (`getemgigs.com`)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnddipiazza%2Fgetemgigs)
[![CI & Vercel Deployment](https://github.com/nddipiazza/getemgigs/actions/workflows/ci.yml/badge.svg)](https://github.com/nddipiazza/getemgigs/actions/workflows/ci.yml)
[![RobOS Project](https://img.shields.io/badge/RobOS-Project-00bcd4)](https://rowbose.com/projects/getemgigs/)

> **A game changer for the local music scene.**  
> Transforming local music economics through reciprocal attendance contracts, geolocation-verified escrow, and fair venue booking.

---

## 🎸 Motivation & Core Problems

Local bands constantly struggle to get people to attend their shows:
- They don't have massive social followings yet.
- They are works-in-progress building an audience.
- Traditional "pay-to-play" models exploit bands by forcing them to pre-purchase tickets to their own gigs.
- Friends and fellow bands frequently promise to attend, only to bail at the last minute.

**The Gig Bandit (`getemgigs.com`) solves both problems through game-theory incentives.**

---

## ⚡ Key Features

### 1. The Buddy Gig Feature (Beta)
- **"You scratch my back, I'll scratch yours."**
- Two groups link their gigs together in a mutual attendance contract: *"I will attend your gig if you attend my gig."*
- **Security Deposit Escrow**: Each group puts down a refundable deposit (e.g. $25–$100).
- **Geolocation Proof-of-Attendance**:
  - When the gig occurs, attendee presence is verified via GPS coordinates within a 150-meter radius of the venue.
  - **If Verified**: The security deposit is immediately unlocked and reimbursed.
  - **If No-Show (Bailed)**: Next morning, the escrow forfeits the deposit and transfers it directly to the host band whose show was bailed on!
- **Result**: A guaranteed win-win. Either you get attendees at your gig, or you get paid!

### 2. The Venue Stay-To-Play Feature (Beta)
- Replaces predatory pay-to-play.
- Instead of forcing bands to buy tickets to their own gig and beg friends to buy them, bands purchase a small ticket block to **another gig at the same venue** and attend!
- Bands support fellow local acts, venues guarantee attendance and bar revenue, and scene camaraderie flourishes.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 15 (App Router, Server Actions, Edge / Serverless)
- **UI & Styling**: React 19, TailwindCSS, Dark Neon Aesthetic
- **Deployment**: Vercel (Edge Network, Serverless Functions)
- **Domain**: `getemgigs.com`
- **Storage Layer**: Zero-Config Embedded Store + Pluggable MongoDB Atlas / Vercel Postgres / KV
- **Verification Engine**: Haversine Geolocation Distance Calculator (150m venue fence)

---

## 🚀 Quick Start

```bash
# Clone and enter repo
git clone https://github.com/nddipiazza/getemgigs.git
cd getemgigs

# Automated dev setup
./dev-setup.sh

# Run development server
npm run dev

# Run automated tests
npm test
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.
