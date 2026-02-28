import { useState, useEffect, useRef, useCallback } from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const DETECTED_IPS = ["192.168.1.50", "10.0.0.10", "172.16.0.5"];
const DETECTED_IFACES = [
  { name: "ens3",  state: "up",   ip: "192.168.1.50" },
  { name: "ens4",  state: "up",   ip: null           },
  { name: "ens5",  state: "down", ip: null           },
];

const KS_SERVICES = [
  { key: "NOVA",       label: "Nova",       desc: "Compute API",        port: 8774, required: true  },
  { key: "NEUTRON",    label: "Neutron",    desc: "Networking API",     port: 9696, required: true  },
  { key: "CINDER",     label: "Cinder",     desc: "Block Storage",      port: 8776, required: false },
  { key: "SWIFT",      label: "Swift",      desc: "Object Storage",     port: 8080, required: false },
  { key: "HEAT",       label: "Heat",       desc: "Orchestration",      port: 8004, required: false },
  { key: "BARBICAN",   label: "Barbican",   desc: "Secrets Manager",    port: 9311, required: false },
  { key: "DESIGNATE",  label: "Designate",  desc: "DNS Service",        port: 9001, required: false },
  { key: "OCTAVIA",    label: "Octavia",    desc: "Load Balancer",      port: 9876, required: false },
  { key: "MANILA",     label: "Manila",     desc: "Shared Filesystems", port: 8786, required: false },
  { key: "CEILOMETER", label: "Ceilometer", desc: "Telemetry",          port: 8777, required: false },
];

const EXTRA_SERVICES = [
  { key: "CINDER",     label: "Cinder",     desc: "Block Storage — like AWS EBS" },
  { key: "SWIFT",      label: "Swift",      desc: "Object Storage — like AWS S3" },
  { key: "HEAT",       label: "Heat",       desc: "Orchestration / IaC — like CloudFormation" },
  { key: "CEILOMETER", label: "Ceilometer", desc: "Telemetry & Metrics (resource-heavy)" },
  { key: "BARBICAN",   label: "Barbican",   desc: "Secrets Manager — like HashiCorp Vault" },
  { key: "OCTAVIA",    label: "Octavia",    desc: "Load Balancer — needs Amphora image" },
  { key: "MANILA",     label: "Manila",     desc: "Shared Filesystems — like AWS EFS" },
  { key: "DESIGNATE",  label: "Designate",  desc: "DNS as a Service — like Route 53" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function passwordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 16) score++;
  if (pw.length >= 24) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  const labels = ["Very Weak", "Weak", "Medium", "Strong", "Very Strong", "Very Strong"];
  const colors = ["#ef4444","#f97316","#eab308","#22c55e","#10b981","#10b981"];
  const bars   = [1,2,3,4,5,5];
  return { label: labels[score], color: colors[score], bars: bars[score], score };
}

function maskPassword(pw) { return "•".repeat(pw.length); }

// ─── STEP COMPONENTS ─────────────────────────────────────────────────────────

function Banner({ distro = "ubuntu 24.04", hw = "physical", ip = "__CHANGE_ME__" }) {
  return (
    <div className="banner-block">
      <pre className="ascii-art">{`  ╔═══════════════════════════════════════════════════════════════╗
  ║    ██████╗ ██████╗ ███████╗███╗  ██╗███████╗████████╗        ║
  ║   ██╔═══██╗██╔══██╗██╔════╝████╗ ██║██╔════╝╚══██╔══╝        ║
  ║   ██║   ██║██████╔╝█████╗  ██╔██╗██║███████╗   ██║           ║
  ║   ██║   ██║██╔═══╝ ██╔══╝  ██║╚████║╚════██║   ██║           ║
  ║   ╚██████╔╝██║     ███████╗██║ ╚███║███████║   ██║           ║
  ║    ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚══╝╚══════╝   ╚═╝           ║
  ║          C O M P L E T E   P R O J E C T   v3                ║
  ║       Debian-based  │  OpenStack 2024.1 Caracal               ║
  ╚═══════════════════════════════════════════════════════════════╝`}</pre>
      <div className="banner-meta">
        <span className="dim">Host: </span><span className={ip === "__CHANGE_ME__" ? "red" : "green"}>{ip}</span>
        <span className="dim">  │  OS: </span><span className="cyan">{distro}</span>
        <span className="dim">  │  🖥 {hw}  │  Kernel: 6.8.0-51-generic</span>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-header">
      <span className="cyan bold">▸ {title}</span>
      <div className="section-line" />
    </div>
  );
}

function Line({ children, className = "" }) {
  return <div className={`line ${className}`}>{children}</div>;
}

function Ok({ children })   { return <Line><span className="green">  ✔ </span>{children}</Line>; }
function Warn({ children })  { return <Line><span className="yellow">  ⚠ </span>{children}</Line>; }
function Prompt({ children }) { return <Line className="prompt-line"><span className="dim">{children}</span></Line>; }

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState("boot");      // boot|wizard|step1..6|summary|deploying|done
  const [config, setConfig] = useState({
    ip: "__CHANGE_ME__",
    iface: "ens3",
    adminPass: "",
    dbPass: "",
    ksServices: { NOVA:true, NEUTRON:true, CINDER:false, SWIFT:false, HEAT:false, BARBICAN:false, DESIGNATE:false, OCTAVIA:false, MANILA:false, CEILOMETER:false },
    extraServices: { CINDER:false, SWIFT:false, HEAT:false, CEILOMETER:false, BARBICAN:false, OCTAVIA:false, MANILA:false, DESIGNATE:false },
  });
  const [input, setInput] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [deployLog, setDeployLog] = useState([]);
  const [deployDone, setDeployDone] = useState(false);
  const termRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [step, deployLog]);

  // Focus input when step changes
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [step]);

  // ── Deploy simulation ──
  const startDeploy = useCallback(() => {
    setStep("deploying");
    setDeployLog([]);
    setDeployDone(false);

    const enabledKS = Object.entries(config.ksServices).filter(([,v])=>v).map(([k])=>k.toLowerCase());
    const enabledSvc = Object.entries(config.extraServices).filter(([,v])=>v).map(([k])=>k);

    const steps = [
      { delay: 300,  msg: `▸ Pre-flight config validation`, type: "section" },
      { delay: 600,  msg: `  ✔ Distro check: ubuntu 24.04 (noble) [debian]`, type: "ok" },
      { delay: 900,  msg: `  ✔ Hardware: physical — VT-x enabled`, type: "ok" },
      { delay: 1200, msg: `  ✔ Interface ${config.iface} found (up)`, type: "ok" },
      { delay: 1500, msg: `  ✔ Internet connectivity confirmed`, type: "ok" },
      { delay: 1800, msg: `  ✔ Config validation passed`, type: "ok" },
      { delay: 2100, msg: `▸ System Prerequisites`, type: "section" },
      { delay: 2400, msg: `  [08:21:14] Running apt-get update...`, type: "log" },
      { delay: 3200, msg: `  [08:21:42] Installing MariaDB, RabbitMQ, Memcached, NTP, Etcd...`, type: "log" },
      { delay: 4800, msg: `  ✔ Prerequisites installed`, type: "ok" },
      { delay: 5100, msg: `▸ Keystone (Identity)`, type: "section" },
      { delay: 5400, msg: `  [08:22:01] Installing keystone package...`, type: "log" },
      { delay: 6200, msg: `  [08:22:18] Populating identity database...`, type: "log" },
      { delay: 6800, msg: `  [08:22:24] Bootstrapping admin user (${config.ip}:5000)...`, type: "log" },
      ...["keystone","glance","placement",...enabledKS].map((svc,i)=>({
        delay: 7200 + i*300,
        msg: `  ✔ Endpoint registered: ${svc} → http://${config.ip}:${KS_SERVICES.find(s=>s.key===svc.toUpperCase())?.port ?? "????"}`,
        type: "ok"
      })),
      { delay: 7200 + (enabledKS.length+3)*300, msg: `  ✔ Keystone ready`, type: "ok" },
      { delay: 7800 + (enabledKS.length+3)*300, msg: `▸ Glance (Images)`, type: "section" },
      { delay: 8100 + (enabledKS.length+3)*300, msg: `  [08:23:05] Installing glance...`, type: "log" },
      { delay: 9000 + (enabledKS.length+3)*300, msg: `  ✔ Service started: glance-api`, type: "ok" },
      { delay: 9400 + (enabledKS.length+3)*300, msg: `▸ Placement`, type: "section" },
      { delay: 9700 + (enabledKS.length+3)*300, msg: `  ✔ Service started: placement-api`, type: "ok" },
      { delay: 10000+(enabledKS.length+3)*300, msg: `▸ Nova (Compute)`, type: "section" },
      { delay: 10300+(enabledKS.length+3)*300, msg: `  [08:24:12] Installing nova-api, nova-conductor, nova-scheduler, nova-compute...`, type: "log" },
      { delay: 11800+(enabledKS.length+3)*300, msg: `  [08:24:58] Syncing Nova databases...`, type: "log" },
      { delay: 12600+(enabledKS.length+3)*300, msg: `  ✔ Service started: nova-api`, type: "ok" },
      { delay: 12900+(enabledKS.length+3)*300, msg: `  ✔ Service started: nova-conductor`, type: "ok" },
      { delay: 13200+(enabledKS.length+3)*300, msg: `  ✔ Service started: nova-scheduler`, type: "ok" },
      { delay: 13500+(enabledKS.length+3)*300, msg: `  ✔ Service started: nova-compute`, type: "ok" },
      { delay: 13800+(enabledKS.length+3)*300, msg: `▸ Neutron (Networking)`, type: "section" },
      { delay: 14100+(enabledKS.length+3)*300, msg: `  [08:25:40] Installing neutron-server, linuxbridge-agent...`, type: "log" },
      { delay: 15200+(enabledKS.length+3)*300, msg: `  [08:26:01] Binding interface ${config.iface} to Neutron LinuxBridge...`, type: "log" },
      { delay: 15800+(enabledKS.length+3)*300, msg: `  ✔ Service started: neutron-server`, type: "ok" },
      { delay: 16100+(enabledKS.length+3)*300, msg: `▸ Horizon (Dashboard)`, type: "section" },
      { delay: 16400+(enabledKS.length+3)*300, msg: `  ✔ Service started: apache2 (Horizon)`, type: "ok" },
      ...enabledSvc.map((svc,i)=>([
        { delay: 17000+(enabledKS.length+3)*300+i*1200, msg: `▸ ${svc} (${EXTRA_SERVICES.find(s=>s.key===svc)?.desc?.split(" — ")[0]})`, type: "section" },
        { delay: 17400+(enabledKS.length+3)*300+i*1200, msg: `  [08:2${7+i}:${10+i*13}] Installing ${svc.toLowerCase()}...`, type: "log" },
        { delay: 17900+(enabledKS.length+3)*300+i*1200, msg: `  ✔ Service started: ${svc.toLowerCase()}-api`, type: "ok" },
      ])).flat(),
      { delay: 18000+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `▸ 🎉 Full Deployment Complete`, type: "section" },
      { delay: 18300+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `  ✔ OpenStack is ready!`, type: "ok" },
      { delay: 18600+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `  Dashboard  :  http://${config.ip}/horizon`, type: "result" },
      { delay: 18900+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `  Username   :  admin`, type: "result" },
      { delay: 19200+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `  CLI access :  source configs/admin-openrc.sh`, type: "result" },
      { delay: 19500+(enabledKS.length+3)*300+enabledSvc.length*1200, msg: `  Total time :  ~35m 12s`, type: "result" },
    ];

    steps.forEach(({ delay, msg, type }) => {
      setTimeout(() => {
        setDeployLog(prev => [...prev, { msg, type }]);
        if (type === "result" && msg.includes("Total time")) setDeployDone(true);
      }, delay);
    });
  }, [config]);

  // ── Keyboard shortcut: Enter to advance boot screen ──
  const handleBootKey = (e) => {
    if (e.key === "Enter") setStep("wizard");
  };

  // ── Step 1: IP ──
  const handleIpSubmit = () => {
    const v = input.trim();
    if (!v) { setInput(""); setStep("step2"); return; } // keep default
    const validIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every(n=>+n>=0&&+n<=255);
    const idx = parseInt(v) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < DETECTED_IPS.length) {
      setConfig(c=>({...c, ip: DETECTED_IPS[idx]}));
      setInput("");
      setStep("step2");
    } else if (validIp) {
      setConfig(c=>({...c, ip: v}));
      setInput("");
      setStep("step2");
    } else {
      setPwError(`'${v}' is not a valid IPv4 address or list number.`);
    }
  };

  // ── Step 2: Interface ──
  const handleIfaceSubmit = () => {
    const v = input.trim();
    const idx = parseInt(v) - 1;
    if (!v) { setInput(""); setStep("step3"); return; }
    if (!isNaN(idx) && idx >= 0 && idx < DETECTED_IFACES.length) {
      setConfig(c=>({...c, iface: DETECTED_IFACES[idx].name}));
    } else {
      setConfig(c=>({...c, iface: v}));
    }
    setInput("");
    setStep("step3");
  };

  // ── Step 3: Admin password ──
  const handleAdminPassSubmit = () => {
    if (input.length < 12) { setPwError("Password must be 12+ characters."); return; }
    if (input !== pwConfirm) { setPwError("Passwords do not match."); return; }
    setConfig(c=>({...c, adminPass: input}));
    setInput(""); setPwConfirm(""); setPwError("");
    setStep("step4");
  };

  // ── Step 4: DB password ──
  const handleDbPassSubmit = () => {
    if (input.length < 12) { setPwError("Password must be 12+ characters."); return; }
    if (input !== pwConfirm) { setPwError("Passwords do not match."); return; }
    setConfig(c=>({...c, dbPass: input}));
    setInput(""); setPwConfirm(""); setPwError("");
    setStep("step5");
  };

  const toggleKs = (key) => {
    if (key === "NOVA" || key === "NEUTRON") return;
    setConfig(c=>({...c, ksServices:{...c.ksServices,[key]:!c.ksServices[key]}}));
  };

  const toggleExtra = (key) => {
    setConfig(c=>({...c, extraServices:{...c.extraServices,[key]:!c.extraServices[key]}}));
  };

  const strength = passwordStrength(input);

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root} onClick={() => inputRef.current?.focus()}>
      {/* Terminal chrome */}
      <div style={styles.chrome}>
        <div style={styles.titleBar}>
          <div style={styles.dots}>
            <span style={{...styles.dot, background:"#ff5f57"}}/>
            <span style={{...styles.dot, background:"#febc2e"}}/>
            <span style={{...styles.dot, background:"#28c840"}}/>
          </div>
          <span style={styles.titleText}>root@controller:~  —  sudo bash deploy.sh --wizard</span>
        </div>

        <div style={styles.terminal} ref={termRef}>
          <style>{CSS}</style>

          {/* ── BOOT ── */}
          {step === "boot" && (
            <div>
              <Banner />
              <div style={{marginTop:12}}>
                <Line>
                  <span className="yellow">  ⚠  It looks like this is your first run — HOST_IP has not been set.</span>
                </Line>
                <Line>  The <span className="bold cyan">Setup Wizard</span> will guide you through IP and service selection.</Line>
                <Line><span className="dim">  Detected: ubuntu 24.04 (noble) on </span><span className="yellow">physical</span><span className="dim"> hardware.</span></Line>
                <br/>
                <Warn>Bare-Metal Deployment Detected</Warn>
                <Line><span className="dim">   • CPU virtualisation (VT-x / AMD-V) must be enabled in BIOS/UEFI</span></Line>
                <Line><span className="dim">   • 2 NICs recommended — one management, one VM traffic</span></Line>
                <Line><span className="dim">   • Ensure NTP is reachable — clock skew breaks token validation</span></Line>
                <br/>
                <div style={styles.pressEnter} tabIndex={0} onKeyDown={handleBootKey} onClick={()=>setStep("wizard")} ref={inputRef}>
                  <span className="dim">  Press </span><span className="bold cyan">Enter</span><span className="dim"> or </span><span className="bold cyan">click here</span><span className="dim"> to launch the Setup Wizard ▶</span>
                  <span className="cursor">█</span>
                </div>
              </div>
            </div>
          )}

          {/* ── WIZARD INTRO ── */}
          {step === "wizard" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Setup Wizard — configure your deployment" />
              <Line><span className="dim">  Answers are written directly to </span><span className="cyan">configs/main.env</span></Line>
              <br/>
              <Line>  This wizard has <span className="bold">6 steps:</span></Line>
              <Line><span className="green">   1</span>  Host IP address</Line>
              <Line><span className="green">   2</span>  Network interface</Line>
              <Line><span className="green">   3</span>  Admin password</Line>
              <Line><span className="green">   4</span>  Database password</Line>
              <Line><span className="green">   5</span>  Keystone service endpoints</Line>
              <Line><span className="green">   6</span>  Extra services to install</Line>
              <br/>
              <button style={styles.nextBtn} onClick={()=>setStep("step1")}>
                Begin Wizard →
              </button>
            </div>
          )}

          {/* ── STEP 1: IP ── */}
          {step === "step1" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 1 of 6 — Host IP Address" />
              <Line>  Current value: <span className={config.ip === "__CHANGE_ME__" ? "red" : "green bold"}>{config.ip}</span></Line>
              <Line><span className="dim">  Addresses detected on this machine:</span></Line>
              <br/>
              {DETECTED_IPS.map((ip,i)=>(
                <Line key={ip}>
                  <span className="bold cyan">    {i+1}</span>  <span className="green">{ip}</span>
                  {i===0 && <span className="dim">  ← management NIC (current SSH session)</span>}
                </Line>
              ))}
              <br/>
              <Line><span className="dim">  Enter a number to pick one, or type a custom IP (blank = keep current)</span></Line>
              <br/>
              {pwError && <Line><span className="red">  ✖ {pwError}</span></Line>}
              <div style={styles.inputRow}>
                <span className="green">  IP address [</span>
                <span className="cyan">{config.ip}</span>
                <span className="green">]: </span>
                <input
                  ref={inputRef}
                  style={styles.termInput}
                  value={input}
                  onChange={e=>{setInput(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleIpSubmit()}
                  placeholder="1, 2, 3, or custom IP..."
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <button style={styles.nextBtn} onClick={handleIpSubmit}>Confirm →</button>
            </div>
          )}

          {/* ── STEP 2: INTERFACE ── */}
          {step === "step2" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 2 of 6 — Network Interface" />
              <Ok>IP set to: <span className="bold">{config.ip}</span></Ok>
              <br/>
              <Line><span className="dim">  This interface will be used by Neutron for VM traffic.</span></Line>
              <Line><span className="dim">  On bare-metal: use the NIC connected to your provider/external network.</span></Line>
              <br/>
              <Line><span className="dim">  Available interfaces:</span></Line>
              <br/>
              {DETECTED_IFACES.map((iface,i)=>(
                <Line key={iface.name}>
                  <span className="bold cyan">    {i+1}</span>
                  {"  "}
                  <span className="bold" style={{display:"inline-block",width:70}}>{iface.name}</span>
                  <span className={iface.state==="up"?"green":"yellow"} style={{display:"inline-block",width:60}}>{iface.state}</span>
                  <span className="dim">{iface.ip ?? "no IP assigned"}</span>
                  {iface.ip && <span className="yellow">  ← has IP, see warning below</span>}
                </Line>
              ))}
              <br/>
              {DETECTED_IFACES[0].ip && (
                <Warn>{`Interface ens3 has IP ${DETECTED_IFACES[0].ip}. Neutron will manage it directly — use ens4 for VM traffic if ens3 is your SSH session.`}</Warn>
              )}
              <br/>
              {pwError && <Line><span className="red">  ✖ {pwError}</span></Line>}
              <div style={styles.inputRow}>
                <span className="green">  Choose interface [1]: </span>
                <input
                  ref={inputRef}
                  style={styles.termInput}
                  value={input}
                  onChange={e=>{setInput(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleIfaceSubmit()}
                  placeholder="1, 2, 3, or type name..."
                  spellCheck={false}
                />
              </div>
              <button style={styles.nextBtn} onClick={handleIfaceSubmit}>Confirm →</button>
            </div>
          )}

          {/* ── STEP 3: ADMIN PASS ── */}
          {step === "step3" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 3 of 6 — Admin Password" />
              <Ok>Interface set to: <span className="bold">{config.iface}</span></Ok>
              <br/>
              <Line><span className="dim">  This is the OpenStack admin account password (Horizon + CLI).</span></Line>
              <Line><span className="dim">  Rules: 12+ chars, avoid  @ # $ &  — they break config file parsing.</span></Line>
              <br/>
              <div style={styles.inputRow}>
                <span className="green">  Admin password: </span>
                <input
                  ref={inputRef}
                  type="password"
                  style={styles.termInput}
                  value={input}
                  onChange={e=>{setInput(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&document.getElementById("pw-confirm-input")?.focus()}
                  autoComplete="new-password"
                />
              </div>
              {input.length > 0 && strength && (
                <div style={styles.strengthRow}>
                  <span style={{color: strength.color, marginLeft:24}}>
                    Strength: {strength.label} {"●".repeat(strength.bars)}{"○".repeat(5-strength.bars)}
                  </span>
                </div>
              )}
              <br/>
              <div style={styles.inputRow}>
                <span className="green">  Confirm password: </span>
                <input
                  id="pw-confirm-input"
                  type="password"
                  style={styles.termInput}
                  value={pwConfirm}
                  onChange={e=>{setPwConfirm(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleAdminPassSubmit()}
                  autoComplete="new-password"
                />
              </div>
              {pwError && <Line><span className="red">  ✖ {pwError}</span></Line>}
              {input && pwConfirm && input === pwConfirm && <Ok>Passwords match</Ok>}
              <br/>
              <button style={styles.nextBtn} onClick={handleAdminPassSubmit}>Confirm →</button>
            </div>
          )}

          {/* ── STEP 4: DB PASS ── */}
          {step === "step4" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 4 of 6 — Database (MariaDB) Password" />
              <Ok>Admin password set. <span className="green">{passwordStrength(config.adminPass)?.label}</span></Ok>
              <br/>
              <Line><span className="dim">  Used for MariaDB root + all service databases.</span></Line>
              <Line><span className="dim">  Do not reuse your admin password.</span></Line>
              <br/>
              <div style={styles.inputRow}>
                <span className="green">  DB password: </span>
                <input
                  ref={inputRef}
                  type="password"
                  style={styles.termInput}
                  value={input}
                  onChange={e=>{setInput(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&document.getElementById("db-confirm-input")?.focus()}
                  autoComplete="new-password"
                />
              </div>
              {input.length > 0 && (() => { const s=passwordStrength(input); return s && (
                <div style={styles.strengthRow}>
                  <span style={{color:s.color,marginLeft:24}}>Strength: {s.label} {"●".repeat(s.bars)}{"○".repeat(5-s.bars)}</span>
                </div>
              );})()}
              <br/>
              <div style={styles.inputRow}>
                <span className="green">  Confirm DB password: </span>
                <input
                  id="db-confirm-input"
                  type="password"
                  style={styles.termInput}
                  value={pwConfirm}
                  onChange={e=>{setPwConfirm(e.target.value);setPwError("");}}
                  onKeyDown={e=>e.key==="Enter"&&handleDbPassSubmit()}
                  autoComplete="new-password"
                />
              </div>
              {pwError && <Line><span className="red">  ✖ {pwError}</span></Line>}
              {input && pwConfirm && input === pwConfirm && <Ok>Passwords match</Ok>}
              {input && input === config.adminPass && <Warn>DB password matches admin password — not recommended.</Warn>}
              <br/>
              <button style={styles.nextBtn} onClick={handleDbPassSubmit}>Confirm →</button>
            </div>
          )}

          {/* ── STEP 5: KEYSTONE ── */}
          {step === "step5" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 5 of 6 — Keystone Service Endpoints" />
              <Ok>Passwords set.</Ok>
              <br/>
              <Line><span className="dim">  Toggle which services get registered in Keystone's catalog.</span></Line>
              <Line><span className="dim">  Each enabled service gets public + internal + admin endpoints.</span></Line>
              <br/>
              {/* Always-on base */}
              {["keystone","glance","placement"].map(svc=>(
                <Line key={svc}>
                  <span className="green">  [✔] </span>
                  <span className="dim bold">always</span>
                  {"  "}
                  <span className="bold" style={{display:"inline-block",width:90,textTransform:"capitalize"}}>{svc}</span>
                  <span className="dim">http://{config.ip}:{svc==="keystone"?5000:svc==="glance"?9292:8778}/</span>
                </Line>
              ))}
              <br/>
              {KS_SERVICES.map((svc,i)=>(
                <div
                  key={svc.key}
                  onClick={()=>toggleKs(svc.key)}
                  style={{...styles.toggleRow, cursor: svc.required?"not-allowed":"pointer"}}
                >
                  <span style={{color: config.ksServices[svc.key]?"#22c55e":"#ef4444"}}>
                    {config.ksServices[svc.key]?"  [✔]":"  [✖]"}
                  </span>
                  {svc.required && <span className="dim">  lock </span>}
                  {!svc.required && <span className="bold cyan">  {String(i+1).padStart(2)} </span>}
                  {"  "}
                  <span className="bold" style={{display:"inline-block",width:90}}>{svc.label}</span>
                  <span className="dim" style={{display:"inline-block",width:180}}>{svc.desc}</span>
                  {config.ksServices[svc.key] && (
                    <span className="dim" style={{fontSize:11}}>→ http://{config.ip}:{svc.port}</span>
                  )}
                </div>
              ))}
              <br/>
              <Line><span className="dim">  Click a service row to toggle it on/off. Nova + Neutron are required.</span></Line>
              <br/>
              <button style={styles.nextBtn} onClick={()=>setStep("step6")}>Continue →</button>
            </div>
          )}

          {/* ── STEP 6: EXTRA SERVICES ── */}
          {step === "step6" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Step 6 of 6 — Extra Services to Install" />
              <Ok>Keystone endpoints configured.</Ok>
              <br/>
              <Line><span className="dim">  Pre-filled from your Keystone selections. Click to toggle.</span></Line>
              <br/>
              {EXTRA_SERVICES.map((svc,i)=>(
                <div
                  key={svc.key}
                  onClick={()=>toggleExtra(svc.key)}
                  style={{...styles.toggleRow,cursor:"pointer"}}
                >
                  <span style={{color: config.extraServices[svc.key]?"#22c55e":"#ef4444"}}>
                    {config.extraServices[svc.key]?"  [✔]":"  [✖]"}
                  </span>
                  <span className="bold cyan">  {i+1} </span>
                  {"  "}
                  <span className="bold" style={{display:"inline-block",width:90}}>{svc.label}</span>
                  <span className="dim">{svc.desc}</span>
                </div>
              ))}
              <br/>
              <button style={styles.nextBtn} onClick={()=>setStep("summary")}>Continue →</button>
            </div>
          )}

          {/* ── SUMMARY ── */}
          {step === "summary" && (
            <div>
              <Banner ip={config.ip} />
              <SectionHeader title="Summary — changes to be saved to configs/main.env" />
              <br/>
              <div style={styles.summaryGrid}>
                {[
                  ["HOST_IP",         config.ip],
                  ["INTERFACE_NAME",  config.iface],
                  ["DEPLOY_MODE",     "all-in-one"],
                  ["ADMIN_PASS",      maskPassword(config.adminPass)],
                  ["DB_PASS",         maskPassword(config.dbPass)],
                ].map(([k,v])=>(
                  <Line key={k}>
                    <span className="dim">    </span>
                    <span className="cyan" style={{display:"inline-block",width:180}}>{k}</span>
                    <span className="green">{v}</span>
                  </Line>
                ))}
              </div>
              <br/>
              <Line><span className="dim">  Keystone services: </span>
                <span className="cyan">keystone glance placement </span>
                {Object.entries(config.ksServices).filter(([,v])=>v).map(([k])=>(
                  <span key={k} className="green">{k.toLowerCase()} </span>
                ))}
              </Line>
              <br/>
              {EXTRA_SERVICES.map(svc=>{
                const on = config.extraServices[svc.key];
                return (
                  <Line key={svc.key}>
                    <span style={{color:on?"#22c55e":"#ef4444"}}>    {on?"✔":"✖"}</span>
                    <span className="dim">  INSTALL_{svc.key.padEnd(12)}: </span>
                    <span style={{color:on?"#22c55e":"#6b7280"}}>{on?"true":"false"}</span>
                  </Line>
                );
              })}
              <br/>
              <Ok>Settings written to configs/main.env</Ok>
              <Ok>Secrets saved to configs/.secrets.env (chmod 600)</Ok>
              <br/>
              <Line><span className="dim">  Ready to deploy. This will take </span><span className="yellow bold">20–40 minutes</span><span className="dim"> on real hardware.</span></Line>
              <br/>
              <button style={styles.nextBtn} onClick={startDeploy}>🚀 Start Full Deployment →</button>
            </div>
          )}

          {/* ── DEPLOYING ── */}
          {(step === "deploying") && (
            <div>
              <Banner ip={config.ip} />
              <Line><span className="dim">  sudo bash deploy.sh --full</span></Line>
              <Line><span className="dim">  Log: logs/deploy_{new Date().toISOString().slice(0,10).replace(/-/g,"")}_082114.log</span></Line>
              <br/>
              {deployLog.map((entry,i)=>(
                <div key={i}>
                  {entry.type === "section" && <SectionHeader title={entry.msg.replace("▸ ","")} />}
                  {entry.type === "ok"      && <Ok>{entry.msg.replace("  ✔ ","")}</Ok>}
                  {entry.type === "log"     && <Line><span className="dim">{entry.msg}</span></Line>}
                  {entry.type === "result"  && <Line><span className="bold green">{entry.msg}</span></Line>}
                </div>
              ))}
              {!deployDone && (
                <div style={{marginTop:8}}>
                  <span className="cyan">  ⠏ </span>
                  <span className="dim">Deploying... </span>
                  <span className="cursor-blink">█</span>
                </div>
              )}
              {deployDone && (
                <div style={{marginTop:16}}>
                  <div style={styles.doneBox}>
                    <div style={{color:"#22c55e",fontSize:18,fontWeight:"bold",marginBottom:8}}>✔ Deployment Complete!</div>
                    <div style={{color:"#9ca3af",fontSize:13}}>
                      Open <span style={{color:"#38bdf8"}}>http://{config.ip}/horizon</span> in your browser<br/>
                      Username: <span style={{color:"#22c55e"}}>admin</span>  |  Password: your admin password<br/>
                      CLI: <span style={{color:"#a3e635"}}>source configs/admin-openrc.sh</span>
                    </div>
                  </div>
                  <button style={{...styles.nextBtn,background:"#1d4ed8",marginTop:12}} onClick={()=>setStep("boot")}>
                    ↺ Start Over (New Demo)
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer status bar */}
        <div style={styles.statusBar}>
          <span style={{color:"#22c55e"}}>● ubuntu 24.04</span>
          <span style={{color:"#9ca3af",margin:"0 12px"}}>|</span>
          <span style={{color:"#f59e0b"}}>🖥 physical</span>
          <span style={{color:"#9ca3af",margin:"0 12px"}}>|</span>
          <span style={{color:"#60a5fa"}}>
            {step==="boot"?"Pre-wizard"
            :step==="wizard"?"Wizard intro"
            :step==="step1"?"Step 1/6 — IP"
            :step==="step2"?"Step 2/6 — Interface"
            :step==="step3"?"Step 3/6 — Admin Password"
            :step==="step4"?"Step 4/6 — DB Password"
            :step==="step5"?"Step 5/6 — Keystone Endpoints"
            :step==="step6"?"Step 6/6 — Extra Services"
            :step==="summary"?"Summary"
            :step==="deploying"?`Deploying (${deployLog.length} tasks run)`
            :"Done"}
          </span>
          {config.ip !== "__CHANGE_ME__" && <>
            <span style={{color:"#9ca3af",margin:"0 12px"}}>|</span>
            <span style={{color:"#a3e635"}}>{config.ip}</span>
          </>}
          {config.iface !== "ens3" || step !== "boot" ? null : null}
        </div>
      </div>

      {/* Side panel */}
      <div style={styles.sidePanel}>
        <div style={styles.panelTitle}>How to run this for real</div>

        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>1. Get the scripts</div>
          <div style={styles.codeBlock}>git clone https://github.com/<br/>  your-repo/openstack-complete<br/>cd openstack-complete</div>
        </div>

        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>2. Run the wizard</div>
          <div style={styles.codeBlock}>sudo bash deploy.sh --wizard</div>
          <div style={styles.panelNote}>Works on Ubuntu 20.04+ / Debian 11+ / Mint 21+</div>
        </div>

        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>3. Or skip straight to deploy</div>
          <div style={styles.codeBlock}>sudo bash deploy.sh --full</div>
          <div style={styles.panelNote}>The wizard auto-runs if HOST_IP isn't set yet</div>
        </div>

        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Bare-metal checklist</div>
          {[
            "VT-x / AMD-V on in BIOS",
            "16 GB+ RAM recommended",
            "2 NICs (mgmt + VM traffic)",
            "50 GB+ disk space",
            "Ubuntu/Debian, systemd, kernel 5.4+",
            "Internet access for apt packages",
          ].map(item=>(
            <div key={item} style={styles.checkItem}>
              <span style={{color:"#22c55e",marginRight:8}}>✔</span>
              <span style={{color:"#9ca3af",fontSize:12}}>{item}</span>
            </div>
          ))}
        </div>

        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Other flags</div>
          {[
            ["--dry-run", "Preview all actions"],
            ["--resume",  "Continue a failed run"],
            ["--verify",  "Health check all services"],
            ["--harden",  "CIS security audit"],
            ["--backup",  "Backup all state"],
          ].map(([flag,desc])=>(
            <div key={flag} style={{marginBottom:4}}>
              <span style={{color:"#a3e635",fontFamily:"monospace",fontSize:12}}>{flag}</span>
              <span style={{color:"#6b7280",fontSize:12}}> — {desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: "flex",
    gap: 16,
    padding: 16,
    background: "#0a0a0f",
    minHeight: "100vh",
    fontFamily: "'Courier New', monospace",
    boxSizing: "border-box",
  },
  chrome: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 0 40px rgba(0,255,100,0.08), 0 20px 60px rgba(0,0,0,0.8)",
    border: "1px solid #1f2937",
    minWidth: 0,
  },
  titleBar: {
    background: "#1c1c1e",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: "1px solid #2d2d2d",
  },
  dots: { display:"flex", gap:6 },
  dot: { width:12, height:12, borderRadius:"50%", display:"block" },
  titleText: { color:"#6b7280", fontSize:12, fontFamily:"monospace" },
  terminal: {
    flex: 1,
    background: "#0d1117",
    padding: "16px 20px",
    overflowY: "auto",
    fontSize: 13,
    lineHeight: 1.7,
    color: "#e6edf3",
    minHeight: 500,
    maxHeight: "75vh",
  },
  statusBar: {
    background: "#161b22",
    borderTop: "1px solid #21262d",
    padding: "6px 16px",
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    fontFamily: "monospace",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    margin: "4px 0",
  },
  termInput: {
    background: "transparent",
    border: "none",
    borderBottom: "1px solid #22c55e",
    color: "#22c55e",
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    outline: "none",
    padding: "2px 4px",
    minWidth: 200,
    flex: 1,
  },
  nextBtn: {
    marginTop: 12,
    background: "#166534",
    color: "#bbf7d0",
    border: "1px solid #22c55e",
    borderRadius: 4,
    padding: "8px 20px",
    fontFamily: "monospace",
    fontSize: 13,
    cursor: "pointer",
    letterSpacing: 1,
    transition: "all 0.15s",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    padding: "3px 0",
    borderRadius: 3,
    transition: "background 0.1s",
    userSelect: "none",
  },
  summaryGrid: { marginBottom: 8 },
  strengthRow: { margin: "4px 0 0 0", fontSize: 12 },
  pressEnter: {
    display: "inline-block",
    cursor: "pointer",
    padding: "4px 0",
    outline: "none",
  },
  doneBox: {
    background: "#0f2d1a",
    border: "1px solid #166534",
    borderRadius: 6,
    padding: "14px 20px",
    marginTop: 8,
  },
  sidePanel: {
    width: 260,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  panelTitle: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: "bold",
    fontFamily: "monospace",
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  panelSection: {
    marginBottom: 16,
    borderLeft: "2px solid #1f2937",
    paddingLeft: 12,
  },
  panelLabel: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "monospace",
  },
  codeBlock: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: "6px 10px",
    color: "#a3e635",
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 1.6,
    marginBottom: 4,
    wordBreak: "break-all",
  },
  panelNote: {
    color: "#6b7280",
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 1.5,
  },
  checkItem: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 4,
  },
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
  .banner-block { margin-bottom: 8px; }
  .ascii-art { color: #22c55e; font-size: 10px; line-height: 1.3; margin: 0; white-space: pre; overflow-x: auto; }
  .banner-meta { color: #6b7280; font-size: 12px; margin-top: 4px; }
  .line { margin: 1px 0; white-space: pre-wrap; word-break: break-word; }
  .prompt-line { color: #6b7280; }
  .section-header { margin: 14px 0 4px; }
  .section-header .cyan { font-size: 13px; }
  .section-line { height:1px; background: linear-gradient(to right, #1e4d2b, transparent); margin-top: 3px; width: 360px; }
  .bold   { font-weight: bold; }
  .dim    { color: #6b7280; }
  .red    { color: #ef4444; }
  .green  { color: #22c55e; }
  .yellow { color: #eab308; }
  .blue   { color: #3b82f6; }
  .cyan   { color: #22d3ee; }
  .cursor { color: #22c55e; animation: blink 1s step-end infinite; }
  .cursor-blink { color: #22c55e; animation: blink 0.6s step-end infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
`;
