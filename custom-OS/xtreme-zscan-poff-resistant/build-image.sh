#!/usr/bin/env bash
# EDF 26.06.1. No instala paquetes en el host ni escribe dispositivos de bloque.
set -euo pipefail
os_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ ${1:-} == _container ]]; then
    repo_dir=/src
else
    repo_dir=$(git -C "$os_dir" rev-parse --show-toplevel)
fi
workspace=${ZSCAN_WORKSPACE:-"$os_dir/yocto-workspace"}
container_image=xilinx/edf@sha256:4a434d1e9117a63bfa200771ecfa4566dcc8e10918b9afd92b6853d83dd95057
manifest_tag=amd-edf-rel-v26.06.1
target=xtreme-zscan-poff-resistant

fail() { printf '%s\n' "$*" >&2; exit 1; }

container_run() {
    local command snapshot
    # Bash lee el archivo por bloques. Una copia por ejecución evita que una
    # edición posterior del script cambie las instrucciones de un build en curso.
    snapshot=$(mktemp "$workspace/inputs/build-image.XXXXXXXX.sh")
    cp "$os_dir/build-image.sh" "$snapshot"
    printf -v command '%q ' docker run --rm --name zscan-edf-build \
        --mount "type=bind,src=$repo_dir,dst=/src,readonly" \
        --mount "type=bind,src=$workspace,dst=/work" \
        --workdir /work --env ZSCAN_WORKSPACE=/work \
        "$container_image" bash \
        "/work/inputs/${snapshot##*/}" _container "$@"
    # El grupo puede haberse añadido después de iniciar la sesión de Codex.
    if id -nG | tr ' ' '\n' | grep -qx docker; then
        bash -c "$command"
    else
        sg docker -c "$command"
    fi
}

prepare() {
    local tool revision stage payload password_hash
    for tool in git npm node uv openssl ssh-keygen tar python3; do
        command -v "$tool" >/dev/null || fail "Falta herramienta del host: $tool"
    done
    git -C "$repo_dir" diff --quiet HEAD -- App-backend frontend assets ||
        fail 'Guardar los cambios de la aplicación en un commit antes de empaquetar.'
    test -z "$(git -C "$repo_dir" ls-files --others --exclude-standard -- App-backend frontend assets)" ||
        fail 'Hay fuentes de la aplicación sin seguimiento; revisar antes de empaquetar.'
    revision=$(git -C "$repo_dir" rev-parse HEAD)
    mkdir -p "$workspace/inputs" "$workspace/downloads/uv" "$workspace/sstate-cache"
    workspace=$(cd "$workspace" && pwd)
    chmod 0700 "$workspace"
    stage="$workspace/inputs/app-${revision:0:12}"
    mkdir -p "$stage"
    git -C "$repo_dir" archive "$revision" App-backend frontend assets | tar -xf - -C "$stage"
    (cd "$stage/frontend" && npm ci --no-audit --no-fund && npm run build)
    uv export --project "$stage/App-backend" --frozen --no-dev --no-emit-project \
        --no-header --no-annotate --format requirements.txt \
        --output-file "$workspace/inputs/requirements-aarch64.txt" \
        --cache-dir "$workspace/downloads/uv" --offline --quiet
    payload=$(mktemp -d "$workspace/inputs/payload.XXXXXXXX")
    mkdir -p "$payload/zscan-app/App-backend" "$payload/zscan-app/frontend"
    # Copiar solo fuentes del backend; nunca .env, venv, cachés ni datos locales.
    git -C "$repo_dir" archive "$revision" App-backend | tar -xf - -C "$payload/zscan-app"
    cp -R "$stage/frontend/dist" "$payload/zscan-app/frontend/"
    UV_HTTP_TIMEOUT=30 UV_HTTP_RETRIES=1 uv pip install \
        --requirements "$workspace/inputs/requirements-aarch64.txt" \
        --target "$payload/zscan-app/python" --python-version 3.12 \
        --python-platform aarch64-manylinux_2_17 --only-binary :all: \
        --require-hashes --no-deps --link-mode copy \
        --cache-dir "$workspace/downloads/uv" --no-config --no-progress
    # Los entrypoints generados por uv tienen shebang del host. El servicio usa -m.
    python3 - "$payload/zscan-app/python" <<'PY'
import pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
shutil.rmtree(root / 'bin', ignore_errors=True)
for cache in root.rglob('__pycache__'):
    shutil.rmtree(cache)
PY
    printf '%s\n' "$revision" > "$payload/zscan-app/APP_REVISION"
    cp "$workspace/inputs/requirements-aarch64.txt" "$payload/zscan-app/"
    tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
        -cJf "$workspace/inputs/zscan-app.tar.xz" -C "$payload" zscan-app
    # Salidas de empaquetado temporales, nunca fuentes del repositorio.
    python3 - "$payload" <<'PY'
import shutil, sys
shutil.rmtree(sys.argv[1])
PY
    (
        umask 077
        mkdir -p "$workspace/inputs/identity"
        if [[ ! -f "$workspace/inputs/identity/admin-password" ]]; then
            openssl rand -hex 16 > "$workspace/inputs/identity/admin-password"
        fi
        if [[ ! -f "$workspace/inputs/identity/root-password.hash" ]]; then
            openssl passwd -6 -stdin < "$workspace/inputs/identity/admin-password" \
                > "$workspace/inputs/identity/root-password.hash"
        fi
        if [[ ! -f "$workspace/inputs/identity/ssh_host_ed25519_key" ]]; then
            ssh-keygen -q -t ed25519 -N '' -C zscan-kv260 \
                -f "$workspace/inputs/identity/ssh_host_ed25519_key"
        fi
    )
    printf 'Aplicación empaquetada: %s\nCredenciales privadas: %s/inputs/identity/\n' "$revision" "$workspace"
}

configure_container() {
    cd /work
    if [[ ! -f edf-init-build-env ]]; then
        repo init -u https://github.com/Xilinx/yocto-manifests.git \
            -b "refs/tags/$manifest_tag" -m default-edf.xml --depth=1 --no-clone-bundle
        repo sync -c -j 2 --no-tags --fail-fast
    fi
    test "$(git -C .repo/manifests rev-parse HEAD)" = \
        "$(git -C .repo/manifests rev-parse "refs/tags/$manifest_tag^{commit}")" ||
        fail 'El workspace no corresponde al manifiesto EDF fijado.'
    /work/.repo/repo/repo manifest -r -o /work/inputs/edf-manifest.xml
    # Los scripts oficiales esperan variables opcionales sin definir.
    set +u
    source /work/edf-init-build-env /work/build
    set -u
    if ! grep -Fq '/src/custom-OS/xtreme-zscan-poff-resistant/meta-zscan' conf/bblayers.conf; then
        printf '\nBBLAYERS += "/src/custom-OS/xtreme-zscan-poff-resistant/meta-zscan"\n' >> conf/bblayers.conf
    fi
    if ! grep -Fq 'require conf/zscan-generated.conf' conf/local.conf; then
        printf '\nrequire conf/zscan-generated.conf\n' >> conf/local.conf
    fi
    cat > conf/zscan-generated.conf <<'EOF'
DISTRO = "amd-edf"
MACHINE ??= "amd-cortexa53-mali-common"
DL_DIR = "/work/downloads"
SSTATE_DIR = "/work/sstate-cache"
ZSCAN_INPUTS = "/work/inputs"
# device-tree solo necesita el dominio Linux; no construir FSBL/PMU/QSPI.
BBMULTICONFIG:remove = "k26-smk-kv-sdt-cortexa53-fsbl k26-smk-kv-sdt-microblaze-pmu"
BB_NUMBER_THREADS = "1"
BB_NUMBER_PARSE_THREADS = "1"
PARALLEL_MAKE = "-j1"
XZ_THREADS = "1"
ZSTD_THREADS = "1"
BB_DISKMON_DIRS = "STOPTASKS,${TMPDIR},20G,100K STOPTASKS,${DL_DIR},20G,100K HALT,${TMPDIR},5G,1K"
EXTRA_IMAGE_FEATURES = ""
LICENSE_FLAGS_ACCEPTED += "commercial_ffmpeg"
PACKAGECONFIG:pn-ffmpeg = "avdevice avcodec avformat avfilter swresample swscale zlib v4l2"
PACKAGECONFIG:pn-openssh = "systemd-sshd-service-mode"
SYSTEMD_AUTO_ENABLE:pn-openssh = "disable"
PACKAGECONFIG:append:pn-systemd = " networkd resolved pam"
# Guardar la revisión resuelta de todos los paquetes en los artefactos de build.
INHERIT += "buildhistory"
BUILDHISTORY_COMMIT = "0"
EOF
    python3 - <<'PY'
from pathlib import Path
secret = Path('/work/inputs/identity/root-password.hash').read_text().strip()
with Path('conf/zscan-generated.conf').open('a') as output:
    output.write('ZSCAN_ROOT_PASSWORD_HASH = "' + secret.replace('$', r'\$') + '"\n')
Path('conf/zscan-generated.conf').chmod(0o600)
PY
    # Detectar errores de sintaxis propios antes de analizar todo el catálogo EDF.
    PYTHONPATH=/work/sources/poky/bitbake/lib python3 - <<'PY'
from pathlib import Path
from bb.parse.parse_py import BBHandler
root = Path('/src/custom-OS/xtreme-zscan-poff-resistant')
files = [root / 'xtreme-zscan-poff-resistant.bb']
for suffix in ('*.bb', '*.bbappend'):
    files.extend((root / 'meta-zscan').rglob(suffix))
for recipe in files:
    BBHandler.get_statements(str(recipe), str(recipe.resolve()), recipe.name)
print('Sintaxis de las recetas Z-Scan: OK')
PY
}

if [[ ${1:-} == _container ]]; then
    action=${2:-parse}
    configure_container
    case "$action" in
        configure) ;;
        parse) bitbake -p ;;
        build|resume)
            # EDF separa el Linux común de la descripción de hardware KV260.
            # No construir/grabar firmware QSPI ni cargar FPGA para esta imagen.
            if [[ $action == build ]]; then
                MACHINE=k26-smk-kv-sdt bitbake device-tree
                install -m 0644 tmp/deploy/images/k26-smk-kv-sdt/system.dtb /work/inputs/kv260.dtb
            else
                test -s /work/inputs/kv260.dtb || fail 'Falta el DTB: ejecutar build antes de resume.'
            fi
            bitbake "$target"
            mkdir -p /work/artifacts
            cp -L tmp/deploy/images/amd-cortexa53-mali-common/"$target"-amd-cortexa53-mali-common.rootfs.wic.* /work/artifacts/
            cp -L tmp/deploy/images/amd-cortexa53-mali-common/"$target"-amd-cortexa53-mali-common.rootfs.manifest /work/artifacts/
            cp /work/inputs/edf-manifest.xml /work/artifacts/
            cp /work/inputs/requirements-aarch64.txt /work/artifacts/
            tar -xOf /work/inputs/zscan-app.tar.xz zscan-app/APP_REVISION > /work/artifacts/APP_REVISION
            (cd /work/artifacts && sha256sum ./*.wic.* > SHA256SUMS)
            ;;
        *) fail "Acción interna desconocida: $action" ;;
    esac
    exit
fi

case ${1:-build} in
    prepare) prepare ;;
    configure|parse|build|resume)
        prepare
        container_run "${1:-build}"
        ;;
    --help|-h)
        printf '%s\n' 'Uso: bash build-image.sh {prepare|configure|parse|build|resume}' \
            'ZSCAN_WORKSPACE: ruta opcional para fuentes, cachés, credenciales y resultados.' \
            'build crea la imagen; resume reutiliza el DTB de un build anterior.' \
            'Nunca graba la SD. Identidad generada para una sola Kria.'
        ;;
    *) fail 'Acción desconocida; consultar --help.' ;;
esac
