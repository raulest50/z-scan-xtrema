# Base de rootfs para EDF 26.06.1 / Yocto Scarthgap.
# Registro y compilación: custom-OS/README.md.
SUMMARY = "Z-Scan Xtrema: sistema de solo lectura para Kria KV260"
DESCRIPTION = "SD con arranque U-Boot/extlinux, raíz SquashFS, aplicación web y estado temporal en RAM. Sin persistencia de mediciones."
LICENSE = "MIT"

# Debe definirse antes de heredar image mediante core-image.
# WIC incluye kernel y DTB. No modifica el firmware QSPI existente.
IMAGE_FSTYPES = "squashfs wic.xz wic.bmap"
EXTRA_IMAGECMD:squashfs:append = " -processors 1"
IMAGE_LINGUAS = ""
IMAGE_INSTALL = "packagegroup-core-boot volatile-binds util-linux iproute2 zscan-system kernel-modules"
IMAGE_FEATURES += "read-only-rootfs"
IMAGE_FEATURES:remove = "debug-tweaks empty-root-password allow-empty-password allow-root-login package-management read-only-rootfs-delayed-postinst"

inherit core-image features_check extrausers deploy

REQUIRED_DISTRO_FEATURES = "systemd"
COMPATIBLE_MACHINE = "^amd-cortexa53-mali-common$"

# Acceso inicial por consola serie. El hash se suministra fuera del repositorio.
# Sustituye el usuario EDF con contraseña vacía y cambio obligatorio al arrancar:
# /etc/shadow ya será de solo lectura. SSH permite solo zscan-admin.
ZSCAN_ROOT_PASSWORD_HASH ?= ""
EXTRA_USERS_PARAMS = "usermod -p '${ZSCAN_ROOT_PASSWORD_HASH}' root; useradd -M -U -d /run/zscan-admin -s /bin/sh -p '${ZSCAN_ROOT_PASSWORD_HASH}' zscan-admin;"
EXTRA_USERS_SUDOERS = ""
SERVICES_TO_ENABLE += "systemd-networkd.service systemd-resolved.service dnsmasq.service nginx.service"
SERVICES_TO_DISABLE += "systemd-repart.service systemd-growfs-root.service sshd.service sshd.socket sshdgenkeys.service"

ZSCAN_INPUTS ?= "${TOPDIR}/../inputs"
ZSCAN_ROOT_PARTUUID = "92040d6e-55cd-45b1-a76b-65f8a43e8237"
WKS_FILE = "xtreme-zscan-poff-resistant.wks.in"
WKS_FILE_DEPENDS += "dosfstools-native mtools-native squashfs-tools-native"
# Nombre propio: evita que el BSP común intente generar un virtual/dtb genérico.
IMAGE_BOOT_FILES = "Image zscan-kv260.dtb;kv260.dtb zscan-extlinux.conf;extlinux/extlinux.conf"
WICVARS:append = " ZSCAN_ROOT_PARTUUID"

do_deploy[depends] = "virtual/kernel:do_deploy"
do_deploy[file-checksums] = "${ZSCAN_INPUTS}/kv260.dtb:True"
do_deploy() {
    install -d ${DEPLOYDIR}
    install -m 0644 ${ZSCAN_INPUTS}/kv260.dtb ${DEPLOYDIR}/zscan-kv260.dtb
    cat > ${DEPLOYDIR}/zscan-extlinux.conf <<EOF
DEFAULT zscan
TIMEOUT 30
LABEL zscan
    LINUX /Image
    FDT /kv260.dtb
    APPEND console=ttyPS1,115200 earlycon root=PARTUUID=${ZSCAN_ROOT_PARTUUID} rootfstype=squashfs rootwait ro
EOF
}
addtask deploy after do_rootfs before do_image_wic

python zscan_check_configuration() {
    import re

    if d.getVar("DISTRO") != "amd-edf":
        bb.fatal("Esta receta requiere DISTRO = 'amd-edf'.")

    # Formato SHA-512 crypt, con cada '$' escapado para extrausers.
    # No imprimir la credencial en los diagnósticos.
    password_hash = d.getVar("ZSCAN_ROOT_PASSWORD_HASH") or ""
    pattern = r"\\\$6\\\$(?:rounds=[0-9]+\\\$)?[./A-Za-z0-9]{1,16}\\\$[./A-Za-z0-9]{86}"
    if not re.fullmatch(pattern, password_hash):
        bb.fatal("Definir ZSCAN_ROOT_PASSWORD_HASH en la configuración privada del build; ver custom-OS/README.md.")
}
do_rootfs[prefuncs] += "zscan_check_configuration"

ROOTFS_POSTPROCESS_COMMAND:append = " zscan_configure_volatile_state"

zscan_configure_volatile_state() {
    echo zscan > "${IMAGE_ROOTFS}${sysconfdir}/hostname"
    # No montar automáticamente particiones persistentes ni activar swap.
    # /var/lib, /var/cache, /var/spool y /srv los atiende volatile-binds.
    cat > "${IMAGE_ROOTFS}${sysconfdir}/fstab" <<'EOF'
/dev/root / squashfs ro 0 0
proc /proc proc defaults 0 0
devpts /dev/pts devpts mode=0620,ptmxmode=0666,gid=5 0 0
tmpfs /run tmpfs mode=0755,nodev,nosuid,size=64M 0 0
tmpfs /tmp tmpfs mode=1777,nodev,nosuid,size=64M 0 0
tmpfs /var/volatile tmpfs mode=0755,nodev,nosuid,size=128M 0 0
EOF

    install -d "${IMAGE_ROOTFS}${sysconfdir}/systemd/journald.conf.d"
    cat > "${IMAGE_ROOTFS}${sysconfdir}/systemd/journald.conf.d/10-zscan-volatile.conf" <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=16M
RuntimeKeepFree=16M
RuntimeMaxFileSize=4M
ForwardToSyslog=no
EOF

    install -d "${IMAGE_ROOTFS}${sysconfdir}/systemd/coredump.conf.d"
    cat > "${IMAGE_ROOTFS}${sysconfdir}/systemd/coredump.conf.d/10-zscan-no-dumps.conf" <<'EOF'
[Coredump]
Storage=none
ProcessSizeMax=0
EOF

    # Evitar que GPT habilite swap u otros montajes ajenos a este fstab.
    # La integración de arranque deberá indicar root= explícitamente.
    install -d "${IMAGE_ROOTFS}${sysconfdir}/systemd/system-generators"
    ln -sfn /dev/null "${IMAGE_ROOTFS}${sysconfdir}/systemd/system-generators/systemd-gpt-auto-generator"
}
