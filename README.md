# 🌩️ OpenStack Homelab

**One project. One config file. One command.**

A full-stack OpenStack automation suite for Debian-based Linux — from bare-metal deployment to production operations. Supports Ubuntu 20.04+, Debian 11/12, Linux Mint 21+, and more.

---

## ✨ What's New in v4

- **Auto-detection** — `HOST_IP` and `INTERFACE_NAME` are detected from your default route on startup. No editing `main.env` before running.
- **6-step Setup Wizard** — now covers IP, network interface (with live NIC picker), admin password, DB password, Keystone endpoint selection, and extra service toggling.
- **Multi-distro support** — works on any Debian-based distro with `apt`, `systemd`, and kernel 5.4+. No longer Ubuntu 24.04 only.
- **Bare-metal ready** — detects physical vs VM hardware, shows a pre-flight checklist, warns on SSH-risk interface selection.
- **Password safety** — all config writes use Python, not `sed`. Passwords with `*`, `/`, `@`, `#`, and other special characters are handled correctly.
- **`set -euo pipefail` hardened** — every `(( ))` increment, `&&` guard, and function return value is safe under strict mode.
- **Resume deployments** — `--resume` picks up from the last completed checkpoint after a failure.

---

## 🗂️ Project Structure

```
openstack-complete/
│
├── deploy.sh                    ← THE ENTRY POINT — start here
├── uninstall.sh                 ← Safe removal with hostname confirmation + backup
├── configs/
│   └── main.env                 ← THE ONLY CONFIG FILE — auto-detects IP & interface
│
└── scripts/
    ├── lib.sh                   ← Shared helpers (colours, logging, detection, guards)
    │
    ├── base/                    ← Core OpenStack (01–08)
    │   ├── 01_prerequisites.sh  │  MariaDB, RabbitMQ, Memcached, NTP, Etcd
    │   ├── 02_keystone.sh       │  Identity & Authentication
    │   ├── 03_glance.sh         │  VM Image Storage
    │   ├── 04_placement.sh      │  Resource Tracking
    │   ├── 05_nova.sh           │  Compute (VM lifecycle)
    │   ├── 06_neutron.sh        │  Virtual Networking
    │   ├── 07_horizon.sh        │  Web Dashboard
    │   └── 08_verify.sh         │  Health checks
    │
    ├── services/                ← Extra OpenStack Services (09–16)
    │   ├── 09_cinder.sh         │  Block Storage (like AWS EBS)
    │   ├── 10_swift.sh          │  Object Storage (like AWS S3)
    │   ├── 11_heat.sh           │  Orchestration / IaC (like CloudFormation)
    │   ├── 12_ceilometer.sh     │  Telemetry & Metrics (like CloudWatch)
    │   ├── 13_barbican.sh       │  Secrets Manager (like Vault)
    │   ├── 14_octavia.sh        │  Load Balancer (like AWS ELB)
    │   ├── 15_manila.sh         │  Shared Filesystems (like AWS EFS)
    │   └── 16_designate.sh      │  DNS Service (like Route 53)
    │
    ├── multinode/               ← Multi-node cluster support
    │   ├── 00_preflight.sh      │  Hostname, hosts, NTP, firewall (all nodes)
    │   ├── 02_compute.sh        │  Nova + Neutron agent for Compute nodes
    │   └── 03_storage.sh        │  Cinder + Swift backend for Storage nodes
    │
    ├── monitoring/              ← Health Dashboard & Alerting
    │   ├── monitor.sh           │  Live colour dashboard + Slack/email alerts
    │   └── install-cron.sh      │  Schedule monitoring every 5 minutes
    │
    ├── backup/                  ← Backup & Disaster Recovery
    │   ├── backup.sh            │  Backup VMs, databases, configs, images
    │   └── restore.sh           │  Restore from any backup point
    │
    ├── k8s/
    │   └── deploy-k8s.sh        ← Kubernetes cluster on OpenStack VMs
    │
    ├── ssl/
    │   ├── ssl-manager.sh       ← Let's Encrypt cert management
    │   └── reload-services.sh   │  Post-renewal hook
    │
    └── hardening/
        └── server-harden.sh     ← CIS Benchmark security audit & auto-fix
```

---

## 📋 System Requirements

| Resource | Minimum (All-in-One) | Recommended |
|---|---|---|
| **OS** | Any Debian-based distro, kernel 5.4+ | Ubuntu 22.04 / 24.04 LTS |
| **CPU** | 4 cores (VT-x / AMD-V required) | 8+ cores |
| **RAM** | 8 GB | 16–32 GB |
| **Disk** | 50 GB | 100+ GB SSD |
| **NICs** | 1 (minimum) | 2 (management + VM traffic) |

**Supported distros:**

| Distro | Status |
|---|---|
| Ubuntu 20.04 / 22.04 / 24.04 / 25.10 | ✅ Fully tested |
| Debian 11 (Bullseye) / 12 (Bookworm) | ✅ Fully tested |
| Linux Mint 21 / 22 | ✅ Community supported |
| Pop!\_OS, elementary OS, Zorin | ⚠️ Best-effort |
| Raspberry Pi OS (ARM64, 8 GB+ RAM) | ⚠️ Best-effort |

> ⚠️ Use a **fresh** OS installation. Do not run on a server already in production use.

---

## ⚡ Quick Start

### 1. Get the project

```bash
git clone https://github.com/your-username/openstack-complete
cd openstack-complete
```

Or if you downloaded the files manually, set up the folder structure:

```bash
mkdir -p ~/openstack-complete/configs ~/openstack-complete/scripts
cp deploy.sh uninstall.sh ~/openstack-complete/
cp main.env               ~/openstack-complete/configs/
cp lib.sh                 ~/openstack-complete/scripts/
cd ~/openstack-complete
```

### 2. Run it

```bash
sudo bash deploy.sh
```

That's it. The script will:

1. **Auto-detect** your IP address and primary network interface from the system's default route
2. **Launch the Setup Wizard** automatically on first run (or if IP couldn't be detected)
3. Drop you into the **interactive menu** once configuration is saved

### 3. The Setup Wizard (6 steps)

The wizard runs automatically on first launch. You can re-run it any time:

```bash
sudo bash deploy.sh --wizard
```

| Step | What it does |
|---|---|
| **1 — Host IP** | Shows auto-detected IP, lets you confirm or pick a different one |
| **2 — Network Interface** | Lists all physical NICs with state + IP; auto-selects the default-route interface |
| **3 — Admin Password** | Sets the OpenStack admin password with strength meter and confirmation |
| **4 — DB Password** | Sets the MariaDB root password, independently from admin |
| **5 — Keystone Endpoints** | Toggle which services get registered in the service catalog |
| **6 — Extra Services** | Toggle which services get installed (pre-filled from Step 5) |

All settings are written to `configs/main.env` safely — passwords with special characters are handled correctly.

### 4. Or use flags directly

```bash
sudo bash deploy.sh --full       # Deploy everything in main.env
sudo bash deploy.sh --base       # Base OpenStack only (Keystone → Horizon)
sudo bash deploy.sh --services   # Extra services only
sudo bash deploy.sh --resume     # Continue after a failed deployment
sudo bash deploy.sh --wizard     # Re-run the Setup Wizard
sudo bash deploy.sh --monitor    # Live health dashboard
sudo bash deploy.sh --backup     # Backup VMs, databases, configs
sudo bash deploy.sh --restore    # Restore from a backup
sudo bash deploy.sh --harden     # CIS Benchmark audit & auto-fix
sudo bash deploy.sh --ssl        # Let's Encrypt cert management
sudo bash deploy.sh --k8s        # Deploy Kubernetes
sudo bash deploy.sh --verify     # Health check all services
sudo bash deploy.sh --config     # Show current configuration
sudo bash deploy.sh --dry-run    # Preview all actions without executing
sudo bash deploy.sh --help       # Show this list
```

---

## 🖥️ Bare-Metal Deployment

When the script detects it is running on physical hardware (not a VM), it prints a pre-flight checklist:

```
── Bare-Metal Deployment Detected ──
  • CPU virtualisation (VT-x / AMD-V) enabled in BIOS/UEFI
  • 2 NICs recommended — one management, one for VM traffic
  • NTP reachable — clock skew breaks Keystone token validation
  • IOMMU enabled for GPU/SR-IOV passthrough (optional)
```

**Before running on bare-metal, do these three things manually:**

```bash
# 1. Set a static IP on your management NIC
#    Edit /etc/netplan/00-installer-config.yaml and apply
sudo netplan apply

# 2. Set hostname and /etc/hosts
sudo hostnamectl set-hostname controller
echo "YOUR_IP controller" | sudo tee -a /etc/hosts

# 3. Sync the clock
sudo timedatectl set-ntp true
timedatectl status   # should show NTP service: active
```

**Two-NIC setup (recommended):**
- `ens3` / `eth0` — management NIC, keeps your SSH session, has a static IP
- `ens4` / `eth1` — provider NIC, handed to Neutron for VM traffic, **no IP assigned**

In the wizard, select your **management NIC** for the IP (Step 1) and your **provider NIC** for the interface (Step 2). The wizard will warn you if you pick a NIC that already has an IP address assigned.

---

## ⚙️ Configuration Reference

`configs/main.env` is auto-populated by the wizard. Key settings:

```bash
# ── Auto-detected at startup (wizard confirms / overrides) ────────────────────
HOST_IP="192.168.1.50"        # detected from default route
INTERFACE_NAME="ens4"         # detected from default route interface
CONTROLLER_IP="${HOST_IP}"    # same as HOST_IP in all-in-one mode

# ── Deployment ────────────────────────────────────────────────────────────────
DEPLOY_MODE="all-in-one"      # or "multi-node"

# ── Passwords (set by wizard, written safely via Python) ──────────────────────
ADMIN_PASS="your-admin-password"
DB_PASS="your-db-password"

# ── Keystone service catalog ──────────────────────────────────────────────────
KEYSTONE_SERVICES_STR="keystone glance placement nova neutron"

# ── Extra services ────────────────────────────────────────────────────────────
INSTALL_CINDER="false"
INSTALL_SWIFT="false"
INSTALL_HEAT="false"
INSTALL_BARBICAN="false"
INSTALL_DESIGNATE="false"
INSTALL_CEILOMETER="false"    # resource-heavy
INSTALL_OCTAVIA="false"       # needs Amphora image
INSTALL_MANILA="false"

# ── Monitoring & alerts ───────────────────────────────────────────────────────
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
ALERT_EMAIL="ops@yourcompany.com"

# ── Backups ───────────────────────────────────────────────────────────────────
BACKUP_PATH="/var/backups/openstack"
BACKUP_KEEP_DAYS=7

# ── SSL ───────────────────────────────────────────────────────────────────────
ACME_EMAIL="admin@yourdomain.com"
OPENSTACK_DOMAIN="cloud.yourdomain.com"
```

### Secrets file (recommended for production)

Keep passwords out of `main.env` by using a separate secrets file:

```bash
# Create the secrets file
cat > configs/.secrets.env << EOF
ADMIN_PASS="your-strong-password"
DB_PASS="your-db-password"
RABBIT_PASS="your-rabbit-password"
SERVICE_PASS="your-service-password"
EOF

chmod 600 configs/.secrets.env
```

Add to `.gitignore`:
```
configs/main.env
configs/.secrets.env
configs/.secrets.enc
```

To encrypt the secrets file:
```bash
openssl enc -aes-256-cbc -pbkdf2 -in configs/.secrets.env -out configs/.secrets.enc
rm configs/.secrets.env   # keep only the encrypted version
```

---

## 📖 Module Reference

### 🏗️ Base OpenStack

Deploys: **Keystone → Glance → Placement → Nova → Neutron → Horizon**

```bash
sudo bash deploy.sh --base
```

After deployment:

```bash
# Dashboard
http://YOUR_IP/horizon          # login: admin / your ADMIN_PASS

# CLI
source configs/admin-openrc.sh
openstack service list
openstack compute service list
openstack network agent list    # linuxbridge-agent should show ":-)" True
```

**First VM test:**

```bash
# Upload an image
wget https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img
openstack image create "ubuntu-22.04" \
  --file ubuntu-22.04-minimal-cloudimg-amd64.img \
  --disk-format qcow2 --container-format bare --public

# Create network and launch a VM
openstack network create internal
openstack subnet create --network internal --subnet-range 192.168.100.0/24 internal-subnet
openstack server create --flavor m1.small --image ubuntu-22.04 --network internal test-vm
openstack server list   # wait for ACTIVE status
```

---

### 📦 Extra Services

Enable in the wizard (Steps 5–6) or toggle in `main.env`, then:

```bash
sudo bash deploy.sh --services
```

| Service | Quick test |
|---|---|
| Cinder | `openstack volume create --size 5 test-vol` |
| Swift | `openstack container create my-bucket` |
| Heat | `openstack stack create -t template.yaml my-stack` |
| Barbican | `openstack secret store --name pw --payload 'MyPass'` |
| Designate | `openstack zone create --email a@b.com example.com.` |
| Octavia | `openstack loadbalancer create --name lb1 --vip-subnet-id SUBNET_ID` |

---

### 🖥️ Multi-Node

For production clusters with separate controller, compute, and storage nodes:

```bash
# 1. On ALL nodes — sets up hostname, /etc/hosts, NTP, firewall
sudo bash scripts/multinode/00_preflight.sh

# 2. On controller — run full base deployment
sudo bash deploy.sh --base

# 3. On each compute node
sudo bash scripts/multinode/02_compute.sh

# 4. On storage node
sudo bash scripts/multinode/03_storage.sh
```

Or use the menu: `sudo bash deploy.sh` → option **5**.

---

### 📊 Health Dashboard

```bash
sudo bash deploy.sh --monitor
```

Options: **once** / **live watch** (refresh every N seconds) / **alert** (Slack/email on failure) / **install cron** (every 5 min).

Checks: every service API, port reachability, system resources (CPU/RAM/disk), NTP sync, and database connectivity.

---

### 💾 Backup & Restore

```bash
# Backup
sudo bash deploy.sh --backup
# Options: full / databases only / configs only / Glance images / VM snapshots / install daily cron

# Restore
sudo bash deploy.sh --restore
# Lists available backup timestamps, restore DB / configs / VM / full
```

Backups are saved to `BACKUP_PATH` (default `/var/backups/openstack`) and pruned after `BACKUP_KEEP_DAYS` days.

---

### ☸️ Kubernetes

```bash
sudo bash deploy.sh --k8s
```

Spins up OpenStack VMs, bootstraps a K8s control plane, joins worker nodes, and writes `kubeconfig`:

```bash
export KUBECONFIG=scripts/k8s/configs/kubeconfig
kubectl get nodes
```

Worker count is set by `K8S_WORKER_COUNT` in `main.env`.

---

### 🔒 SSL Certificates

```bash
sudo bash deploy.sh --ssl
```

Options: issue cert / renew all expiring / view expiry dates / secure OpenStack endpoints / install auto-renewal cron.

Requires `ACME_EMAIL` and `OPENSTACK_DOMAIN` to be set in `main.env`.

---

### 🛡️ Server Hardening

```bash
sudo bash deploy.sh --harden
```

Options: **audit only** (check, no changes) or **harden** (check + auto-fix). Generates a scored CIS Benchmark report in `scripts/hardening/reports/`.

```
Score: 47/52 (90%) — Grade: A
```

---

## 🔁 Resuming a Failed Deployment

If a deployment fails midway, don't start over:

```bash
sudo bash deploy.sh --resume
```

The script reads `logs/.deployment_checkpoint`, shows which steps completed, and continues from the failure point. Each step is idempotent — re-running a completed step is safe.

To start completely fresh:

```bash
rm logs/.deployment_checkpoint
sudo bash deploy.sh --full
```

---

## 🧪 Dry Run

Preview every action without touching the system:

```bash
sudo bash deploy.sh --dry-run --full
```

All commands print with a `[DRY-RUN]` prefix. No packages are installed, no files are written, no services are started.

---

## 📝 Logs

All output is saved to `logs/deploy_YYYYMMDD_HHMMSS.log`.

```bash
sudo bash deploy.sh            # menu → option 14 to browse logs
tail -f logs/deploy_*.log      # follow live
```

Logs older than `LOG_KEEP_DAYS` (default 30) are pruned automatically after a full deployment.

---

## 🆘 Troubleshooting

**Service is down:**
```bash
systemctl status nova-api
journalctl -u nova-api -n 50 --no-pager
```

**Re-run a single step:**
```bash
sudo bash scripts/base/05_nova.sh
sudo bash scripts/services/09_cinder.sh
```

**Check all OpenStack services:**
```bash
source configs/admin-openrc.sh
openstack service list
openstack compute service list
openstack network agent list
```

**Full health check:**
```bash
sudo bash deploy.sh --verify
```

**Completely remove OpenStack:**
```bash
sudo bash uninstall.sh            # interactive, confirms hostname, offers backup
sudo bash uninstall.sh --dry-run  # preview what would be removed
```

**Common issues:**

| Symptom | Likely cause | Fix |
|---|---|---|
| Script exits silently after `sudo` | Wrong folder structure | Run from inside `openstack-complete/` |
| `configs/main.env not found` | Missing configs dir | `mkdir -p configs && cp main.env configs/` |
| `scripts/lib.sh not found` | Missing scripts dir | `mkdir -p scripts && cp lib.sh scripts/` |
| Keystone token errors | Clock drift | `sudo timedatectl set-ntp true` |
| Neutron agents not showing `True` | Wrong interface | Re-run wizard, pick the correct NIC |
| VM stays in BUILD state | Nova-compute not connected | `openstack compute service list` — check nova-compute row |
| SSH drops during deployment | Neutron took management NIC | Use a second NIC for VM traffic |

---

## 📚 Resources

- [OpenStack Documentation](https://docs.openstack.org)
- [OpenStack 2024.1 (Caracal) Release Notes](https://releases.openstack.org/caracal/)
- [Ubuntu OpenStack Guide](https://ubuntu.com/openstack/docs)
- [Neutron LinuxBridge Setup](https://docs.openstack.org/neutron/latest/admin/deploy-lb-provider.html)
- [Nova Configuration Reference](https://docs.openstack.org/nova/latest/configuration/config.html)

---

## 📄 License

MIT — free to use, modify, and distribute. See `LICENSE` for details.
