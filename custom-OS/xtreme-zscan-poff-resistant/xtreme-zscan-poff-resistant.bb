# Base de rootfs para EDF 26.06.1 / Yocto Scarthgap.
# Registro y compilación: custom-OS/README.md.
SUMMARY = "Z-Scan Xtrema: base de solo lectura para Kria KV260"
DESCRIPTION = "Rootfs SquashFS con estado temporal en RAM. Primera etapa; no incluye disco de arranque ni persistencia de mediciones."
LICENSE = "MIT"

# Debe definirse antes de heredar image mediante core-image.
# Este artefacto es un rootfs, no una imagen de SD ni de firmware QSPI.
IMAGE_FSTYPES = "squashfs"
IMAGE_LINGUAS = ""
IMAGE_INSTALL = "packagegroup-core-boot volatile-binds util-linux iproute2"
IMAGE_FEATURES += "read-only-rootfs"
IMAGE_FEATURES:remove = "debug-tweaks empty-root-password allow-empty-password allow-root-login package-management read-only-rootfs-delayed-postinst"

inherit core-image features_check extrausers

REQUIRED_DISTRO_FEATURES = "systemd"
COMPATIBLE_MACHINE = "^amd-cortexa53-mali-common$"

# Acceso inicial por consola serie. El hash se suministra fuera del repositorio.
# Sustituye el usuario EDF con contraseña vacía y cambio obligatorio al arrancar:
# /etc/shadow ya será de solo lectura. No se instala un servidor SSH todavía.
ZSCAN_ROOT_PASSWORD_HASH ?= ""
EXTRA_USERS_PARAMS = "usermod -p '${ZSCAN_ROOT_PASSWORD_HASH}' root;"
EXTRA_USERS_SUDOERS = ""

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
