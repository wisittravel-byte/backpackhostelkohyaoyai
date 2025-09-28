# Backpack Hostel Kohyaoyai — Demo

This is a minimal Spring Boot demo that serves a static bilingual home page.

How to run (Windows PowerShell):

```powershell
mvn -v
mvn spring-boot:run
# then open http://localhost:8080
```

Notes:
- The `index.html` is placed in `src/main/resources/static` so Spring Boot will serve it automatically.
- This is a front-end prototype; booking actions use localStorage for demo purposes.

## Deploy to Internet (Static hosting)

Pick one of the options below:

### Option A: GitHub Pages (no server needed)
1. Push this repository to GitHub.
2. Ensure your default branch is `main` or `master`.
3. In GitHub, go to Settings → Pages → Build and deployment → Source: GitHub Actions.
4. The provided workflow `.github/workflows/deploy-pages.yml` uploads `src/main/resources/static`.
5. After the Action runs, your site will be available at `https://<your-user>.github.io/<repo>/`.

### Option B: Netlify (drag & drop or connect repo)
1. Create a Netlify account and connect this repo, or drag the folder `src/main/resources/static` into Netlify.
2. Publish directory: `src/main/resources/static`
3. No build command required. The included `netlify.toml` works out-of-the-box.

### Option C: Vercel (connect repo)
1. Create a Vercel account and import this repo.
2. It will detect `vercel.json` and serve everything from `src/main/resources/static`.
3. Deploy and use the provided `.vercel.app` URL.

### Option D: Temporary sharing (tunnel)
Use ngrok or Cloudflare Tunnel to expose a local port (`8080`) and share a public URL temporarily.