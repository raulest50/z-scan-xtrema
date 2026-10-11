SUMMARY = "Aplicación Z-Scan y dependencias ARM64 fijadas por uv.lock"
LICENSE = "CLOSED"
inherit python3-dir

ZSCAN_INPUTS ?= "${TOPDIR}/../inputs"
FILESEXTRAPATHS:prepend := "${ZSCAN_INPUTS}:"
SRC_URI = "file://zscan-app.tar.xz"
S = "${WORKDIR}/zscan-app"
COMPATIBLE_HOST = "aarch64.*-linux"
PACKAGE_ARCH = "${MACHINE_ARCH}"

# Los wheels se verifican contra uv.lock al preparar el paquete. Se conservan
# sus dist-info y licencias; no se ejecuta pip ni npm en la placa.
RDEPENDS:${PN} = "python3-modules libgcc libstdc++ ffmpeg ${PN}-watchfiles-extension (= ${EXTENDPKGV})"
INHIBIT_PACKAGE_STRIP = "1"
INHIBIT_PACKAGE_DEBUG_SPLIT = "1"
INSANE_SKIP:${PN} += "already-stripped"

# El wheel fijado de watchfiles usa DT_HASH (SysV), válido para glibc,
# pero no GNU_HASH. Aislar únicamente ese ELF precompilado para exceptuar
# ldflags; los otros binarios conservan la comprobación normal de Yocto.
PACKAGES =+ "${PN}-watchfiles-extension"
FILES:${PN}-watchfiles-extension = "${libdir}/zscan/python/watchfiles/_rust_notify.abi3.so"
RDEPENDS:${PN}-watchfiles-extension = "python3-core"
INSANE_SKIP:${PN}-watchfiles-extension = "already-stripped ldflags"

do_configure[noexec] = "1"
do_compile[noexec] = "1"
do_install() {
    test "${PYTHON_BASEVERSION}" = "3.12" || bbfatal "Regenerar wheels para la versión de Python de EDF"
    install -d ${D}${libdir}/zscan
    cp -R --no-preserve=ownership ${S}/. ${D}${libdir}/zscan/
    find ${D}${libdir}/zscan -type d -exec chmod 0755 {} +
    find ${D}${libdir}/zscan -type f -exec chmod 0644 {} +
}
FILES:${PN} = "${libdir}/zscan"
