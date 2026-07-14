# DartPlayr

DartPlayr is a Django-backed darts scoring app for match nights. It supports Cricket, 01 games, undo/redo, checkout suggestions, global user accounts, player profiles, lifetime stats, match history, and Django admin.

## Run Locally

Create a virtual environment, install dependencies, and run Django:

```powershell
cd C:\Users\kuris\Documents\Dart-Scoreboard
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python manage.py migrate
.\venv\Scripts\python manage.py runserver 8002
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

The app runs as Django behind Gunicorn/Nginx. Static files are collected from `static_src/`.

## VPS Setup

1. Create a GitHub repository for this project.
2. Push this repo to GitHub.
3. SSH into the VPS and run `scripts/install_vps_static_site.sh` with the GitHub repo URL and optional admin password.
4. Enable or refresh TLS with Certbot after DNS resolves to the VPS.

Example:

```bash
sudo bash scripts/install_vps_static_site.sh https://github.com/YOUR_USER/DartPlayr.git "change-this-admin-password"
sudo certbot --nginx -d dartplayr.skulkabout.com
```

Admin URL:

```text
https://dartplayr.skulkabout.com/admin/
```

## Updating Production

After the first VPS setup, deploy future updates from the VPS with:

```bash
sudo bash /var/www/dartplayr/scripts/install_vps_static_site.sh https://github.com/Kurisk/dartplayr.git
```

If file ownership is locked down by the web server, run the pull with the same user that owns `/var/www/dartplayr`.

## Admin Password Reset

Reset the admin password on the VPS with:

```bash
sudo sed -i 's/^DARTPLAYR_ADMIN_PASSWORD=.*/DARTPLAYR_ADMIN_PASSWORD=new-password-here/' /etc/dartplayr.env
sudo bash -c 'set -a; . /etc/dartplayr.env; set +a; /var/www/dartplayr/venv/bin/python /var/www/dartplayr/manage.py ensure_admin'
```
