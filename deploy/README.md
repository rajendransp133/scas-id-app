# Hosting on a VPS

Live at **https://id.scascollege.ac.in** (VPS `139.84.210.114`; the `id` A
record is in the Vercel DNS zone of `scascollege.ac.in`).

The app is a static site. Excel parsing, photo editing, rendering and the
ZIP/PDF export all run in the visitor's browser, and no student data reaches
the server. The VPS only needs nginx serving about 4 MB of files: one worker
process, a few MB of RAM, and next to no CPU. Build on your PC; `next build`
needs 1-2 GB of RAM and must not run on the VPS.

| File | Goes to |
|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` (low-memory settings for one user) |
| `id-card.nginx` | `/etc/nginx/sites-available/id-card` (https on 443, http redirects) |
| `precompress.mjs` | runs on the PC: writes `.gz` files that nginx serves as they are |
| `deploy.ps1` | runs on the PC: build → gzip → upload → swap into `/var/www/id-card` |

## One-time VPS setup (Ubuntu/Debian)

From the project folder on the PC:

```powershell
scp deploy/nginx.conf deploy/id-card.nginx root@<vps-ip>:/tmp/
```

On the VPS:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig
sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/id-card
sudo ufw allow 'Nginx Full'   # 80 + 443, only if ufw is enabled

# The certificate must exist before id-card.nginx can load. With the DNS
# record already pointing at this VPS, let certbot issue it (it serves the
# challenge from a temporary config), then install the real site file.
sudo certbot certonly --nginx -d id.scascollege.ac.in \
    --agree-tos --email rajendransp133@gmail.com --non-interactive
sudo mv /tmp/id-card.nginx /etc/nginx/sites-available/id-card
sudo ln -sf /etc/nginx/sites-available/id-card /etc/nginx/sites-enabled/id-card
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
```

`certbot.timer` renews the certificate automatically (check with
`sudo certbot renew --dry-run`); Let's Encrypt emails the address above if a
renewal ever fails. Use `certonly`, not plain `certbot --nginx`, so certbot
doesn't rewrite the site file and it stays identical to the repo copy.

## Every deploy (from the PC)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Server root@<vps-ip>
```

Or, on the VPS itself from the cloned repo: `bash deploy/update.sh`.

Add `-SkipBuild` to re-upload the current `out/` without rebuilding. A user
with sudo instead of root works too; the script asks for the sudo password.

## Check it

```bash
curl -sI https://id.scascollege.ac.in/review           # 200
curl -sI http://id.scascollege.ac.in/ | head -1         # 301 to https
curl -sI -H 'Accept-Encoding: gzip' https://id.scascollege.ac.in/ | grep -i content-encoding   # gzip
ps -o rss=,cmd= -C nginx                          # RSS in KB: a few MB
```

Over https the editor uses the browser's built-in eyedropper. On plain http
(e.g. a test VPS with no domain) it falls back to its own picker: click the photo.
