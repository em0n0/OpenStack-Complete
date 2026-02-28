#!/usr/bin/env bash
# =============================================================================
# lib.sh — Shared Helper Library  (v3)
# Sourced by every script in the project. Never run directly.
#
# Changes from v2:
#   • Distro-agnostic: works on Ubuntu 20.04+, Debian 11/12, Mint, Raspbian,
#     and any Debian-based distro that ships systemd + apt
#   • detect_distro()             — populates DISTRO_ID, DISTRO_VERSION,
#                                   DISTRO_CODENAME, DISTRO_FAMILY
#   • require_debian_based()      — replaces require_ubuntu_2404()
#   • detect_network_interfaces() — returns non-loopback, non-virtual NICs
#   • detect_hardware_type()      — "physical" | "vm" | "container" via
#                                   systemd-detect-virt; warns for bare-metal
#   • get_os_pkg()                — maps logical package names to the right
#                                   apt package for each supported distro
#   • require_internet()          — distro-agnostic (no Ubuntu mirror hardcode)
#   • Fixed password length check — ${#!var} is not valid bash; was silently
#                                   always passing
# =============================================================================

# ─── COLOURS ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ─── DRY-RUN GLOBAL FLAG ──────────────────────────────────────────────────────
# Scripts set DRY_RUN=true before sourcing, or export it beforehand.
# All state-changing operations go through run_cmd() / run_mysql().
: "${DRY_RUN:=false}"

# ─── LOGGING ──────────────────────────────────────────────────────────────────
log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()      { echo -e "${GREEN}  ✔${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
section() { echo -e "\n${CYAN}${BOLD}▸ $1${NC}\n${CYAN}$(printf '─%.0s' {1..55})${NC}"; }

# error() — prints the message and returns/exits depending on context.
# If we're in a subshell (depth > 0) we exit; if sourced at top-level we
# return so we don't kill the calling shell session.
error() {
    echo -e "${RED}  ✖ ERROR:${NC} $*" >&2
    # BASH_SUBSHELL is 0 when we are the top-level shell; >0 inside $() or pipes.
    if (( BASH_SUBSHELL > 0 )); then
        exit 1
    else
        # Signal failure without nuking an interactive session.
        return 1
    fi
}

# ─── DRY-RUN COMMAND WRAPPER ──────────────────────────────────────────────────
# Usage: run_cmd apt-get install -y nova-api
# In dry-run mode, prints what would run. Otherwise runs it.
run_cmd() {
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "  ${DIM}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

# Usage: run_mysql "SQL statement here"
# Passes the root password via a process-substitution options file so
# it never appears in the process list (ps aux).
run_mysql() {
    local sql="$1"
    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "  ${DIM}[DRY-RUN] mysql:${NC} ${sql}"
        return 0
    fi
    mysql --defaults-extra-file=<(printf '[client]\npassword=%s\n' "${DB_PASS}") \
          -u root <<< "${sql}" 2>/dev/null
}

# ─── DISTRO DETECTION ─────────────────────────────────────────────────────────
# Populates globals: DISTRO_ID  DISTRO_VERSION  DISTRO_CODENAME  DISTRO_FAMILY
# DISTRO_FAMILY is "debian" for any Debian-based system, else the raw ID_LIKE.
#
# Supported & tested:
#   Ubuntu 20.04 (focal)   22.04 (jammy)   24.04 (noble)
#   Debian 11 (bullseye)   12 (bookworm)
#   Linux Mint 21/22       Raspbian / Raspberry Pi OS
#   Pop!_OS  elementary OS  Kali Linux  MX Linux
detect_distro() {
    # Source os-release if not already exported
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        source /etc/os-release
        DISTRO_ID="${ID:-unknown}"
        DISTRO_VERSION="${VERSION_ID:-unknown}"
        DISTRO_CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-unknown}}"
        local id_like="${ID_LIKE:-}"
        # Flatten ID_LIKE to a single family label
        if [[ "${DISTRO_ID}" == "debian" || "${id_like}" == *"debian"* || "${id_like}" == *"ubuntu"* ]]; then
            DISTRO_FAMILY="debian"
        else
            DISTRO_FAMILY="${DISTRO_ID}"
        fi
    else
        DISTRO_ID="unknown"; DISTRO_VERSION="unknown"
        DISTRO_CODENAME="unknown"; DISTRO_FAMILY="unknown"
    fi

    export DISTRO_ID DISTRO_VERSION DISTRO_CODENAME DISTRO_FAMILY
}

# ─── HARDWARE / VIRTUALISATION DETECTION ──────────────────────────────────────
# Sets HARDWARE_TYPE to:  "physical"  "vm"  "container"  "unknown"
# Prints a banner with relevant bare-metal warnings when running on real hardware.
detect_hardware_type() {
    if command -v systemd-detect-virt &>/dev/null; then
        local virt; virt=$(systemd-detect-virt 2>/dev/null || echo "none")
        case "${virt}" in
            none)         HARDWARE_TYPE="physical" ;;
            kvm|qemu|vmware|virtualbox|xen|hyperv|parallels|bhyve) HARDWARE_TYPE="vm" ;;
            docker|lxc*|openvz|podman|systemd-nspawn) HARDWARE_TYPE="container" ;;
            *)            HARDWARE_TYPE="vm" ;;   # unknown virt = assume virtualised
        esac
    else
        # Fallback: check for well-known bare-metal indicators
        if [[ -d /sys/class/dmi/id ]] && grep -qi "physical\|to be filled" /sys/class/dmi/id/chassis_type 2>/dev/null; then
            HARDWARE_TYPE="physical"
        else
            HARDWARE_TYPE="unknown"
        fi
    fi
    export HARDWARE_TYPE

    if [[ "${HARDWARE_TYPE}" == "physical" ]]; then
        echo -e "\n${YELLOW}${BOLD}  ── Bare-Metal Deployment Detected ──${NC}"
        echo -e "  ${DIM}A few things to double-check before deploying on real hardware:${NC}"
        echo -e "   ${CYAN}•${NC} CPU virtualisation (VT-x / AMD-V) must be enabled in BIOS/UEFI"
        echo -e "   ${CYAN}•${NC} At least 2 NICs recommended — one for management, one for VM traffic"
        echo -e "   ${CYAN}•${NC} If you have hardware RAID, ensure it is configured before running this"
        echo -e "   ${CYAN}•${NC} IOMMU should be enabled for GPU/SR-IOV passthrough (optional)"
        echo -e "   ${CYAN}•${NC} Make sure NTP is reachable — clock skew breaks token validation"
        echo ""
    fi
}

# ─── NETWORK INTERFACE DISCOVERY ──────────────────────────────────────────────
# detect_network_interfaces — scans /sys/class/net and returns a list of
# physical / hardware NICs, excluding loopback and known virtual prefixes.
#
# Sets global array DETECTED_IFACES and prints a numbered menu.
# Returns the count of interfaces found.
detect_network_interfaces() {
    DETECTED_IFACES=()

    # Prefixes to skip (loopback, docker bridges, virtual, veth pairs, etc.)
    local -a skip_prefixes=( lo docker virbr veth tun tap br- lxc lxd vnet dummy )

    while IFS= read -r iface; do
        local skip=false
        for pfx in "${skip_prefixes[@]}"; do
            [[ "${iface}" == "${pfx}"* ]] && skip=true && break
        done
        ${skip} && continue

        # Only include interfaces that exist as a real net device
        [[ -e "/sys/class/net/${iface}/device" ]] || \
        [[ "$(cat /sys/class/net/${iface}/type 2>/dev/null)" == "1" ]] || continue

        DETECTED_IFACES+=("${iface}")
    done < <(ls /sys/class/net/ 2>/dev/null | sort)

    export DETECTED_IFACES
    return "${#DETECTED_IFACES[@]}"
}

# print_iface_menu — prints a numbered list of discovered interfaces with
# their current IP (if assigned) and link state.
print_iface_menu() {
    local i=1
    for iface in "${DETECTED_IFACES[@]}"; do
        local ip_addr; ip_addr=$(ip -4 addr show "${iface}" 2>/dev/null \
            | awk '/inet / {print $2}' | head -1)
        local state; state=$(cat "/sys/class/net/${iface}/operstate" 2>/dev/null || echo "unknown")
        local state_color="${GREEN}"; [[ "${state}" != "up" ]] && state_color="${YELLOW}"

        printf "   ${BOLD}%d${NC}  %-12s  %b%-8s${NC}  %s\n" \
            "${i}" "${iface}" "${state_color}" "${state}" "${ip_addr:-no IP assigned}"
        (( i++ ))
    done
}

# ─── DISTRO-AWARE PACKAGE NAME MAP ────────────────────────────────────────────
# get_os_pkg LOGICAL_NAME  → echoes the correct apt package name for this distro
#
# Some package names differ across Ubuntu vs Debian versions. Add entries here
# as you encounter them. Scripts should call:
#   apt-get install -y "$(get_os_pkg mariadb-server)"
get_os_pkg() {
    local logical="$1"
    # Most names are the same; override only where they differ
    case "${logical}" in
        mariadb-server)
            # Debian 11 ships mariadb-server; Ubuntu 20.04+ also uses this name
            echo "mariadb-server" ;;
        python3-openstackclient)
            echo "python3-openstackclient" ;;
        openstack-dashboard)
            # Horizon package name is consistent across supported distros
            echo "openstack-dashboard" ;;
        *)
            # Default: return the name unchanged
            echo "${logical}" ;;
    esac
}

# ─── GUARDS ───────────────────────────────────────────────────────────────────
require_root() {
    [[ $EUID -ne 0 ]] && error "This script must be run as root. Use: sudo bash $0"
}

# require_debian_based — replaces the old require_ubuntu_2404().
# Accepts any Debian-family distro that has apt, systemd, and a new enough
# kernel. Prints a compatibility notice for non-Ubuntu systems.
require_debian_based() {
    detect_distro

    if [[ "${DISTRO_FAMILY}" != "debian" ]]; then
        error "This project requires a Debian-based distribution (Ubuntu, Debian, Mint, etc.). Detected: ${DISTRO_ID}"
    fi

    if ! command -v apt-get &>/dev/null; then
        error "apt-get not found. Cannot continue on this system."
    fi

    if ! command -v systemctl &>/dev/null; then
        error "systemd is required but was not found."
    fi

    # Minimum kernel version: 5.4 (first LTS kernel with all needed eBPF / OVS bits)
    local kernel_major kernel_minor
    IFS='.' read -r kernel_major kernel_minor _ <<< "$(uname -r)"
    if (( kernel_major < 5 || (kernel_major == 5 && kernel_minor < 4) )); then
        warn "Kernel $(uname -r) is older than 5.4. Some neutron features may not work."
    fi

    # Warn if running on an unsupported (but still Debian-based) distro
    case "${DISTRO_ID}" in
        ubuntu)
            # Ubuntu 20.04+ is fully tested
            local major; major="${DISTRO_VERSION%%.*}"
            (( major < 20 )) && warn "Ubuntu ${DISTRO_VERSION} is old. 20.04 or newer is recommended."
            ;;
        debian)
            local major; major="${DISTRO_VERSION%%.*}"
            (( major < 11 )) && warn "Debian ${DISTRO_VERSION} is old. Debian 11 (bullseye) or newer is recommended."
            ;;
        linuxmint|pop|elementary|zorin)
            warn "Running on ${DISTRO_ID} ${DISTRO_VERSION}. This is community-supported, not fully tested."
            warn "If you hit package issues, check that your distro's repos include the Ubuntu base packages."
            ;;
        kali|parrot)
            warn "${DISTRO_ID} is a security distro — OpenStack is not tested here. Proceed at your own risk."
            ;;
        raspbian|raspi)
            warn "Raspberry Pi OS detected. Only ARM64 with at least 8 GB RAM is recommended."
            ;;
    esac

    ok "Distro check passed: ${DISTRO_ID} ${DISTRO_VERSION} (${DISTRO_CODENAME}) [${DISTRO_FAMILY}]"
}

require_internet() {
    # Try several well-known, stable hosts — no Ubuntu-only dependency
    local -a hosts=( 8.8.8.8 1.1.1.1 9.9.9.9 )
    for host in "${hosts[@]}"; do
        if ping -c 1 -W 3 "${host}" &>/dev/null; then
            return 0
        fi
    done
    error "No internet connection detected. Tried: ${hosts[*]}"
}

# ─── CONFIG VALIDATION ────────────────────────────────────────────────────────
# Call validate_config() at the top of every deployment path.
# Hard-errors on clearly broken settings; warns on risky-but-valid ones.
validate_config() {
    section "Pre-flight config validation"
    local issues=0

    # HOST_IP — must not be the sentinel and must be a valid IPv4
    if [[ "${HOST_IP}" == "__CHANGE_ME__" ]]; then
        error "HOST_IP is still the factory placeholder. Run the Setup Wizard first."
        (( issues++ ))
    elif ! validate_ip "${HOST_IP}"; then
        error "HOST_IP '${HOST_IP}' is not a valid IPv4 address."
        (( issues++ ))
    fi

    # DEPLOY_MODE
    if [[ ! "${DEPLOY_MODE}" =~ ^(all-in-one|multi-node)$ ]]; then
        error "DEPLOY_MODE must be 'all-in-one' or 'multi-node', got '${DEPLOY_MODE}'."
        (( issues++ ))
    fi

    # Passwords — must be set and reasonably strong
    for var in ADMIN_PASS DB_PASS RABBIT_PASS SERVICE_PASS; do
        local val="${!var:-}"
        if [[ -z "${val}" ]]; then
            error "${var} is not set."
            (( issues++ ))
        elif [[ "${#val}" -lt 12 ]]; then
            warn "${var} is short (${#val} chars). 16+ recommended."
        fi
    done

    # Email fields — basic sanity check
    if [[ -n "${ACME_EMAIL:-}" && "${ACME_EMAIL}" != *@* ]]; then
        warn "ACME_EMAIL '${ACME_EMAIL}' doesn't look like a valid email address."
    fi
    if [[ -n "${ALERT_EMAIL:-}" && "${ALERT_EMAIL}" != *@* ]]; then
        warn "ALERT_EMAIL '${ALERT_EMAIL}' doesn't look like a valid email address."
    fi

    # CONFIG_VERSION — warn if stale
    local expected_version="2.0"
    if [[ "${CONFIG_VERSION:-0}" != "${expected_version}" ]]; then
        warn "main.env CONFIG_VERSION is '${CONFIG_VERSION:-unset}'; expected '${expected_version}'."
        warn "Some settings may be missing. Consider re-running the Setup Wizard."
    fi

    if (( issues > 0 )); then
        echo ""
        error "Validation failed with ${issues} error(s). Fix configs/main.env before deploying."
    fi

    ok "Config validation passed."
}

# ─── SECRETS LOADER ───────────────────────────────────────────────────────────
# Usage: safe_source_secrets "/path/to/.secrets.env"
#
# Supports two modes:
#   Plain (.secrets.env)      — sourced directly; file must be chmod 600
#   Encrypted (.secrets.enc)  — decrypted on the fly with openssl + master password
#
# To encrypt your secrets file:
#   openssl enc -aes-256-cbc -pbkdf2 -in .secrets.env -out .secrets.enc
# To decrypt:
#   openssl enc -aes-256-cbc -pbkdf2 -d -in .secrets.enc
safe_source_secrets() {
    local path="${1:-${PROJ:-$(pwd)}/configs/.secrets.env}"
    local enc_path="${path%.env}.enc"

    if [[ -f "${path}" ]]; then
        local perms
        perms=$(stat -c "%a" "${path}" 2>/dev/null || stat -f "%Lp" "${path}" 2>/dev/null)
        if [[ "${perms}" != "600" ]]; then
            warn "Secrets file is world-readable (${perms}). Fixing permissions..."
            run_cmd chmod 600 "${path}"
        fi
        # shellcheck disable=SC1090
        source "${path}"
        ok "Secrets loaded from ${path}"

    elif [[ -f "${enc_path}" ]]; then
        log "Encrypted secrets found. Enter master password to decrypt."
        local decrypted
        decrypted=$(openssl enc -aes-256-cbc -pbkdf2 -d -in "${enc_path}" 2>/dev/null) \
            || error "Failed to decrypt ${enc_path}. Wrong password?"
        # shellcheck disable=SC1090
        source <(echo "${decrypted}")
        ok "Secrets decrypted and loaded from ${enc_path}"

    else
        warn "No secrets file found at ${path}."
        warn "Falling back to passwords defined in main.env (not recommended for production)."
    fi
}

# ─── DATABASE HELPERS ─────────────────────────────────────────────────────────
# Passwords are passed via a process-substitution options-file, not the CLI,
# so they never appear in 'ps aux' output.
create_db() {
    local db="$1"
    log "Creating database: ${db}..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "  ${DIM}[DRY-RUN] Would create DB '${db}' and grant '${db}'@localhost.${NC}"
        return 0
    fi

    mysql --defaults-extra-file=<(printf '[client]\npassword=%s\n' "${DB_PASS}") \
          -u root 2>/dev/null << EOF
CREATE DATABASE IF NOT EXISTS ${db};
GRANT ALL PRIVILEGES ON ${db}.* TO '${db}'@'localhost' IDENTIFIED BY '${SERVICE_PASS}';
GRANT ALL PRIVILEGES ON ${db}.* TO '${db}'@'%'         IDENTIFIED BY '${SERVICE_PASS}';
FLUSH PRIVILEGES;
EOF
    ok "Database '${db}' ready."
}

# ─── KEYSTONE HELPERS ─────────────────────────────────────────────────────────
# Usage: register_service "nova" "compute" "OpenStack Compute" "http://IP:8774/v2.1"
register_service() {
    local user="$1"; local type="$2"; local desc="$3"; local url="$4"
    log "Registering '${user}' in Keystone..."

    if [[ "${DRY_RUN}" == "true" ]]; then
        echo -e "  ${DIM}[DRY-RUN] Would register Keystone service '${user}' (${type}).${NC}"
        return 0
    fi

    openstack user create --domain default --password "${SERVICE_PASS}" "${user}" 2>/dev/null \
        || warn "User '${user}' already exists."
    openstack role add --project service --user "${user}" admin 2>/dev/null || true
    openstack service create --name "${user}" --description "${desc}" "${type}" 2>/dev/null \
        || warn "Service '${user}' already registered."

    for endpoint_type in public internal admin; do
        openstack endpoint create --region "${REGION_NAME}" \
            "${type}" "${endpoint_type}" "${url}" 2>/dev/null || true
    done
    ok "Keystone registration done for '${user}'."
}

# ─── SYSTEMD HELPERS ──────────────────────────────────────────────────────────
# start_services — enables, then restarts each unit.
# Retries up to 3 times with a 3-second back-off before giving up.
# Waits up to SERVICE_START_TIMEOUT seconds (default 15) for active status.
: "${SERVICE_START_TIMEOUT:=15}"

start_services() {
    for svc in "$@"; do
        if [[ "${DRY_RUN}" == "true" ]]; then
            echo -e "  ${DIM}[DRY-RUN] Would enable + start: ${svc}${NC}"
            continue
        fi

        systemctl enable "${svc}" 2>/dev/null || true

        local attempt retried=false
        for attempt in 1 2 3; do
            if systemctl restart "${svc}" 2>/dev/null; then
                retried=false
                break
            fi
            warn "Attempt ${attempt}/3 failed for ${svc}, retrying in 3s..."
            sleep 3
            retried=true
        done

        # Poll for active state
        local elapsed=0
        while ! systemctl is-active --quiet "${svc}"; do
            sleep 1; (( elapsed++ ))
            if (( elapsed >= SERVICE_START_TIMEOUT )); then
                warn "Service '${svc}' did not become active within ${SERVICE_START_TIMEOUT}s."
                break
            fi
        done

        if systemctl is-active --quiet "${svc}"; then
            ok "Service started: ${svc}${retried:+ (needed retry)}"
        else
            warn "Could not start '${svc}'. Check: journalctl -u ${svc} -n 30 --no-pager"
        fi
    done
}

# ─── PROGRESS SPINNER ─────────────────────────────────────────────────────────
# spinner PID [message]
# Cleans up the line whether the watched process succeeds or errors.
spinner() {
    local pid=$1; local msg="${2:-Working...}"
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0

    # Ensure cursor is restored even if this function is interrupted
    trap 'printf "\r\033[K"; trap - INT TERM RETURN' INT TERM RETURN

    while kill -0 "${pid}" 2>/dev/null; do
        printf "\r  ${CYAN}${spin:i++%${#spin}:1}${NC}  ${msg}"
        sleep 0.1
    done

    printf "\r\033[K"  # clear the spinner line
    trap - INT TERM RETURN
}

# ─── DEPLOYMENT CHECKPOINTS ───────────────────────────────────────────────────
# Allows long deployments to resume after a failure rather than re-running
# from scratch. The checkpoint file lives in the log directory.
#
# Usage:
#   step_ran "keystone" && { warn "Skipping keystone (already done)."; } || {
#       bash scripts/base/02_keystone.sh && step_done "keystone"
#   }
: "${CHECKPOINT_FILE:=${LOG_DIR:-/tmp}/.deployment_checkpoint}"

step_done() { echo "$1" >> "${CHECKPOINT_FILE}"; }
step_ran()  { grep -qxF "$1" "${CHECKPOINT_FILE}" 2>/dev/null; }
clear_checkpoints() {
    [[ -f "${CHECKPOINT_FILE}" ]] && rm "${CHECKPOINT_FILE}"
    log "Checkpoint file cleared."
}

# ─── SAFETY: CONFIRM HOSTNAME ─────────────────────────────────────────────────
# Used by destructive scripts (uninstall, full wipe) to make sure the operator
# knows exactly which machine they're on.
confirm_hostname() {
    local current; current=$(hostname)
    echo -e "  ${YELLOW}This is a destructive operation on: ${BOLD}${current}${NC}"
    echo -ne "  Type this server's hostname to confirm: "
    read -r input
    if [[ "${input}" != "${current}" ]]; then
        echo "Hostname mismatch. Aborted."
        exit 1
    fi
}

# ─── TIMER ────────────────────────────────────────────────────────────────────
STEP_START=0
start_timer() { STEP_START=$(date +%s); }
elapsed()      { echo "$(( $(date +%s) - STEP_START ))s"; }

# ─── INPUT VALIDATION ─────────────────────────────────────────────────────────
validate_ip() {
    local ip="$1"
    local IFS='.'
    read -ra parts <<< "${ip}"
    [[ ${#parts[@]} -ne 4 ]] && return 1
    for part in "${parts[@]}"; do
        [[ "${part}" =~ ^[0-9]+$ ]] || return 1
        (( part >= 0 && part <= 255 )) || return 1
    done
    return 0
}

# ─── VERIFY OPENSTACK SERVICE ─────────────────────────────────────────────────
verify_service() {
    local name="$1"; local cmd="$2"
    if eval "${cmd}" &>/dev/null; then
        ok "${name} — OK"
    else
        warn "${name} — not responding (may still be starting)"
    fi
}
