#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-}"
ADMIN_PASSWORD="${2:-}"
SITE_DIR="/var/www/dartplayr"
DOMAIN="dartplayr.skulkabout.com"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
ENV_FILE="/etc/dartplayr.env"
SERVICE_FILE="/etc/systemd/system/dartplayr.service"

if [ -z "${REPO_URL}" ]; then
  echo "Usage: sudo bash scripts/install_vps_static_site.sh <github-repo-url> [admin-password]"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo."
  exit 1
fi

apt-get update
apt-get install -y git nginx certbot python3-certbot-nginx python3-venv python3-pip

if [ -d "${SITE_DIR}/.git" ]; then
  git -C "${SITE_DIR}" pull --ff-only
else
  if [ -e "${SITE_DIR}" ] && [ "$(find "${SITE_DIR}" -mindepth 1 -maxdepth 1 | wc -l)" -gt 0 ]; then
    echo "${SITE_DIR} exists and is not an existing Git checkout. Move it aside before installing."
    exit 1
  fi
  git clone "${REPO_URL}" "${SITE_DIR}"
fi

git config --global --add safe.directory "${SITE_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  SECRET_KEY="$(python3 - <<'PY'
import secrets
alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*(-_=+)"
print("".join(secrets.choice(alphabet) for _ in range(64)))
PY
)"
  cat > "${ENV_FILE}" <<EOF
DJANGO_SECRET_KEY=${SECRET_KEY}
DJANGO_ALLOWED_HOSTS=${DOMAIN},127.0.0.1,localhost
DJANGO_CSRF_TRUSTED_ORIGINS=https://${DOMAIN}
DJANGO_DEBUG=0
DARTPLAYR_ADMIN_USERNAME=admin
EOF
fi

if [ -n "${ADMIN_PASSWORD}" ]; then
  if grep -q '^DARTPLAYR_ADMIN_PASSWORD=' "${ENV_FILE}"; then
    sed -i "s/^DARTPLAYR_ADMIN_PASSWORD=.*/DARTPLAYR_ADMIN_PASSWORD=${ADMIN_PASSWORD}/" "${ENV_FILE}"
  else
    echo "DARTPLAYR_ADMIN_PASSWORD=${ADMIN_PASSWORD}" >> "${ENV_FILE}"
  fi
fi

python3 -m venv "${SITE_DIR}/venv"
"${SITE_DIR}/venv/bin/pip" install --upgrade pip
"${SITE_DIR}/venv/bin/pip" install -r "${SITE_DIR}/requirements.txt"

set -a
. "${ENV_FILE}"
set +a
"${SITE_DIR}/venv/bin/python" "${SITE_DIR}/manage.py" migrate --noinput
"${SITE_DIR}/venv/bin/python" "${SITE_DIR}/manage.py" collectstatic --noinput
"${SITE_DIR}/venv/bin/python" "${SITE_DIR}/manage.py" ensure_admin

chown -R www-data:www-data "${SITE_DIR}"
chown root:www-data "${ENV_FILE}"
chmod 640 "${ENV_FILE}"

cp "${SITE_DIR}/deploy/${DOMAIN}.nginx.conf" "${NGINX_AVAILABLE}"
ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
cp "${SITE_DIR}/deploy/dartplayr.service" "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable dartplayr
systemctl restart dartplayr

nginx -t
systemctl reload nginx

echo "DartPlayr Django app is installed for http://${DOMAIN}"
echo "Admin URL: https://${DOMAIN}/admin/"
