# Hosting on a VPS

The app is a static site. Excel parsing, photo editing, rendering and the
ZIP/PDF export all run in the visitor's browser, and no student data reaches
the server. The VPS only needs nginx serving about 4 MB of files: one worker
process, a few MB of RAM, and next to no CPU. Build on your PC; `next build`
needs 1-2 GB of RAM and must not run on the VPS.

| File | Goes to |
|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` (low-memory settings for one user) |
| `id-card.nginx` | `/etc/nginx/sites-available/id-card` |
| `precompress.mjs` | runs on the PC: writes `.gz` files that nginx serves as they are |
| `deploy.ps1` | runs on the PC: build → gzip → upload → swap into `/var/www/id-card` |

## One-time VPS setup (Ubuntu/Debian)

From the project folder on the PC:

```powershell
scp deploy/nginx.conf deploy/id-card.nginx root@<vps-ip>:/tmp/
```

On the VPS:

```bash
sudo apt update && sudo apt install -y nginx
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig
sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf
sudo mv /tmp/id-card.nginx /etc/nginx/sites-available/id-card
sudo ln -sf /etc/nginx/sites-available/id-card /etc/nginx/sites-enabled/id-card
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/id-card
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
sudo ufw allow 80/tcp     # only if ufw is enabled
```

## Every deploy (from the PC)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Server root@<vps-ip>
```

Add `-SkipBuild` to re-upload the current `out/` without rebuilding. A user
with sudo instead of root works too; the script asks for the sudo password.

## Check it

```bash
curl -sI http://<vps-ip>/review                   # 200
curl -sI -H 'Accept-Encoding: gzip' http://<vps-ip>/ | grep -i content-encoding   # gzip
ps -o rss=,cmd= -C nginx                          # RSS in KB: a few MB
```

## Plain http on an IP

Everything works over http. The browser's built-in eyedropper needs https, so
over http the editor's eyedropper button switches to its own picker (click the
photo). To get https later, point a domain at the VPS
and run `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`.
