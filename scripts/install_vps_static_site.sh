#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-}"
SITE_DIR="/var/www/dartplayr"
DOMAIN="dartplayr.skulkabout.com"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

if [ -z "${REPO_URL}" ]; then
  echo "Usage: sudo bash scripts/install_vps_static_site.sh <github-repo-url>"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo."
  exit 1
fi

apt-get update
apt-get install -y git nginx certbot python3-certbot-nginx

if [ -d "${SITE_DIR}/.git" ]; then
  git -C "${SITE_DIR}" pull --ff-only
else
  if [ -e "${SITE_DIR}" ] && [ "$(find "${SITE_DIR}" -mindepth 1 -maxdepth 1 | wc -l)" -gt 0 ]; then
    echo "${SITE_DIR} exists and is not an existing Git checkout. Move it aside before installing."
    exit 1
  fi
  git clone "${REPO_URL}" "${SITE_DIR}"
fi

chown -R www-data:www-data "${SITE_DIR}"

cp "${SITE_DIR}/deploy/${DOMAIN}.nginx.conf" "${NGINX_AVAILABLE}"
ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

nginx -t
systemctl reload nginx

echo "DartPlayr is installed for http://${DOMAIN}"
echo "Next: sudo certbot --nginx -d ${DOMAIN}"
