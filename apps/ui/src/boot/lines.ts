// Boot-line generator (порт из user_input/Loader). Реальная телеметрия устройства
// + системные/devops/app-строки. Длины строк сильно варьируются.

interface NavigatorConnection {
  effectiveType?: string
  downlink?: number
}
interface ExtendedNavigator extends Navigator {
  connection?: NavigatorConnection
  deviceMemory?: number
  userAgentData?: { platform?: string }
}

const LineGen = (() => {
  const HEX = '0123456789abcdef'
  const rand = (n: number): number => Math.floor(Math.random() * n)
  const hex = (n: number): string => Array.from({ length: n }, () => HEX[rand(16)]).join('')
  const pick = <T>(arr: T[]): T => arr[rand(arr.length)]

  function uuid(): string {
    return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`
  }
  function ipv4(): string {
    return `${10 + rand(245)}.${rand(255)}.${rand(255)}.${1 + rand(254)}`
  }
  function ipv6(): string {
    return `${hex(4)}:${hex(4)}:${hex(4)}:${hex(4)}:${hex(4)}:${hex(4)}:${hex(4)}:${hex(4)}`
  }
  function mac(): string {
    return Array.from({ length: 6 }, () => hex(2))
      .join(':')
      .toUpperCase()
  }

  function getGPU(): string {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) return 'software-renderer'
      const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        const r = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL)
        if (r) return String(r)
      }
      return (
        (gl as WebGLRenderingContext).getParameter(WebGLRenderingContext.RENDERER) || 'unknown-gpu'
      )
    } catch (_e) {
      return 'gpu-probe-failed'
    }
  }

  interface DeviceFacts {
    platform: string
    lang: string
    langs: string
    cores: number | string
    mem: string
    screen: string
    avail: string
    vp: string
    dpr: string
    depth: number
    tz: string
    online: string
    eff: string
    down: string
    gpu: string
    now: string
  }

  function deviceFacts(): DeviceFacts {
    const n = navigator as ExtendedNavigator
    const s = screen
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const conn = n.connection || {}
    return {
      platform: n.platform || n.userAgentData?.platform || 'unknown',
      lang: n.language,
      langs: (n.languages || []).join(','),
      cores: n.hardwareConcurrency || '?',
      mem: n.deviceMemory ? `${n.deviceMemory}GB` : 'n/a',
      screen: `${s.width}x${s.height}`,
      avail: `${s.availWidth}x${s.availHeight}`,
      vp: `${innerWidth}x${innerHeight}`,
      dpr: (devicePixelRatio || 1).toFixed(2),
      depth: s.colorDepth,
      tz,
      online: n.onLine ? 'yes' : 'no',
      eff: conn.effectiveType || 'n/a',
      down: conn.downlink ? `${conn.downlink}Mb/s` : 'n/a',
      gpu: getGPU(),
      now: new Date().toISOString(),
    }
  }

  function* sysLines(f: DeviceFacts): Generator<string> {
    yield `mythhand bootloader v4.2.1-stable  build=${hex(7)}  signed-by=mythhand-systems-rsa4096`
    yield 'Copyright (c) MythHand Systems. All rights reserved. Protected under the MythHand End-User Agreement.'
    yield ''
    yield `cpu  topology probe: ${f.cores} logical cores  vendor=GenuineIntel  family=0x6 model=0x${hex(2)} stepping=0x${hex(1)}  microcode=0x${hex(8)}`
    yield 'cpu  features  fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ht tm pbe'
    yield 'cpu  features  avx avx2 avx512f avx512dq avx512cd avx512bw avx512vl rdseed adx clflushopt clwb intel_pt sha_ni'
    yield `mem  controller: ${f.mem} addressable across ${1 + rand(4)} channels  ecc=disabled  speed=${3200 + rand(2000)}MT/s`
    yield 'mem  memmap: 0x0000000000000000-0x000000000009ffff usable, 0x0000000000100000-0x000000007fefffff usable'
    yield ''
    yield `gfx  display.adapter: ${f.gpu}`
    yield `gfx  display.mode: ${f.screen} @ ${f.depth}bpp  dpr=${f.dpr}  refresh=60Hz  hdr=disabled`
    yield `gfx  viewport.constrained: ${f.vp}  available=${f.avail}  pointerlock=available`
    yield `gfx  webgl.extensions: ${pick(['EXT_color_buffer_float', 'OES_texture_float_linear', 'WEBGL_compressed_texture_s3tc', 'ANGLE_instanced_arrays'])}, ${pick(['EXT_disjoint_timer_query_webgl2', 'OES_element_index_uint', 'EXT_float_blend', 'KHR_parallel_shader_compile'])}, +${20 + rand(30)} more`
    yield ''
    yield 'disk mounting /dev/nvme0n1p1 on / type ext4 (rw,relatime,errors=remount-ro,stripe=128,data=ordered)'
    yield 'disk mounting /dev/nvme0n1p2 on /home type ext4 (rw,nosuid,nodev,noatime,commit=600,data=ordered)'
    yield `disk mounting tmpfs on /run type tmpfs (rw,nosuid,nodev,size=${1 + rand(8)}388608k,nr_inodes=819200,mode=755)`
    yield 'disk mounting cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime,nsdelegate,memory_recursiveprot)'
    yield ''
    yield `boot loading initramfs from /boot/initrd.img-${5 + rand(2)}.${rand(20)}.0-${rand(150)}-generic   compressed_size=${20 + rand(40)}M  decompressed=${50 + rand(80)}M`
    yield `boot kernel cmdline: BOOT_IMAGE=/vmlinuz-${5 + rand(2)}.${rand(20)}.0 root=UUID=${uuid()} ro quiet splash mitigations=auto loglevel=3`
    yield ''
    yield `mod  loaded ahci                          ${hex(8)}  size=49152  used_by=2`
    yield `mod  loaded nvme_core                     ${hex(8)}  size=139264 used_by=1`
    yield `mod  loaded i915.display                  ${hex(8)}  size=2867200 used_by=18`
    yield `mod  loaded snd_hda_intel                 ${hex(8)}  size=57344  used_by=4`
    yield `mod  loaded xhci_pci                      ${hex(8)}  size=24576  used_by=0`
    yield `mod  loaded cryptd                        ${hex(8)}  size=24576  used_by=8`
    yield ''
    yield `firmware tpm2: chip rev=2.0  manufacturer=INTC  fw=${rand(99)}.${rand(99)}.${rand(99)}  pcr_extend ok`
    yield ''
    yield 'systemd  pid=1  reached target Local File Systems'
    yield 'systemd  pid=1  reached target Network'
    yield 'systemd  pid=1  reached target Graphical Interface'
    yield `udevd   pid=${300 + rand(400)}  starting version 252.5-1  rules=${30 + rand(40)} matched=${100 + rand(200)}`
    yield ''
    yield `locale ${f.lang}  preferred=${f.langs}  collate=POSIX  numeric=POSIX  ctype=UTF-8`
    yield `time  zone=${f.tz}  rtc_offset=+00:00  ntp_servers=time.cloudflare.com,pool.ntp.org  drift=${(Math.random() * 0.05).toFixed(6)}s`
    yield `net  netlink.uplink state=${f.online}  effective=${f.eff}  downlink=${f.down}  rtt=${5 + rand(40)}ms  loss=0%`
    yield `net  eth0  inet ${ipv4()}/24  brd ${ipv4()}  scope global dynamic noprefixroute`
    yield `net  eth0  inet6 ${ipv6()}/64  scope global  valid_lft 86400sec  preferred_lft 14400sec`
    yield `net  eth0  link/ether ${mac()}  mtu 1500  qdisc fq_codel state UP group default qlen 1000`
    yield 'net  resolver: 1.1.1.1, 8.8.8.8, 9.9.9.9  search=mythhand.local  ndots=1  edns0=enabled  dnssec=permissive'
    yield 'net  firewall.policy applied: 247 rules across 14 chains  default=DROP  log_dropped=true'
  }

  function* devopsLines(): Generator<string> {
    yield `containerd v1.7.${rand(20)}  snapshotter=overlayfs  runtime=io.containerd.runc.v2  cgroup=systemd`
    yield `pulling registry.mythhand.io/release-engine:${1 + rand(9)}.${rand(40)}.${rand(99)}  digest=sha256:${hex(64)}`
    yield `extracting layer ${hex(12)}...  ${1 + rand(30)}MB  decompress=zstd  ${pick(['pulling', 'extracting', 'verified', 'cached'])}`
    yield `extracting layer ${hex(12)}...  ${1 + rand(30)}MB  decompress=zstd  ${pick(['pulling', 'extracting', 'verified', 'cached'])}`
    yield `kube-context  cluster=prod-eu-west-${1 + rand(3)}  namespace=release-pipeline  user=mythhand-svc  token_ttl=8h`
    yield `helm.release  name=artifact-forge  rev=${10 + rand(90)}  status=deployed  values_hash=${hex(12)}`
    yield `feature.flag  rollout/canary-${hex(4)} stuck at ${50 + rand(45)}% for ${5 + rand(40)}m  guard=error_rate>0.01`
    yield `ci.runner  agent-${rand(99)} online  capacity=${rand(8)}/${rand(16)} jobs busy  os=ubuntu-24.04  arch=amd64`
    yield `pipeline.stage build  duration=${30 + rand(180)}s  cache_hit=${pick(['true', 'false'])}  artifacts=${1 + rand(40)}`
    yield `pipeline.stage test   passed=${100 + rand(900)}  failed=${rand(5)}  flaky=${rand(12)}  coverage=${70 + rand(25)}.${rand(99)}%`
    yield `test.suite integration  ${pick(['timeout on db migration after 120s', 'expected 200, got 504 from artifact-forge', 'flake budget exhausted, marking quarantine', 'race condition in shutdown handler'])}`
    yield `pipeline.stage deploy strategy=blue-green  cooldown=300s  health_check=/healthz  rollback_on_p99>${500 + rand(500)}ms`
    yield `prometheus  rule_groups=${20 + rand(40)}  active_alerts=${rand(8)}  scrape_duration_p99=${1 + rand(80)}ms`
    yield `secret.vault  unlocked  policy=release-engine-rw  ttl=8h  approle=ci-runner  lease_id=${uuid()}`
    yield `terraform.plan  0 to add, ${rand(8)} to change, 0 to destroy  workspace=prod`
    yield `sbom.scan    0 critical, ${rand(4)} high, ${rand(20)} medium, ${10 + rand(80)} low  scanner=trivy`
    yield `waiting upstream review on PR #${1000 + rand(9000)}  reviewers=2/2  required=1  age=${1 + rand(48)}h`
    yield `merge.conflict  feature/auth-handshake <-> main  files=${1 + rand(6)}  intervention_required`
    yield `git.fetch  origin/main  ${hex(7)}..${hex(7)}  fast-forward  ${1 + rand(40)} commits  +${10 + rand(900)}/-${10 + rand(900)}`
    yield `artifact.signed  sha256:${hex(64)}  signer=mythhand-build-key-2026  cosign=verified`
    yield 'release.gate code-review=passed  qa=passed  security=pending  compliance=passed'
    yield `cache.warm-up  ${1 + rand(99)}% — populating edge nodes... (${1 + rand(40)} of ${20 + rand(40)} regions)`
    yield `cdn.invalidation  id=${hex(16)}  paths=${1 + rand(40)}  propagation=${rand(120)}s  status=in-progress`
    yield `service.mesh  envoy v1.${rand(40)}.${rand(20)}  active_connections=${100 + rand(9000)}  upstream_p99=${5 + rand(80)}ms`
  }

  function* appLines(): Generator<string> {
    yield 'mythhand.core   initializing subsystem registry  manifest=/etc/mythhand/registry.toml  signature=verified'
    yield `subsystem  input      handshake ok  rev=${hex(8)}  protocol=v3.2  capabilities=keyboard,pointer,gamepad,touch`
    yield `subsystem  render     handshake ok  rev=${hex(8)}  backend=webgl2  msaa=4x  anisotropy=16x`
    yield `subsystem  audio      handshake ok  rev=${hex(8)}  backend=webaudio  sample_rate=48000Hz  buffer=512`
    yield `subsystem  ruleset    handshake ok  rev=${hex(8)}  ruleset=release-at-any-cost-v${1 + rand(4)}.${rand(20)}.${rand(99)}`
    yield `subsystem  netcode    handshake ok  rev=${hex(8)}  transport=webrtc-datachannel  fallback=websocket  tickrate=20Hz`
    yield ''
    yield `loading shader cache: ${100 + rand(500)} programs  size=${1 + rand(40)}MB  compile_time=${10 + rand(900)}ms`
    yield `loading texture atlas: ${1 + rand(40)} pages  total=${10 + rand(80)}MB  format=BC7`
    yield `fontset registered: monospace.iosevka  glyphs=${2000 + rand(2000)}  hinting=full  subpixel=rgb`
    yield ''
    yield `session.token issued  uuid=${uuid()}  expires_in=28800s  scope=play,publish,observe`
    yield `device.fingerprint  hash=${hex(64)}  entropy_sources=4  collected_in=${1 + rand(80)}ms`
    yield ''
    yield `bootstrap complete  total=${(2 + Math.random() * 3).toFixed(3)}s  cold_start=true  next=handover`
  }

  function shuffle(a: string[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
  }

  function buildSequence(): string[] {
    const f = deviceFacts()
    const out: string[] = []

    const sys = Array.from(sysLines(f))
    const sysTake = Math.round(sys.length * 0.8)
    for (let i = 0; i < sysTake; i++) out.push(sys[i])
    out.push('', '', '')

    const devops = Array.from(devopsLines())
    shuffle(devops)
    for (let i = 0; i < Math.min(18, devops.length); i++) {
      out.push(devops[i])
      if (Math.random() < 0.1) out.push('')
    }
    out.push('', '', '')

    const app = Array.from(appLines())
    const appTake = Math.round(app.length * 0.8)
    for (let i = 0; i < appTake; i++) out.push(app[i])
    return out
  }

  return { buildSequence }
})()

export const buildSequence = LineGen.buildSequence
