# Vercel Deployment & Custom Domain Guide: getemgigs.com

This guide provides step-by-step instructions to deploy **The Gig Bandit** to Vercel and map your custom domain **`getemgigs.com`**.

## 1. Quick Deploy with Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Log in to your Vercel account
vercel login

# Deploy preview build
vercel

# Deploy production build
vercel --prod
```

## 2. Deploy from GitHub

1. Push this repository to GitHub at `https://github.com/nddipiazza/getemgigs`.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..."** &rarr; **"Project"**.
3. Import the `getemgigs` repository.
4. Select **Next.js** framework preset (auto-detected).
5. Click **Deploy**.

## 3. Configuring Custom Domain (getemgigs.com)

1. In the Vercel Project Dashboard, navigate to **Settings** &rarr; **Domains**.
2. Add `getemgigs.com` and `www.getemgigs.com`.
3. In your DNS registrar (Namecheap, GoDaddy, Cloudflare, Google Domains, etc.), configure:
   - **Apex / Root Domain (`@`)**:
     - Type: `A`
     - Name: `@`
     - Value: `76.76.21.21`
   - **Subdomain (`www`)**:
     - Type: `CNAME`
     - Name: `www`
     - Value: `cname.vercel-dns.com`
4. Vercel will automatically provision free SSL certificates (Let's Encrypt) within minutes.

## 4. Zero-Cost Storage Options

The application works out-of-the-box with an embedded zero-configuration storage engine (requiring no external services). For persistent cloud data on Vercel's free tier:

- **MongoDB Atlas (Free M0 Cluster)**:
  Set `MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/getemgigs` in Vercel Environment Variables.
- **Vercel Postgres (Free)**:
  Connect Vercel Postgres in the Storage tab, which auto-injects `POSTGRES_URL`.
- **Vercel KV (Free Redis)**:
  Connect Vercel KV in the Storage tab, which auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
