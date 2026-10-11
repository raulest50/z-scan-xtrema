SUMMARY = "Servicios y red de laboratorio para Z-Scan KV260"
LICENSE = "CLOSED"
inherit systemd useradd

ZSCAN_INPUTS ?= "${TOPDIR}/../inputs"
FILESEXTRAPATHS:prepend := "${ZSCAN_INPUTS}/identity:"
SRC_URI = "file://ssh_host_ed25519_key file://ssh_host_ed25519_key.pub"
PACKAGE_ARCH = "${MACHINE_ARCH}"
RDEPENDS:${PN} = "zscan-app nginx dnsmasq openssh-sshd openssh-sftp-server systemd"
USERADD_PACKAGES = "${PN}"
GROUPADD_PARAM:${PN} = "--system zscan"
USERADD_PARAM:${PN} = "--system --gid zscan --groups video --no-create-home --home /run/zscan --shell /sbin/nologin zscan"
SYSTEMD_SERVICE:${PN} = "zscan.service zscan-sshd.service"
SYSTEMD_AUTO_ENABLE:${PN} = "enable"

do_install() {
    install -d ${D}${sysconfdir}/zscan ${D}${systemd_system_unitdir}
    install -d ${D}${sysconfdir}/systemd/network ${D}${sysconfdir}/dnsmasq.d
    install -d ${D}${sysconfdir}/systemd/system/nginx.service.d
    install -d ${D}${libdir}/tmpfiles.d
    install -m 0600 ${WORKDIR}/ssh_host_ed25519_key ${D}${sysconfdir}/zscan/
    install -m 0644 ${WORKDIR}/ssh_host_ed25519_key.pub ${D}${sysconfdir}/zscan/

    cat > ${D}${systemd_system_unitdir}/zscan.service <<'EOF'
[Unit]
Description=Z-Scan Xtrema API y cámara
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=zscan
Group=zscan
SupplementaryGroups=video
WorkingDirectory=/usr/lib/zscan/App-backend
Environment=PYTHONPATH=/usr/lib/zscan/python
Environment=PYTHONDONTWRITEBYTECODE=1
Environment=PYTHONUNBUFFERED=1
Environment=HOME=/run/zscan
Environment=ZSCAN_STAGE_MODE=newport
Environment=ZSCAN_XPS_HOST=192.168.0.254
Environment=ZSCAN_XPS_PORT=5001
Environment=ZSCAN_ORIGINS=http://zscan.home.arpa,http://192.168.0.101
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 --ws websockets --ws-ping-interval 10 --ws-ping-timeout 20
Restart=on-failure
RestartSec=3
RuntimeDirectory=zscan
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

    cat > ${D}${sysconfdir}/systemd/network/10-zscan-lab.network <<'EOF'
[Match]
MACAddress=00:0a:35:14:b6:23

[Network]
Address=192.168.0.101/24
Gateway=192.168.0.1
DNS=127.0.0.1
DHCP=no
IPv6AcceptRA=no
LinkLocalAddressing=no
EOF

    cat > ${D}${sysconfdir}/dnsmasq.d/zscan.conf <<'EOF'
# Solo DNS. El DHCP sigue siendo responsabilidad del router del laboratorio.
port=53
bind-dynamic
listen-address=127.0.0.1,192.168.0.101
no-resolv
server=192.168.0.1
domain-needed
bogus-priv
local=/home.arpa/
host-record=zscan.home.arpa,192.168.0.101
cache-size=256
EOF

    cat > ${D}${sysconfdir}/zscan/nginx.conf <<'EOF'
user www www-data;
worker_processes 1;
pid /run/nginx/nginx.pid;
error_log stderr warn;
events { worker_connections 256; }
http {
    access_log off;
    client_body_temp_path /run/nginx/client_body;
    proxy_temp_path /run/nginx/proxy;
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }
    server {
        listen 80;
        server_name zscan.home.arpa 192.168.0.101;
        client_max_body_size 1m;
        location / {
            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header X-Forwarded-For $remote_addr;
            proxy_buffering off;
            proxy_read_timeout 90s;
        }
    }
    }
EOF
    cat > ${D}${sysconfdir}/systemd/system/nginx.service.d/zscan.conf <<'EOF'
[Unit]
Wants=zscan.service
After=zscan.service

[Service]
RuntimeDirectory=nginx
ExecStartPre=
ExecStartPre=/usr/sbin/nginx -t -c /etc/zscan/nginx.conf
ExecStart=
ExecStart=/usr/sbin/nginx -c /etc/zscan/nginx.conf
ExecReload=
ExecReload=/usr/sbin/nginx -c /etc/zscan/nginx.conf -s reload
EOF

    cat > ${D}${sysconfdir}/zscan/sshd_config <<'EOF'
Port 22
HostKey /etc/zscan/ssh_host_ed25519_key
PermitRootLogin no
AllowUsers zscan-admin
PasswordAuthentication yes
PermitEmptyPasswords no
KbdInteractiveAuthentication no
UsePAM yes
PrintMotd no
Subsystem sftp internal-sftp
EOF
    cat > ${D}${systemd_system_unitdir}/zscan-sshd.service <<'EOF'
[Unit]
Description=SSH con identidad provisionada para esta Kria
After=network.target

[Service]
Type=simple
RuntimeDirectory=sshd
RuntimeDirectoryMode=0755
ExecStart=/usr/sbin/sshd -D -e -f /etc/zscan/sshd_config
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    cat > ${D}${libdir}/tmpfiles.d/zscan.conf <<'EOF'
d /run/zscan-admin 0700 zscan-admin zscan-admin -
EOF
}
FILES:${PN} = "${sysconfdir} ${systemd_system_unitdir}/zscan*.service ${libdir}/tmpfiles.d/zscan.conf"
