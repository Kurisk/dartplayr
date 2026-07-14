# DartPlayr

DartPlayr is a static darts scoring app for match nights. It supports Cricket, 01 games, undo/redo, checkout suggestions, browser-local player accounts, per-user player profiles, lifetime stats, and match history.

## Run Locally

Open `index.html` directly in a browser, or serve the folder locally:

```powershell
cd C:\Users\kuris\Documents\Dart-Scoreboard
python -m http.server 8002
```

Then visit `http://127.0.0.1:8002`.

## Deployment Target

Production host:

```text
dartplayr.skulkabout.com
```

Recommended VPS path:

```text
/var/www/dartplayr
```

This app is static, so deployment only needs `index.html`, `style.css`, and `app.js`.

## VPS Setup

1. Create a GitHub repository for this project.
2. Push this repo to GitHub.
3. SSH into the VPS and run `scripts/install_vps_static_site.sh` with the GitHub repo URL.
4. Enable TLS with Certbot after DNS resolves to the VPS.

Example:

```bash
sudo bash scripts/install_vps_static_site.sh https://github.com/YOUR_USER/DartPlayr.git
sudo certbot --nginx -d dartplayr.skulkabout.com
```

## Updating Production

After the first VPS setup, deploy future updates from the VPS with:

```bash
cd /var/www/dartplayr
sudo git pull --ff-only
```

If file ownership is locked down by the web server, run the pull with the same user that owns `/var/www/dartplayr`.

## Account Storage Note

The current login feature is browser-local. It separates users and stats on the same browser/device through `localStorage`, but it is not secure cloud authentication. Cross-device login, password reset, synced stats, leaderboards, and admin controls would require a backend database and hosted auth.
