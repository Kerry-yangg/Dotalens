import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BookOpenCheck,
  Braces,
  Building,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  CircleSlash,
  CircleStop,
  ClipboardCheck,
  Clock3,
  CloudDownload,
  CloudOff,
  Coins,
  Construction,
  Cpu,
  Crosshair,
  DatabaseZap,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCheck,
  FileCheck2,
  FileDown,
  FilePlus2,
  FileSearch2,
  Filter,
  Flower2,
  FolderCheck,
  FolderClock,
  FolderOpen,
  Gamepad2,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Group,
  HeartPulse,
  History,
  Hourglass,
  Info,
  Landmark,
  Layers3,
  LayoutDashboard,
  Link,
  List,
  ListChecks,
  ListFilter,
  ListTree,
  ListX,
  LoaderCircle,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Milestone,
  Minimize2,
  Minus,
  MonitorX,
  MousePointer2,
  MousePointerClick,
  MoveUpRight,
  Navigation,
  Newspaper,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Percent,
  Play,
  PlayCircle,
  PlugZap,
  Plus,
  Radar,
  RefreshCw,
  RotateCw,
  Route,
  RouteOff,
  Scale,
  Scan,
  ScanEye,
  ScanLine,
  ScanSearch,
  Scroll,
  Search,
  SearchCheck,
  Send,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShoppingBag,
  SkipBack,
  SkipForward,
  Skull,
  SlidersHorizontal,
  Sparkles,
  Square,
  Stethoscope,
  Swords,
  Table,
  Target,
  Timeline,
  Timer,
  TimerOff,
  Trees,
  Type,
  UserRound,
  UserRoundSearch,
  Users,
  Watch,
  Wheat,
  WifiOff,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  createIcons,
} from "lucide";
import { GAME_MODES_ZH, heroMeta } from "./hero-meta.js";
import { OFFICIAL_ABILITY_NAMES_ZH, OFFICIAL_ITEM_NAMES_ZH } from "./dota-localization.generated.js";
import {
  activeTaskFromHistory,
  aggregateCombatContributions,
  buildCombatContributionRoster,
  combatContributionChartModel,
  combatContributionDrilldown,
  combatVisionStatus,
  countPlayerLaneWaves,
  createMatchCache,
  coverageImpactFor,
  filterCombatContributionFights,
  formatCountdownSeconds,
  matchHistoryGuidance,
  normalizeMatchCache,
  normalizeMatchSubject,
  normalizePlayerReportInsightOccurrences,
  normalizePlayerReportJumpTarget,
  normalizePlayerStoryVerdict,
  normalizeTaskHistory,
  patchCoverageImpact,
  patchResolutionLabel,
  playerReportUpgradeState,
  recomputePlayerReportScoreAudit,
  resolveMatchListFailure,
  resolvePlayerReportReviewNavigation,
  resourceClockPatchLabel,
  selectOrdinaryPlayerReportContent,
  selectedPlayerIndex,
  simplifyPlayerReportText,
  upsertTaskHistory,
} from "./app-core.js";
import {
  combatContributionChartOption,
  combatResponsibilityRadarOption,
} from "./combat-contribution-chart.js";
import {
  combatContributionAuditScrollTarget,
  combatContributionAccessibleMarkup,
  combatDimensionDetailMarkup,
  combatContributionLabelMarkup,
  combatContributionSampleLabel,
  combatScoreComponentsMarkup,
} from "./combat-contribution-view.js";

const API_BASE = "http://127.0.0.1:5600/api";
const APP_VERSION = "0.4.5";
const HERO_FALLBACK_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 36"><rect width="64" height="36" rx="4" fill="#252b2e"/><circle cx="32" cy="13" r="7" fill="#879296"/><path d="M17 35c1-9 7-14 15-14s14 5 15 14" fill="#879296"/></svg>',
)}`;
const APP_ICONS = {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BookOpenCheck,
  Braces,
  Building,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  CircleSlash,
  CircleStop,
  ClipboardCheck,
  Clock3,
  CloudDownload,
  CloudOff,
  Coins,
  Construction,
  Cpu,
  Crosshair,
  DatabaseZap,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCheck,
  FileCheck2,
  FileDown,
  FilePlus2,
  FileSearch2,
  Filter,
  Flower2,
  FolderCheck,
  FolderClock,
  FolderOpen,
  Gamepad2,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Group,
  HeartPulse,
  History,
  Hourglass,
  Info,
  Landmark,
  Layers3,
  LayoutDashboard,
  Link,
  List,
  ListChecks,
  ListFilter,
  ListTree,
  ListX,
  LoaderCircle,
  LocateFixed,
  Map: MapIcon,
  MapPin,
  Maximize2,
  Milestone,
  Minimize2,
  Minus,
  MonitorX,
  MousePointer2,
  MousePointerClick,
  MoveUpRight,
  Navigation,
  Newspaper,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Percent,
  Play,
  PlayCircle,
  PlugZap,
  Plus,
  Radar,
  RefreshCw,
  RotateCw,
  Route,
  RouteOff,
  Scale,
  Scan,
  ScanEye,
  ScanLine,
  ScanSearch,
  Scroll,
  Search,
  SearchCheck,
  Send,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShoppingBag,
  SkipBack,
  SkipForward,
  Skull,
  SlidersHorizontal,
  Sparkles,
  Square,
  Stethoscope,
  Swords,
  Table,
  Target,
  Timeline,
  Timer,
  TimerOff,
  Trees,
  Type,
  UserRound,
  UserRoundSearch,
  Users,
  Watch,
  Wheat,
  WifiOff,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
};
let chartRuntimePromise = null;
let combatChartResizeObserver = null;

function loadChartRuntime() {
  if (!chartRuntimePromise) {
    chartRuntimePromise = import("./chart-runtime.js");
  }
  return chartRuntimePromise;
}

function setupCombatChartResizeObserver() {
  if (combatChartResizeObserver || !("ResizeObserver" in window)) return;
  const contribution = document.querySelector("#combat-contribution-chart");
  const radar = document.querySelector("#combat-responsibility-radar");
  combatChartResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.contentRect.width < 2 || entry.contentRect.height < 2) return;
      if (entry.target === contribution) {
        if (state.combatContributionChart) state.combatContributionChart.resize();
        else if (state.combatContributionChartModel) {
          void renderCombatContributionChart(state.combatContributionChartModel);
        }
      }
      if (entry.target === radar) {
        if (state.combatResponsibilityRadar) state.combatResponsibilityRadar.resize();
        else if (state.combatResponsibilityRadarModel) {
          void renderCombatResponsibilityRadar(state.combatResponsibilityRadarModel);
        }
      }
    });
  });
  if (contribution) combatChartResizeObserver.observe(contribution);
  if (radar) combatChartResizeObserver.observe(radar);
  window.addEventListener("beforeunload", () => {
    combatChartResizeObserver?.disconnect();
    combatChartResizeObserver = null;
  }, { once: true });
}
const APP_PARAMS = new URLSearchParams(window.location.search);
const PREVIEW_VIEW = APP_PARAMS.get("preview");
const PREVIEW_MATCH_ID = /^\d+$/.test(APP_PARAMS.get("qaMatch") || "") ? APP_PARAMS.get("qaMatch") : null;
const PREVIEW_SCOREBOARD_STRESS = APP_PARAMS.get("scoreboardStress") === "1";
const PREVIEW_SETTINGS_PANEL = APP_PARAMS.get("settingsPanel") || "dota";
const DEFAULT_ACCOUNT_ID = window.localStorage.getItem("dota-lens-account-id") || "";
const DIRECTORY_SETTINGS_KEY = "dota-lens-directory-settings-v1";
const PLAYER_SCORE_MODE_KEY = "dota-lens-player-score-mode-v3";
const SIDEBAR_STATE_KEY = "dota-lens-sidebar-collapsed-v1";
const WARD_TIMELINE_STATE_KEY = "dota-lens-ward-timeline-collapsed-v1";
const TASK_HISTORY_KEY = "dota-lens-task-history-v1";
const MATCH_CACHE_KEY_PREFIX = "dota-lens-match-cache-v1";
const WARD_MAP_ZOOM_MIN = 1;
const WARD_MAP_ZOOM_MAX = 4;
const WARD_MAP_ZOOM_FACTOR = 1.22;
const DEFAULT_PLAYER_SCORE_MODE = window.localStorage.getItem(PLAYER_SCORE_MODE_KEY) === "deep" ? "deep" : "brief";
const SAVED_SIDEBAR_STATE = window.localStorage.getItem(SIDEBAR_STATE_KEY);
const DEFAULT_SIDEBAR_COLLAPSED = SAVED_SIDEBAR_STATE == null
  ? window.matchMedia("(max-width: 1279px)").matches
  : SAVED_SIDEBAR_STATE === "1";

function readStoredJson(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const SAVED_TASK_HISTORY = normalizeTaskHistory(readStoredJson(TASK_HISTORY_KEY, []));
const REAL_ANALYSIS_VIEWS = new Set(["development", "farm", "map", "vision", "build", "combat", "timeline", "player-score", "players", "coverage"]);
const ANALYSIS_MODULES_BY_VIEW = {
  development: ["snapshots"],
  farm: ["farm", "vision"],
  map: ["farm", "vision", "combat"],
  vision: ["vision"],
  build: ["build"],
  combat: ["combat", "vision"],
  timeline: ["timeline"],
  "player-score": ["players", "laning", "farm", "combat", "vision", "build", "timeline", "map"],
  players: ["players"],
  coverage: [],
};
let MATCH_DURATION = 2280;
let MATCH_START_MS = 0;

const HEROES = [
  { slot: 0, team: "radiant", token: "windrunner", name: "风行者", player: "DotaLens", me: true, factor: 1.08, kills: 11, deaths: 3, assists: 12, lh: 248, denies: 18, networth: 18340, gpm: 526, xpm: 612, damage: 28442, taken: 15730, healing: 1840, vision: 16 },
  { slot: 1, team: "radiant", token: "obsidian_destroyer", name: "殁境神蚀者", player: "northern star", factor: 1.03, kills: 8, deaths: 4, assists: 10, lh: 221, denies: 14, networth: 16920, gpm: 487, xpm: 574, damage: 25318, taken: 18864, healing: 320, vision: 7 },
  { slot: 2, team: "radiant", token: "centaur", name: "半人马战行者", player: "Lineholder", factor: 0.93, kills: 4, deaths: 6, assists: 18, lh: 174, denies: 8, networth: 14280, gpm: 424, xpm: 505, damage: 16834, taken: 35218, healing: 920, vision: 9 },
  { slot: 3, team: "radiant", token: "magnataur", name: "马格纳斯", player: "zero point", factor: 0.84, kills: 3, deaths: 5, assists: 21, lh: 96, denies: 4, networth: 10840, gpm: 342, xpm: 448, damage: 12210, taken: 21408, healing: 530, vision: 24 },
  { slot: 4, team: "radiant", token: "phantom_assassin", name: "幻影刺客", player: "PaperMoon", factor: 1.01, kills: 5, deaths: 6, assists: 9, lh: 234, denies: 10, networth: 15850, gpm: 472, xpm: 541, damage: 21780, taken: 19620, healing: 0, vision: 5 },
  { slot: 5, team: "dire", token: "void_spirit", name: "虚无之灵", player: "Riftwalker", factor: 1.0, kills: 9, deaths: 5, assists: 8, lh: 218, denies: 12, networth: 16120, gpm: 465, xpm: 552, damage: 26724, taken: 18240, healing: 0, vision: 7 },
  { slot: 6, team: "dire", token: "wisp", name: "艾欧", player: "tethered", factor: 0.76, kills: 1, deaths: 7, assists: 19, lh: 42, denies: 2, networth: 8240, gpm: 278, xpm: 398, damage: 5812, taken: 16830, healing: 12480, vision: 28 },
  { slot: 7, team: "dire", token: "alchemist", name: "炼金术士", player: "Compound", factor: 1.15, kills: 6, deaths: 4, assists: 7, lh: 286, denies: 7, networth: 19920, gpm: 604, xpm: 588, damage: 22102, taken: 30640, healing: 1180, vision: 4 },
  { slot: 8, team: "dire", token: "mirana", name: "米拉娜", player: "moon trail", factor: 0.86, kills: 3, deaths: 8, assists: 14, lh: 84, denies: 3, networth: 9780, gpm: 316, xpm: 421, damage: 14920, taken: 17320, healing: 450, vision: 31 },
  { slot: 9, team: "dire", token: "tusk", name: "巨牙海民", player: "Snowball", factor: 0.89, kills: 5, deaths: 7, assists: 16, lh: 126, denies: 5, networth: 12150, gpm: 368, xpm: 474, damage: 18330, taken: 24780, healing: 260, vision: 19 },
];

function applyScoreboardStressFixture() {
  if (!PREVIEW_SCOREBOARD_STRESS) return;
  const fixtures = [
    { name: "殁境神蚀者", player: "A-very-long-player-name-123456789", kills: 123, deaths: 45, assists: 678, lh: 1234, denies: 99, networth: 123456, gpm: 1120, xpm: 1499, damage: 123456, taken: 98765, healing: 54321, vision: 128 },
    { name: "半人马战行者", player: "这是一位名字非常长的测试玩家", kills: 0, deaths: 12, assists: 4, lh: 7, denies: null, networth: 6800, gpm: 201, xpm: 305, damage: 980, taken: 100001, healing: 0, vision: 3 },
    { name: "风行者", player: "mixed_CASE-Player.2026", kills: 9, deaths: 0, assists: 17, lh: 388, denies: 31, networth: 44780, gpm: 889, xpm: 905, damage: 76001, taken: 1234, healing: 88, vision: 42 },
  ];
  fixtures.forEach((fixture, index) => Object.assign(HEROES[index], fixture));
}

const MATCH_STATUS_SEQUENCE = [
  "full", "full", "full", "full", "full", "full", "full", "full",
  "aggregate", "aggregate", "aggregate", "aggregate", "aggregate",
  "basic", "basic", "basic", "basic", "processing", "failed", "failed",
];

const MATCH_WIN_SEQUENCE = [true, false, true, true, false, true, false, true, true, false, true, false, false, true, true, false, true, true, false, false];

const DEMO_MATCHES = MATCH_STATUS_SEQUENCE.map((status, index) => {
  const hero = HEROES[index % HEROES.length];
  const duration = 1910 + ((index * 173) % 1180);
  const win = MATCH_WIN_SEQUENCE[index];
  return {
    id: String(7147939538 - index * 103421),
    hero,
    status,
    win,
    kills: 4 + ((index * 7) % 12),
    deaths: 2 + ((index * 5) % 9),
    assists: 7 + ((index * 11) % 19),
    lh: 84 + ((index * 37) % 226),
    denies: 2 + ((index * 3) % 19),
    gpm: 328 + ((index * 29) % 276),
    xpm: 402 + ((index * 31) % 245),
    duration,
    date: `2023-05-${String(Math.max(1, 10 - Math.floor(index / 2))).padStart(2, "0")} ${index % 2 ? "19:42" : "22:14"}`,
    mode: index % 4 === 3 ? "随机征召" : "全英雄选择",
    progress: status === "processing" ? 62 : null,
  };
});

const STATUS_META = {
  full: { label: "完整复盘", detail: "本地 Replay", icon: "circle-check" },
  available: { label: "可自动解析", detail: "Replay 已就绪", icon: "play-circle" },
  aggregate: { label: "可自动解析", detail: "Replay 已就绪", icon: "play-circle" },
  basic: { label: "需要请求", detail: "自动向 OpenDota 请求", icon: "cloud-download" },
  processing: { label: "解析中", detail: "本地任务运行中", icon: "loader-circle" },
  failed: { label: "解析失败", detail: "点击重试", icon: "circle-alert" },
  canceled: { label: "已取消", detail: "可重新解析", icon: "circle-stop" },
};

const ITEMS = {
  branches: { name: "铁树枝干", file: "branches" },
  tango: { name: "树之祭祀", file: "tango" },
  magic_wand: { name: "魔棒", file: "magic_wand" },
  boots: { name: "速度之靴", file: "boots" },
  power_treads: { name: "动力鞋", file: "power_treads" },
  maelstrom: { name: "漩涡", file: "maelstrom" },
  gleipnir: { name: "缚灵索", file: "gleipnir" },
  black_king_bar: { name: "黑皇杖", file: "black_king_bar" },
  blink: { name: "闪烁匕首", file: "blink" },
  hurricane_pike: { name: "飓风长戟", file: "hurricane_pike" },
  ward_observer: { name: "侦查守卫", file: "ward_observer" },
  ward_sentry: { name: "岗哨守卫", file: "ward_sentry" },
};

const ITEM_NAMES_ZH = {
  aghanim_s_shard: "阿哈利姆魔晶",
  aghanims_shard: "阿哈利姆魔晶",
  arcane_boots: "奥术鞋",
  blade_of_alacrity: "欢欣之刃",
  blood_grenade: "血腥榴弹",
  bottle: "魔瓶",
  branches: "铁树枝干",
  boots: "速度之靴",
  chainmail: "锁子甲",
  circlet: "圆环",
  clarity: "净化药水",
  dust: "显影之尘",
  faerie_fire: "仙灵之火",
  guardian_greaves: "卫士胫甲",
  gungir: "冈格尼尔",
  headdress: "恢复头巾",
  magic_stick: "魔棒",
  magic_wand: "魔杖",
  mekansm: "梅肯斯姆",
  ogre_axe: "食人魔之斧",
  point_booster: "精气之球",
  power_treads: "动力鞋",
  ring_of_basilius: "王者之戒",
  ring_of_regen: "回复戒指",
  rod_of_atos: "阿托斯之棍",
  smoke_of_deceit: "诡计之雾",
  sobi_mask: "贤者面罩",
  staff_of_wizardry: "魔力法杖",
  tango: "树之祭祀",
  tpscroll: "回城卷轴",
  ultimate_scepter: "阿哈利姆神杖",
  vitality_booster: "活力之球",
  ward_dispenser: "真假眼组合",
  ward_observer: "侦查守卫",
  ward_sentry: "岗哨守卫",
  wizard_hat: "巫师帽",
  chasm_stone: "深渊石",
  enhancement_brawny: "强健强化",
  madstone_bundle: "狂石束",
  occult_bracelet: "秘术手镯",
  searing_signet: "灼热印戒",
};

const ABILITY_NAMES_ZH = {
  abyssal_underlord_atrophy_aura: "衰退光环",
  abyssal_underlord_dark_portal: "恶魔之扉",
  abyssal_underlord_firestorm: "火焰风暴",
  abyssal_underlord_pit_of_malice: "怨念深渊",
  abyssal_underlord_portal_warp: "穿越恶魔之扉",
  abyssal_underlord_raid_boss: "团队首领",
  riki_blink_strike: "闪烁突袭",
  riki_innate_backstab: "背刺",
  riki_smoke_screen: "烟幕",
  riki_tricks_of_the_trade: "绝杀秘技",
  shadow_shaman_shackles: "枷锁",
  shadow_shaman_voodoo: "妖术",
  slark_dark_pact: "黑暗契约",
  slark_pounce: "突袭",
  monkey_king_boundless_strike: "棒击大地",
  oracle_fortunes_end: "气运之末",
  oracle_purifying_flames: "涤罪之焰",
  pugna_decrepify: "衰老",
  pugna_nether_blast: "幽冥爆轰",
  pugna_nether_ward: "幽冥守卫",
  attack: "普通攻击",
};

const REGION_NAMES_ZH = {
  radiant_base: "天辉基地",
  dire_base: "夜魇基地",
  radiant_jungle: "天辉野区",
  dire_jungle: "夜魇野区",
  mid_lane: "中路",
  mid_river: "中路河道",
  top_lane: "上路",
  bottom_lane: "下路",
  river: "河道",
  dead: "阵亡",
  unknown: "未知区域",
};

const GOLD_REASON_NAMES_ZH = {
  11: "建筑收益",
  12: "英雄击杀",
  13: "小兵补刀",
  14: "中立生物",
  15: "肉山收益",
  16: "信使击杀",
  17: "赏金神符",
  18: "共享金钱",
  19: "技能收益",
  20: "拆眼收益",
  21: "信使奖励",
};

const ITEM_EVENTS = [
  { time: 0, key: "branches", action: "初始装备", value: 50 },
  { time: 0, key: "tango", action: "初始装备", value: 90 },
  { time: 145, key: "magic_wand", action: "合成", value: 450 },
  { time: 224, key: "boots", action: "购买", value: 500 },
  { time: 382, key: "power_treads", action: "合成", value: 1400 },
  { time: 702, key: "maelstrom", action: "合成", value: 2950 },
  { time: 1048, key: "hurricane_pike", action: "合成", value: 4450 },
  { time: 1324, key: "black_king_bar", action: "合成", value: 4050 },
  { time: 1738, key: "gleipnir", action: "升级", value: 5450 },
  { time: 2012, key: "blink", action: "购买", value: 2250 },
];

const ABILITY_EVENTS = [
  { time: 0, key: "windrunner_powershot", name: "强力击", level: 1 },
  { time: 108, key: "windrunner_windrun", name: "风行", level: 1 },
  { time: 202, key: "windrunner_powershot", name: "强力击", level: 2 },
  { time: 314, key: "windrunner_shackleshot", name: "束缚击", level: 1 },
  { time: 426, key: "windrunner_focusfire", name: "集中火力", level: 1 },
  { time: 588, key: "windrunner_powershot", name: "强力击", level: 3 },
  { time: 744, key: "windrunner_windrun", name: "风行", level: 2 },
  { time: 918, key: "windrunner_shackleshot", name: "束缚击", level: 2 },
  { time: 1098, key: "windrunner_focusfire", name: "集中火力", level: 2 },
];

const SEGMENTS = [
  { id: "seg-1", start: 0, end: 112, type: "lane", title: "优势路第一波", region: "天辉优势路", gold: 286, xp: 342, creeps: 7, missed: 1, confidence: "事实", x: 29, y: 82 },
  { id: "seg-2", start: 113, end: 226, type: "lane", title: "塔前控线", region: "天辉优势路", gold: 318, xp: 405, creeps: 8, missed: 0, confidence: "事实", x: 43, y: 80 },
  { id: "seg-3", start: 227, end: 292, type: "farm", title: "小野营地", region: "天辉下路小野", gold: 112, xp: 138, creeps: 3, missed: 2, confidence: "高", x: 39, y: 69 },
  { id: "seg-4", start: 293, end: 414, type: "lane", title: "回线补刀", region: "天辉优势路", gold: 364, xp: 440, creeps: 9, missed: 1, confidence: "事实", x: 53, y: 79 },
  { id: "seg-5", start: 415, end: 508, type: "farm", title: "主野区双营", region: "天辉主野区", gold: 224, xp: 292, creeps: 6, missed: 3, confidence: "高", x: 47, y: 61 },
  { id: "seg-6", start: 509, end: 612, type: "lane", title: "中路接线", region: "中路河道", gold: 338, xp: 472, creeps: 8, missed: 0, confidence: "事实", x: 54, y: 53 },
  { id: "seg-7", start: 613, end: 728, type: "farm", title: "夜魇主野区", region: "夜魇主野区", gold: 318, xp: 356, creeps: 8, missed: 2, confidence: "中", x: 65, y: 39 },
  { id: "seg-8", start: 729, end: 804, type: "combat", title: "主野区遭遇战", region: "夜魇主野区", gold: 412, xp: 520, creeps: 0, missed: 1, confidence: "事实", x: 70, y: 34 },
  { id: "seg-9", start: 805, end: 946, type: "farm", title: "远古营地", region: "夜魇远古区", gold: 388, xp: 486, creeps: 7, missed: 4, confidence: "高", x: 72, y: 25 },
  { id: "seg-10", start: 947, end: 1104, type: "lane", title: "中路推进", region: "夜魇中路二塔", gold: 416, xp: 532, creeps: 10, missed: 1, confidence: "事实", x: 67, y: 43 },
  { id: "seg-11", start: 1105, end: 1276, type: "farm", title: "三角区循环", region: "天辉远古区", gold: 462, xp: 578, creeps: 9, missed: 3, confidence: "高", x: 37, y: 68 },
  { id: "seg-12", start: 1277, end: 1450, type: "combat", title: "肉山河道团战", region: "肉山巢穴", gold: 668, xp: 814, creeps: 0, missed: 2, confidence: "事实", x: 57, y: 46 },
  { id: "seg-13", start: 1451, end: 1708, type: "lane", title: "下路高地推进", region: "夜魇下路高地", gold: 724, xp: 640, creeps: 13, missed: 0, confidence: "事实", x: 81, y: 24 },
  { id: "seg-14", start: 1709, end: 2280, type: "combat", title: "终局推进", region: "夜魇基地", gold: 1540, xp: 1320, creeps: 15, missed: 1, confidence: "事实", x: 88, y: 12 },
];

const ROUTE_POINTS = [
  [0, 19, 84], [90, 25, 82], [180, 38, 81], [270, 40, 69], [360, 49, 78],
  [450, 47, 61], [540, 54, 53], [630, 61, 44], [720, 68, 37], [810, 72, 29],
  [900, 73, 24], [990, 67, 42], [1080, 58, 48], [1170, 39, 65], [1260, 48, 55],
  [1350, 58, 45], [1440, 65, 40], [1530, 77, 27], [1620, 82, 23], [1710, 68, 37],
  [1800, 74, 31], [1890, 80, 24], [1980, 83, 20], [2100, 87, 15], [2280, 91, 10],
];

const WARD_RECORDS = [
  { id: "ward-01", team: "radiant", playerSlot: 0, placedAt: 62, endedAt: 422, type: "observer", purpose: "defense", region: "天辉优势路", x: 30, y: 79, detections: 3, uniqueEnemies: 2, dewards: 0, conversions: 0, overlap: 8, score: 61, endReason: "自然消失", objective: "对线保护" },
  { id: "ward-02", team: "dire", playerSlot: 8, placedAt: 118, endedAt: 446, type: "observer", purpose: "offense", region: "天辉主野区", x: 40, y: 67, detections: 5, uniqueEnemies: 3, dewards: 0, conversions: 1, overlap: 18, score: 72, endReason: "被反眼", objective: "野区入侵" },
  { id: "ward-03", team: "radiant", playerSlot: 2, placedAt: 206, endedAt: 626, type: "sentry", purpose: "defense", region: "天辉主野区", x: 45, y: 61, detections: 1, uniqueEnemies: 1, dewards: 1, conversions: 0, overlap: 22, score: 58, endReason: "自然消失", objective: "保护拉野" },
  { id: "ward-04", team: "dire", playerSlot: 6, placedAt: 264, endedAt: 598, type: "sentry", purpose: "offense", region: "中路河道", x: 50, y: 52, detections: 2, uniqueEnemies: 1, dewards: 1, conversions: 0, overlap: 12, score: 67, endReason: "被反眼", objective: "符点控制" },
  { id: "ward-05", team: "radiant", playerSlot: 3, placedAt: 352, endedAt: 712, type: "observer", purpose: "offense", region: "夜魇野区入口", x: 60, y: 43, detections: 6, uniqueEnemies: 4, dewards: 0, conversions: 1, overlap: 11, score: 84, endReason: "自然消失", objective: "入口侦察" },
  { id: "ward-06", team: "dire", playerSlot: 8, placedAt: 421, endedAt: 781, type: "observer", purpose: "defense", region: "夜魇中路一塔", x: 61, y: 40, detections: 4, uniqueEnemies: 2, dewards: 0, conversions: 0, overlap: 28, score: 65, endReason: "自然消失", objective: "中路防守" },
  { id: "ward-07", team: "radiant", playerSlot: 3, placedAt: 613, endedAt: 973, type: "observer", purpose: "offense", region: "夜魇主野区", x: 67, y: 33, detections: 9, uniqueEnemies: 5, dewards: 0, conversions: 2, overlap: 9, score: 93, endReason: "被反眼", objective: "主野区入侵" },
  { id: "ward-08", team: "radiant", playerSlot: 4, placedAt: 688, endedAt: 1108, type: "sentry", purpose: "offense", region: "夜魇主野区", x: 70, y: 32, detections: 1, uniqueEnemies: 1, dewards: 2, conversions: 1, overlap: 24, score: 78, endReason: "自然消失", objective: "入侵反眼" },
  { id: "ward-09", team: "dire", playerSlot: 9, placedAt: 742, endedAt: 1122, type: "sentry", purpose: "defense", region: "夜魇主野区", x: 65, y: 35, detections: 2, uniqueEnemies: 2, dewards: 1, conversions: 0, overlap: 31, score: 64, endReason: "被反眼", objective: "野区防守" },
  { id: "ward-10", team: "dire", playerSlot: 6, placedAt: 824, endedAt: 1184, type: "observer", purpose: "offense", region: "天辉三角区", x: 38, y: 67, detections: 7, uniqueEnemies: 4, dewards: 0, conversions: 2, overlap: 7, score: 88, endReason: "被反眼", objective: "远古区入侵" },
  { id: "ward-11", team: "radiant", playerSlot: 3, placedAt: 976, endedAt: 1336, type: "observer", purpose: "defense", region: "肉山河道", x: 56, y: 46, detections: 5, uniqueEnemies: 3, dewards: 0, conversions: 1, overlap: 14, score: 82, endReason: "自然消失", objective: "肉山前置" },
  { id: "ward-12", team: "dire", playerSlot: 8, placedAt: 1052, endedAt: 1412, type: "observer", purpose: "defense", region: "肉山上坡", x: 59, y: 43, detections: 6, uniqueEnemies: 4, dewards: 0, conversions: 1, overlap: 19, score: 89, endReason: "被反眼", objective: "肉山控制" },
  { id: "ward-13", team: "radiant", playerSlot: 3, placedAt: 1124, endedAt: 1544, type: "sentry", purpose: "offense", region: "肉山巢穴", x: 55, y: 46, detections: 2, uniqueEnemies: 2, dewards: 2, conversions: 1, overlap: 26, score: 86, endReason: "自然消失", objective: "肉山反眼" },
  { id: "ward-14", team: "dire", playerSlot: 9, placedAt: 1218, endedAt: 1638, type: "sentry", purpose: "defense", region: "夜魇三角区", x: 72, y: 25, detections: 1, uniqueEnemies: 1, dewards: 0, conversions: 0, overlap: 34, score: 52, endReason: "自然消失", objective: "远古区保护" },
  { id: "ward-15", team: "radiant", playerSlot: 3, placedAt: 1338, endedAt: 1698, type: "observer", purpose: "offense", region: "夜魇下路高地", x: 77, y: 27, detections: 8, uniqueEnemies: 5, dewards: 0, conversions: 2, overlap: 10, score: 91, endReason: "被反眼", objective: "高地推进" },
  { id: "ward-16", team: "dire", playerSlot: 6, placedAt: 1452, endedAt: 1812, type: "observer", purpose: "defense", region: "夜魇下路高地", x: 80, y: 24, detections: 5, uniqueEnemies: 3, dewards: 0, conversions: 1, overlap: 17, score: 79, endReason: "被反眼", objective: "高地防守" },
  { id: "ward-17", team: "radiant", playerSlot: 2, placedAt: 1534, endedAt: 1954, type: "sentry", purpose: "offense", region: "夜魇高地坡", x: 82, y: 22, detections: 1, uniqueEnemies: 1, dewards: 1, conversions: 0, overlap: 21, score: 74, endReason: "自然消失", objective: "高地反眼" },
  { id: "ward-18", team: "dire", playerSlot: 8, placedAt: 1640, endedAt: 2060, type: "sentry", purpose: "defense", region: "夜魇基地入口", x: 85, y: 18, detections: 2, uniqueEnemies: 2, dewards: 1, conversions: 0, overlap: 29, score: 66, endReason: "自然消失", objective: "基地防守" },
  { id: "ward-19", team: "radiant", playerSlot: 0, placedAt: 1754, endedAt: 2114, type: "observer", purpose: "offense", region: "夜魇基地入口", x: 87, y: 15, detections: 7, uniqueEnemies: 4, dewards: 0, conversions: 2, overlap: 12, score: 87, endReason: "被反眼", objective: "终局推进" },
  { id: "ward-20", team: "dire", playerSlot: 9, placedAt: 1886, endedAt: 2246, type: "observer", purpose: "defense", region: "夜魇遗迹", x: 90, y: 12, detections: 6, uniqueEnemies: 4, dewards: 0, conversions: 1, overlap: 16, score: 75, endReason: "自然消失", objective: "遗迹防守" },
].map((ward, wardIndex) => {
  const enemySlots = ward.team === "radiant" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const eventSpan = Math.max(24, ward.endedAt - ward.placedAt - 24);
  const detectionEvents = Array.from({ length: ward.detections }, (_, eventIndex) => ({
    id: `${ward.id}-detect-${eventIndex + 1}`,
    time: Math.min(ward.endedAt - 4, ward.placedAt + 12 + Math.round(((eventIndex + 1) * eventSpan) / (ward.detections + 1))),
    heroSlot: enemySlots[(eventIndex + wardIndex) % ward.uniqueEnemies],
  }));
  return { ...ward, detectionEvents, radius: ward.type === "observer" ? 1600 : 1050 };
});

const WARD_EVENTS = WARD_RECORDS.map((ward) => ({
  time: ward.placedAt,
  x: ward.x,
  y: ward.y,
  type: "ward",
  title: `${ward.type === "observer" ? "侦查守卫" : "岗哨守卫"} · ${ward.region}`,
}));

const UNIT_KILL_STATS = [
  { slot: 0, hero: 11, lane: 162, neutral: 76, ancient: 17, tower: 4, courier: 0, roshan: 1, observer: 0, necro: 0, other: "2 召唤物" },
  { slot: 1, hero: 8, lane: 142, neutral: 83, ancient: 12, tower: 3, courier: 0, roshan: 0, observer: 1, necro: 0, other: "1 熔炉精灵" },
  { slot: 2, hero: 4, lane: 175, neutral: 87, ancient: 8, tower: 0, courier: 0, roshan: 0, observer: 0, necro: 0, other: "—" },
  { slot: 3, hero: 3, lane: 31, neutral: 25, ancient: 2, tower: 0, courier: 1, roshan: 0, observer: 2, necro: 0, other: "—" },
  { slot: 4, hero: 5, lane: 168, neutral: 58, ancient: 11, tower: 2, courier: 0, roshan: 0, observer: 0, necro: 0, other: "—" },
  { slot: 5, hero: 9, lane: 146, neutral: 68, ancient: 14, tower: 3, courier: 0, roshan: 0, observer: 1, necro: 0, other: "—" },
  { slot: 6, hero: 1, lane: 8, neutral: 12, ancient: 0, tower: 0, courier: 1, roshan: 0, observer: 4, necro: 0, other: "—" },
  { slot: 7, hero: 6, lane: 214, neutral: 109, ancient: 26, tower: 4, courier: 0, roshan: 1, observer: 0, necro: 0, other: "3 召唤物" },
  { slot: 8, hero: 3, lane: 42, neutral: 31, ancient: 1, tower: 0, courier: 1, roshan: 0, observer: 3, necro: 0, other: "—" },
  { slot: 9, hero: 5, lane: 66, neutral: 39, ancient: 4, tower: 1, courier: 0, roshan: 0, observer: 2, necro: 0, other: "—" },
];

const FARM_HEAT_CELLS = [
  { id: "farm-heat-01", start: 0, end: 240, source: "lane", region: "天辉优势路外塔", x: 21, y: 84, gold: 620, units: 14 },
  { id: "farm-heat-02", start: 180, end: 480, source: "lane", region: "天辉优势路塔前", x: 37, y: 81, gold: 980, units: 22 },
  { id: "farm-heat-03", start: 300, end: 600, source: "neutral", region: "天辉下路小野", x: 40, y: 68, gold: 410, units: 9 },
  { id: "farm-heat-04", start: 480, end: 720, source: "lane", region: "中路河道", x: 52, y: 54, gold: 760, units: 17 },
  { id: "farm-heat-05", start: 600, end: 900, source: "neutral", region: "夜魇主野区", x: 67, y: 34, gold: 1280, units: 28 },
  { id: "farm-heat-06", start: 720, end: 1020, source: "neutral", region: "夜魇远古区", x: 72, y: 25, gold: 840, units: 14 },
  { id: "farm-heat-07", start: 900, end: 1200, source: "lane", region: "夜魇中路二塔", x: 64, y: 43, gold: 720, units: 16 },
  { id: "farm-heat-08", start: 1080, end: 1380, source: "combat", region: "肉山河道", x: 57, y: 46, gold: 580, units: 4 },
  { id: "farm-heat-09", start: 1200, end: 1500, source: "neutral", region: "天辉三角区", x: 37, y: 68, gold: 960, units: 18 },
  { id: "farm-heat-10", start: 1320, end: 1560, source: "combat", region: "肉山巢穴", x: 58, y: 44, gold: 810, units: 5 },
  { id: "farm-heat-11", start: 1440, end: 1740, source: "lane", region: "夜魇下路高地", x: 78, y: 26, gold: 1240, units: 27 },
  { id: "farm-heat-12", start: 1560, end: 1860, source: "neutral", region: "夜魇主野双营", x: 70, y: 32, gold: 580, units: 12 },
  { id: "farm-heat-13", start: 1740, end: 2040, source: "lane", region: "夜魇基地入口", x: 87, y: 15, gold: 1480, units: 31 },
  { id: "farm-heat-14", start: 1860, end: 2160, source: "lane", region: "夜魇高地兵线", x: 82, y: 23, gold: 1030, units: 23 },
  { id: "farm-heat-15", start: 1980, end: 2280, source: "neutral", region: "夜魇三角区", x: 72, y: 26, gold: 620, units: 13 },
  { id: "farm-heat-16", start: 2040, end: 2280, source: "combat", region: "夜魇遗迹", x: 76, y: 34, gold: 540, units: 4 },
];

const FARM_DIAGNOSTICS = [
  { id: "farm-d1", time: 286, title: "小野停留过久", decision: "switch", actual: "等待小野刷新", recommendation: "回优势路接线", actualGold: 86, suggestedGold: 214, risk: 18, confidence: 89, targetX: 43, targetY: 80, laneCreeps: 6, travelSeconds: 19, expiresIn: 46, visible: [5, 6, 8], missing: [7, 9], wardIds: ["ward-01"], reason: "兵线仍在己方塔前，敌方三人出现在中路与下河道；继续等待营地刷新会产生无收益空窗。" },
  { id: "farm-d2", time: 508, title: "中路安全线未收", decision: "switch", actual: "主野区双营", recommendation: "中路塔下收线", actualGold: 224, suggestedGold: 352, risk: 24, confidence: 86, targetX: 54, targetY: 53, laneCreeps: 7, travelSeconds: 22, expiresIn: 52, visible: [5, 8, 9], missing: [6, 7], wardIds: ["ward-05"], reason: "中路兵线将在塔下损失，己方入口眼覆盖河道；两名失踪英雄从最后位置赶到中路的时间大于兵线处理时间。" },
  { id: "farm-d3", time: 744, title: "高价值兵线未收", decision: "switch", actual: "夜魇主野区游走", recommendation: "传送上路二塔接线", actualGold: 178, suggestedGold: 324, risk: 22, confidence: 92, targetX: 73, targetY: 24, laneCreeps: 8, travelSeconds: 18, expiresIn: 43, visible: [5, 6, 8, 9], missing: [7], wardIds: ["ward-07", "ward-08"], reason: "四名敌方英雄已被进攻眼看到，唯一失踪的炼金术士最后出现在远端野区；上路两波兵线可在 43 秒内安全处理。" },
  { id: "farm-d4", time: 1132, title: "正确放弃危险兵线", decision: "correct", actual: "三角区刷远古", recommendation: "继续当前路线", actualGold: 342, suggestedGold: 342, risk: 78, confidence: 88, targetX: 37, targetY: 68, laneCreeps: 7, travelSeconds: 0, expiresIn: 39, visible: [5, 8], missing: [6, 7, 9], wardIds: ["ward-11"], reason: "地图上只有两名敌人可见，三名带先手能力的英雄失踪；看似空闲的上路兵线处于无视野区，放弃它是正确选择。" },
  { id: "farm-d5", time: 1456, title: "河道等待成本过高", decision: "switch", actual: "肉山河道等待队友", recommendation: "清下路兵线后集合", actualGold: 104, suggestedGold: 342, risk: 31, confidence: 81, targetX: 77, targetY: 27, laneCreeps: 8, travelSeconds: 16, expiresIn: 55, visible: [5, 6, 8], missing: [7, 9], wardIds: ["ward-13", "ward-15"], reason: "肉山入口已有真眼和推进眼覆盖，队友尚需 28 秒到位；先处理下路兵线仍能按时回到目标区域。" },
  { id: "farm-d6", time: 1874, title: "推进后资源空窗", decision: "watch", actual: "高地前往返", recommendation: "清夜魇三角区双营", actualGold: 92, suggestedGold: 214, risk: 36, confidence: 77, targetX: 72, targetY: 26, laneCreeps: 0, travelSeconds: 21, expiresIn: 60, visible: [5, 6, 9], missing: [7, 8], wardIds: ["ward-19"], reason: "推进暂停后出现 38 秒空窗，但两名敌方英雄失踪；三角区有己方视野，可清理靠外营地，不建议深入基地入口。" },
];

const FARM_MECHANICS = {
  patch_baseline: "7.41d",
  lane_spawn_first: 0,
  lane_spawn_interval: 30,
  neutral_spawn_first: 60,
  neutral_spawn_interval: 60,
  lotus_first: 180,
  lotus_interval: 180,
  bounty_first: 0,
  bounty_interval: 240,
  water_rune_first: 120,
  water_rune_last: 240,
  power_rune_first: 360,
  power_rune_interval: 120,
  wisdom_first: 420,
  wisdom_interval: 420,
  tormentor_first: 1200,
};

const FARM_STACK_EVENTS = [];
const FARM_LANE_JUNGLE_CYCLES = [];
const FARM_CREEP_RESOLUTIONS = [];
const FARM_LANE_OPPORTUNITY = { summary: {}, events: [] };
const FARM_STACK_VALUE_SUMMARY = {};
const FARM_LANE_WAVES = Array.from({ length: 18 }, (_, index) => ({
  id: `demo-wave-${index}`,
  expected_spawn: index * 30,
  lane: ["top", "mid", "bottom"][index % 3],
  state: index % 5 === 0 ? "visibility_lost" : "observed_cleared",
}));
const FARM_CAMP_STATES = [
  { id: "demo-camp-1", x: 40, y: 68, region: "radiant_jungle", observations: [{ cycle_start: 720, observed_enter_start: 721, transitions: [{ time: 721, state: "observed_present" }, { time: 748, state: "observed_cleared" }] }] },
  { id: "demo-camp-2", x: 47, y: 61, region: "radiant_jungle", observations: [{ cycle_start: 720, observed_enter_start: 724, transitions: [{ time: 724, state: "observed_present" }] }] },
  { id: "demo-camp-3", x: 67, y: 34, region: "dire_jungle", observations: [{ cycle_start: 720, observed_enter_start: 728, transitions: [{ time: 728, state: "observed_present" }, { time: 739, state: "visibility_lost" }] }] },
  { id: "demo-camp-4", x: 72, y: 25, region: "dire_jungle", observations: [] },
];

const COMBAT_SEGMENTS = [
  { id: "fight-1", start: 421, end: 438, title: "中路河道先手", result: "1 换 0", tone: "positive", location: "中路河道", damage: 1820 },
  { id: "fight-2", start: 761, end: 786, title: "夜魇主野区遭遇战", result: "2 换 0", tone: "positive", location: "夜魇主野区", damage: 3842 },
  { id: "fight-3", start: 1012, end: 1048, title: "中路二塔反打", result: "1 换 2", tone: "negative", location: "夜魇中路二塔", damage: 2954 },
  { id: "fight-4", start: 1298, end: 1340, title: "肉山河道团战", result: "3 换 1", tone: "positive", location: "肉山巢穴", damage: 5264 },
  { id: "fight-5", start: 1572, end: 1618, title: "夜魇下路高地", result: "2 换 2", tone: "info", location: "夜魇下路高地", damage: 4718 },
  { id: "fight-6", start: 2078, end: 2142, title: "终局基地团战", result: "4 换 1", tone: "positive", location: "夜魇基地", damage: 6830 },
];

const CAMP_MARKERS = SEGMENTS.filter((segment) => segment.type === "farm").map((segment) => ({
  time: segment.start,
  x: segment.x,
  y: segment.y,
  type: "camp",
  title: segment.title,
}));

const OBJECTIVE_EVENTS = [
  { time: 646, x: 64, y: 42, type: "objective", title: "夜魇中路一塔" },
  { time: 1308, x: 56, y: 45, type: "objective", title: "击杀肉山" },
  { time: 1612, x: 82, y: 24, type: "objective", title: "夜魇下路兵营" },
  { time: 2118, x: 89, y: 12, type: "objective", title: "夜魇遗迹" },
];

const ROSHAN_ATTEMPTS = [];
const AEGIS_LIFECYCLES = [];

const COMBAT_CONTEXT_NAMES = {
  lane_context: "兵线区域",
  gank: "多人抓单",
  solo_kill: "单杀",
  tp_support: "TP 支援",
  tp_arrival: "TP 到场",
  chase: "持续追击",
  high_intensity: "高强度",
};

const COMBAT_REASON_NAMES = {
  high_commitment_no_death: "高投入但没有减员",
  lane_reciprocal_trade: "兵线区域双方有效换血",
  low_commitment_lane_harass: "兵线区域低投入消耗",
  non_lane_poke: "非兵线区域短暂接触",
  two_vs_two_cap: "2v2 固定为小规模冲突",
  teamfight_gate_passed: "通过多人团战硬门槛",
  isolated_target_gank: "多人集中攻击孤立目标",
  solo_kill: "1v1 产生击杀",
  focused_kill: "伤害集中并产生单次减员",
  teamfight_gate_not_met: "未通过团战硬门槛",
  insufficient_teamfight_participants: "团战参与人数不足",
};

const COMBAT_PHASE_NAMES = {
  setup: "准备",
  initiation: "先手",
  clash: "交战",
  cleanup: "收尾",
  conversion: "转化",
};

const COMBAT_IMPORTANCE_META = {
  routine: { label: "常规", className: "routine" },
  important: { label: "重要", className: "important" },
  critical: { label: "关键", className: "critical" },
};

const COMBAT_IMPORTANCE_REASON_NAMES = {
  multi_hero_elimination: "多人减员",
  major_networth_swing: "经济大幅摆动",
  networth_lead_changed: "经济领先易手",
  objective_conversion: "战后目标转化",
  roshan_or_aegis_conversion: "肉山或盾转化",
  tp_support_commitment: "投入 TP 支援",
  base_fight: "基地关键战",
  high_intensity: "高强度交战",
  limited_strategic_impact: "战略影响有限",
};

const TP_STATUS_NAMES = {
  interrupted: "引导被打断",
  completed_support: "完成并参战",
  completed_nearby: "落地未行动",
  completed_elsewhere: "异地完成",
  completed_landing_unobserved: "完成但落点缺失",
  channel_unresolved: "引导结果缺失",
  unconfirmed: "未确认",
};

const TP_OUTCOME_NAMES = {
  counterkill_or_trade: "形成反杀或交换",
  save_or_stabilize: "保护低血量队友存活",
  response_with_allied_losses: "到场后仍有队友阵亡",
  stabilized_without_kill: "稳定战场但无减员",
  no_effect_confirmed: "未确认战斗效果",
};

const TOWER_CONTEXT_NAMES = {
  confirmed_dive: "确认越塔交战",
  tower_zone_fight: "塔区交战，未确认越塔",
  near_live_tower: "存活防御塔附近",
  destroyed_tower_zone: "已失守塔区交战",
};

const ROSHAN_CLASS_NAMES = {
  probe_or_fake_attempt: "试探或假打肉山",
  abandoned_attempt: "中止肉山尝试",
  uncontested_roshan: "无人争夺肉山",
  contested_roshan: "肉山争夺",
  roshan_teamfight: "肉山团战",
  roshan_steal: "抢到肉山",
};

const AEGIS_STATE_NAMES = {
  active_at_match_end: "比赛结束仍持有",
  consumed_on_death: "阵亡触发复活",
  consumed_before_expiry: "到期前触发复活",
  expired_or_reclaimed: "五分钟到期回收",
  removed_reason_unknown: "消失原因待核对",
};

const state = {
  page: "matches",
  sidebarCollapsed: DEFAULT_SIDEBAR_COLLAPSED,
  wardSideView: "list",
  wardTimelineCollapsed: window.localStorage.getItem(WARD_TIMELINE_STATE_KEY) === "1",
  farmCompactView: "map",
  buildCompactView: "tracks",
  combatCompactView: "context",
  playerScoreEvidenceOpen: false,
  playerReportView: "facts",
  accountId: DEFAULT_ACCOUNT_ID,
  matches: [],
  matchesStatus: "idle",
  matchesError: "",
  matchesOffline: false,
  matchesAvailability: null,
  matchesFetchedAt: null,
  parserOnline: false,
  parserStatus: null,
  currentMatch: null,
  currentAnalysis: null,
  activeJob: activeTaskFromHistory(SAVED_TASK_HISTORY),
  taskHistory: SAVED_TASK_HISTORY,
  jobPollTimer: null,
  parserPollTimer: null,
  detailView: "development",
  matchFilter: "all",
  eventFilter: "all",
  segmentFilter: "all",
  settingsPanel: "account",
  selectedHeroSlot: 0,
  playerScoreMode: DEFAULT_PLAYER_SCORE_MODE,
  playerScoreSection: "overview",
  playerScoreRosterFilter: "all",
  selectedPlayerScoreEvidence: null,
  playerReportReviewWindow: null,
  selectedSegmentId: "seg-7",
  selectedCombatId: "fight-2",
  selectedCombatPlayerSlot: 0,
  selectedWardId: "ward-07",
  selectedFarmDiagnosticId: "farm-d3",
  farmTimeWindow: "pre20",
  farmSource: "all",
  farmTeam: "winner",
  wardFilters: { team: "all", player: "all", type: "all", purpose: "all" },
  wardLayers: { ranges: true, detections: true },
  wardMapZoom: WARD_MAP_ZOOM_MIN,
  wardMapPan: { x: 0, y: 0 },
  wardMapExpanded: false,
  currentTime: 744,
  playheadMs: 744000,
  isPlaying: false,
  playbackRate: 1,
  metric: "networth",
  chart: null,
  chartZoom: [0, 100],
  timer: null,
  devLayers: { camps: true, events: true },
  mapLayers: { trail: true, heat: false, camps: true, wards: true, combat: true, objectives: true },
  snapshotCache: new Map(),
  analysisModuleLoads: new Map(),
  visibilityByTeam: {},
  mapCalibration: null,
  filteredEvents: [],
  replays: [],
  developmentSideView: "lane",
  combatInspectorView: "audit",
  combatFilter: "all",
  combatContributionScope: "current",
  combatContributionMetric: "responsibility",
  combatContributionChart: null,
  combatContributionChartModel: null,
  combatResponsibilityRadar: null,
  combatResponsibilityRadarModel: null,
  combatResponsibilityRadarRenderToken: 0,
  selectedCombatContributionDimension: "responsibility",
  combatContributionRenderToken: 0,
  selectedCombatPhase: "clash",
  pendingMatch: null,
  pendingSubjectAnalysis: null,
  pendingSubjectMatch: null,
  pendingSubjectSlot: null,
  pendingSubjectRequired: false,
};

const wardMapDrag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  panX: 0,
  panY: 0,
};

function setDetailMoreOpen(open) {
  const button = document.querySelector("#detail-more-toggle");
  const popover = document.querySelector("#detail-more-popover");
  if (!button || !popover) return;
  button.setAttribute("aria-expanded", String(open));
  popover.hidden = !open;
}

function applySidebarLayout({ persist = false } = {}) {
  const shell = document.querySelector("#app-shell");
  const toggle = document.querySelector("#sidebar-toggle");
  const backdrop = document.querySelector("#sidebar-backdrop");
  if (!shell || !toggle || !backdrop) return;
  const compactViewport = window.innerWidth < 1280;
  const expanded = !state.sidebarCollapsed;
  shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  shell.classList.toggle("sidebar-expanded", expanded);
  shell.classList.toggle("sidebar-overlay-open", compactViewport && expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", expanded ? "收起导航" : "展开导航");
  toggle.title = expanded ? "收起导航" : "展开导航";
  toggle.innerHTML = `<i data-lucide="${expanded ? "panel-left-close" : "panel-left-open"}"></i>`;
  backdrop.hidden = !(compactViewport && expanded);
  if (persist) window.localStorage.setItem(SIDEBAR_STATE_KEY, state.sidebarCollapsed ? "1" : "0");
  refreshIcons(toggle);
}

function setSidebarCollapsed(collapsed, options = {}) {
  state.sidebarCollapsed = Boolean(collapsed);
  applySidebarLayout({ persist: options.persist !== false });
}

function setWardSideView(view) {
  state.wardSideView = view === "detail" ? "detail" : "list";
  const layout = document.querySelector(".ward-main-layout");
  if (layout) layout.dataset.wardSideView = state.wardSideView;
  document.querySelectorAll("[data-ward-side-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.wardSideView === state.wardSideView);
  });
}

function setWardTimelineCollapsed(collapsed, { persist = true } = {}) {
  state.wardTimelineCollapsed = Boolean(collapsed);
  const layout = document.querySelector(".ward-layout");
  const button = document.querySelector("#ward-timeline-toggle");
  layout?.classList.toggle("timeline-collapsed", state.wardTimelineCollapsed);
  if (button) {
    button.setAttribute("aria-expanded", String(!state.wardTimelineCollapsed));
    button.setAttribute("aria-label", state.wardTimelineCollapsed ? "展开眼位时间轴" : "收起眼位时间轴");
    button.title = state.wardTimelineCollapsed ? "展开眼位时间轴" : "收起眼位时间轴";
    button.innerHTML = `<i data-lucide="${state.wardTimelineCollapsed ? "chevron-up" : "chevron-down"}"></i>`;
    refreshIcons(button);
  }
  if (persist) window.localStorage.setItem(WARD_TIMELINE_STATE_KEY, state.wardTimelineCollapsed ? "1" : "0");
}

function setFarmCompactView(view) {
  state.farmCompactView = view === "diagnosis" ? "diagnosis" : "map";
  const layout = document.querySelector(".farm-main-layout");
  if (layout) layout.dataset.farmCompactView = state.farmCompactView;
  document.querySelectorAll("[data-farm-compact-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.farmCompactView === state.farmCompactView);
  });
}

function setBuildCompactView(view) {
  state.buildCompactView = view === "usage" ? "usage" : "tracks";
  const layout = document.querySelector(".build-layout");
  if (layout) layout.dataset.buildCompactView = state.buildCompactView;
  document.querySelectorAll("[data-build-compact-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.buildCompactView === state.buildCompactView);
  });
}

function setCombatCompactView(view) {
  const allowed = new Set(["context", "contribution", "audit", "events"]);
  state.combatCompactView = allowed.has(view) ? view : "context";
  const detail = document.querySelector("#detail-combat");
  if (detail) detail.dataset.compactView = state.combatCompactView;
  document.querySelectorAll("[data-combat-compact-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.combatCompactView === state.combatCompactView);
  });
  if (state.combatCompactView === "events") setCombatInspectorView("events");
  if (state.combatCompactView === "audit") setCombatInspectorView("audit");
  if (state.combatCompactView === "contribution" && state.combatContributionChartModel) {
    window.requestAnimationFrame(() => {
      if (state.combatContributionChart) state.combatContributionChart.resize();
      else void renderCombatContributionChart(state.combatContributionChartModel);
    });
  }
  if (state.combatCompactView === "audit" && state.combatResponsibilityRadarModel) {
    window.requestAnimationFrame(() => {
      if (state.combatResponsibilityRadar) state.combatResponsibilityRadar.resize();
      else void renderCombatResponsibilityRadar(state.combatResponsibilityRadarModel);
    });
  }
}

function focusCombatAudit(action) {
  const target = combatContributionAuditScrollTarget(action);
  if (target === "preserve") return;
  window.requestAnimationFrame(() => {
    const pane = document.querySelector("#combat-audit-pane");
    if (!pane) return;
    if (target === "top") {
      pane.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const detail = document.querySelector("#combat-dimension-detail");
    if (!detail) return;
    const offset = pane.scrollTop
      + detail.getBoundingClientRect().top
      - pane.getBoundingClientRect().top
      - 8;
    pane.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  });
}

function setPlayerScoreEvidenceOpen(open) {
  state.playerScoreEvidenceOpen = Boolean(open);
  const workspace = document.querySelector(".player-score-workspace");
  const toggle = document.querySelector("#player-score-evidence-toggle");
  const backdrop = document.querySelector("#player-score-evidence-backdrop");
  workspace?.classList.toggle("evidence-open", state.playerScoreEvidenceOpen);
  toggle?.setAttribute("aria-expanded", String(state.playerScoreEvidenceOpen));
  if (backdrop) backdrop.hidden = !state.playerScoreEvidenceOpen;
}

function setPlayerReportView(view) {
  const allowed = new Set(["facts", "dimensions", "phases", "insights"]);
  state.playerReportView = allowed.has(view) ? view : "facts";
  const body = document.querySelector("#player-report-body");
  if (body) body.dataset.reportView = state.playerReportView;
  document.querySelectorAll("[data-player-report-view]").forEach((button) => {
    const active = button.dataset.playerReportView === state.playerReportView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

const METRICS = {
  networth: { label: "净值", color: "#5e9fd6", unit: "" },
  gold: { label: "总金钱", color: "#d8a447", unit: "" },
  xp: { label: "经验", color: "#9981d9", unit: "" },
  lh: { label: "补刀", color: "#53b77f", unit: "" },
};

const EVENT_BLUEPRINTS = [
  { category: "farm", type: "补刀", icon: "wheat", actor: "风行者", text: "击杀夜魇近战小兵", value: "+42 金钱", location: "中路" },
  { category: "farm", type: "野怪", icon: "trees", actor: "风行者", text: "击杀半人马猎手", value: "+54 金钱", location: "主野区" },
  { category: "combat", type: "伤害", icon: "swords", actor: "风行者", text: "强力击命中虚无之灵", value: "284 伤害", location: "中路河道" },
  { category: "item", type: "装备", icon: "shopping-bag", actor: "风行者", text: "购买回城卷轴", value: "-100 金钱", location: "基地" },
  { category: "vision", type: "视野", icon: "eye", actor: "马格纳斯", text: "放置侦查守卫", value: "持续 360 秒", location: "肉山河道" },
  { category: "combat", type: "控制", icon: "link", actor: "风行者", text: "束缚击命中炼金术士", value: "2.4 秒", location: "夜魇主野区" },
  { category: "objective", type: "目标", icon: "landmark", actor: "天辉", text: "摧毁夜魇中路一塔", value: "+135 团队金钱", location: "中路" },
  { category: "item", type: "技能", icon: "sparkles", actor: "风行者", text: "强力击升级至 3 级", value: "Lv.3", location: "天辉主野区" },
];

const TIMELINE_EVENTS = Array.from({ length: 1000 }, (_, index) => {
  const blueprint = EVENT_BLUEPRINTS[index % EVENT_BLUEPRINTS.length];
  const time = Math.min(MATCH_DURATION, 8 + Math.floor(index * 2.27));
  return {
    id: `event-${index + 1}`,
    time,
    category: blueprint.category,
    type: blueprint.type,
    icon: blueprint.icon,
    actor: index % 9 === 0 ? HEROES[(index / 9) % HEROES.length | 0].name : blueprint.actor,
    text: blueprint.text,
    value: blueprint.value,
    location: blueprint.location,
    evidence: index % 7 === 0 ? "推导" : "事实",
  };
});

function heroImage(token) {
  const normalized = /^[a-z0-9_]+$/.test(String(token || "")) ? String(token) : "unknown";
  return normalized === "unknown" ? HERO_FALLBACK_IMAGE : `/assets/heroes/${normalized}.png`;
}

function itemImage(key) {
  if (ITEMS[key]?.file || ["ward_observer", "ward_sentry"].includes(key)) return `/assets/items/${ITEMS[key]?.file || key}.png`;
  const imageKey = key.startsWith("recipe_") ? key.slice(7) : key;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${imageKey}.png`;
}

function abilityImage(key) {
  if (key.startsWith("windrunner_")) return `/assets/abilities/${key}.png`;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${key}.png`;
}

function installImageFallback(root, fallbackSource) {
  root.querySelectorAll("img").forEach((image) => {
    const fallback = () => {
      if (image.dataset.fallbackApplied === "true") {
        image.style.visibility = "hidden";
        return;
      }
      image.dataset.fallbackApplied = "true";
      image.classList.add("image-fallback");
      image.src = fallbackSource;
    };
    image.addEventListener("error", fallback);
    if (image.complete && image.naturalWidth === 0) fallback();
  });
}

function itemName(key) {
  if (!key) return "未知物品";
  const normalized = String(key).replace(/^item_/, "");
  if (normalized.startsWith("recipe_")) return `${itemName(normalized.slice(7))}配方`;
  return ITEM_NAMES_ZH[normalized]
    || OFFICIAL_ITEM_NAMES_ZH[normalized]
    || ITEMS[normalized]?.name
    || `未知物品 · ${normalized.replaceAll("_", " ")}`;
}

function abilityName(key) {
  if (!key) return "英雄技能";
  const normalized = String(key);
  if (normalized === "attack") return "普通攻击";
  if (normalized.startsWith("item_")) return itemName(normalized);
  if (normalized === "ability_capture") return "占领前哨";
  if (normalized === "ability_lamp_use") return "地图机关交互";
  if (normalized === "twin_gate_portal_warp") return "双生之门传送";
  if (normalized === "plus_high_five") return "击掌";
  return ABILITY_NAMES_ZH[normalized]
    || OFFICIAL_ABILITY_NAMES_ZH[normalized]
    || (normalized.startsWith("special_bonus") ? "英雄天赋" : `未知技能 · ${normalized.replaceAll("_", " ")}`);
}

function regionName(value) {
  return REGION_NAMES_ZH[value] || value || "未知区域";
}

const LANE_NAMES_ZH = { top: "上路", mid: "中路", bottom: "下路" };
const LANE_VERDICT_META = {
  major_advantage: { label: "大优势", tone: "positive" },
  advantage: { label: "优势", tone: "positive" },
  even: { label: "均势", tone: "even" },
  disadvantage: { label: "劣势", tone: "negative" },
  major_disadvantage: { label: "大劣势", tone: "negative" },
};

const PLAYER_ROLE_META = {
  1: { label: "1号位 · 核心", brief: "资源转化、持续输出与目标终结" },
  2: { label: "2号位 · 中单", brief: "对线结果、节奏控制与战斗输出" },
  3: { label: "3号位 · 劣势路核心", brief: "先手功能、空间压力与承伤交换" },
  4: { label: "4号位 · 游走辅助", brief: "游走节奏、战斗功能与视野控制" },
  5: { label: "5号位 · 硬辅助", brief: "线上保护、团队节奏与资源纪律" },
};

const PLAYER_DIMENSION_META = {
  lane_execution: ["对线执行", "补反、等级与对位差"],
  farm_efficiency: ["发育效率", "GPM、XPM与同位置资源转化"],
  resource_decision: ["资源决策", "安全兵线、线野循环与叠野价值"],
  map_tempo: ["地图与节奏", "TP、神符、到场与行动窗口"],
  combat_output: ["战斗输出", "伤害占比、击杀转化与在场率"],
  combat_duty: ["战斗职责", "通过硬门禁的先反手与功能完成度"],
  survival_risk: ["生存与风险", "阵亡、死亡时间与资源保护"],
  objective_conversion: ["目标转化", "防御塔、肉山与战后推进"],
  vision_team: ["视野与团队", "眼位、排眼、发现与团队价值"],
  observable_execution: ["可观测执行", "有效操作记录与技能物品使用"],
  resource_conversion: ["资源转化", "经济转为净值与战力"],
  core_output: ["核心输出", "伤害、参战与存活输出"],
  survival_uptime: ["存活输出", "阵亡次数与死亡时间"],
  objective_finish: ["目标终结", "建筑与肉山贡献"],
  mid_lane: ["中路对位", "十分钟前等级与经济结果"],
  tempo_control: ["节奏控制", "神符、支援与参战时机"],
  combat_output: ["战斗输出", "英雄伤害与有效参战"],
  objective_pressure: ["目标压力", "推塔与关键资源控制"],
  offlane_result: ["劣势路结果", "对位核心与双人路结果"],
  initiation_utility: ["先手功能", "控制、承伤与战斗执行"],
  space_pressure: ["空间压力", "危险区活动与目标压力"],
  survival_trade: ["生存交换", "阵亡代价与团队收益"],
  resource_efficiency: ["资源效率", "有限资源下的战力转化"],
  lane_support: ["线上辅助", "核心发育与自身路线影响"],
  roam_tempo: ["游走节奏", "支援、神符与战斗到场"],
  combat_utility: ["战斗功能", "控制、治疗、技能与参战"],
  vision_control: ["视野控制", "真假眼、排眼与发现价值"],
  resource_discipline: ["资源纪律", "团队资源占用与功能产出"],
  lane_protection: ["线上保护", "核心对线结果与保护质量"],
  team_tempo: ["团队节奏", "支援、参战与关键时间点"],
};

const PLAYER_PHASE_META = {
  laning: "0–10 分钟",
  mid_game: "10–20 分钟",
  late_game: "20 分钟后",
};

const PLAYER_EVIDENCE_META = {
  lane_score: ["对线模型", "model_points"],
  lane_confidence: ["对线置信度", "percent"],
  secured_lane_units: ["已补线上单位", "count"],
  reviewable_misses: ["附近可复核漏刀", "count"],
  estimated_reviewable_gold: ["可复核损失", "gold"],
  last_hits: ["补刀", "count"],
  denies: ["反补", "count"],
  level: ["等级", "count"],
  gpm: ["GPM", "per_minute"],
  xpm: ["XPM", "per_minute"],
  networth: ["净值", "gold"],
  lane_gold: ["兵线收入", "gold"],
  neutral_gold: ["野区收入", "gold"],
  resource_review_windows: ["有效路线窗口", "count"],
  resource_missed_windows: ["错失路线窗口", "count"],
  resource_estimated_loss: ["路线机会损失", "gold"],
  lane_jungle_cycles: ["线野循环", "count"],
  hero_damage: ["英雄伤害", "damage"],
  fight_score: ["战斗执行", "score"],
  fight_damage_share: ["战斗伤害占比", "percent"],
  kill_conversion: ["击杀转化", "percent"],
  fight_presence: ["战场存在率", "percent"],
  reviewable_fights: ["有效战斗样本", "count"],
  passed_duty_fights: ["职责门禁通过场次", "count"],
  deaths: ["阵亡", "count"],
  dead_seconds: ["死亡时长", "seconds"],
  buyback_count: ["买活次数", "count"],
  tower_damage: ["建筑伤害", "damage"],
  tower_kills: ["防御塔击杀", "count"],
  roshan_kills: ["肉山击杀", "count"],
  damage_taken: ["承受伤害", "damage"],
  healing: ["治疗量", "damage"],
  observer_wards: ["侦查守卫", "count"],
  sentry_wards: ["岗哨守卫", "count"],
  dewards: ["排眼", "count"],
  vision_score: ["眼位评分", "score"],
  ward_detections: ["眼位发现", "count"],
  teleport_uses: ["TP 使用", "count"],
  rune_pickups: ["神符拾取", "count"],
  actions_per_min: ["APM", "per_minute"],
  ability_casts: ["技能使用", "count"],
  item_uses: ["物品使用", "count"],
  observable_uses_per_min: ["技能物品频率", "per_minute"],
  teamfight_participation: ["战斗参与率", "percent"],
  control_seconds: ["控制时长", "seconds"],
  stack_team_value_estimate: ["叠野团队价值", "gold"],
};

const PLAYER_SCORE_DIMENSION_META = {
  lane_execution: { label: "对线执行", brief: "补刀、反补、经验、等级、死亡与分路职责", icon: "git-compare-arrows", module: "development" },
  farm_efficiency: { label: "发育效率", brief: "GPM、XPM、收入来源、空转与关键物品时间", icon: "coins", module: "farm" },
  resource_decision: { label: "资源决策", brief: "安全兵线、线野循环、营地选择与队友资源冲突", icon: "route", module: "farm" },
  map_tempo: { label: "地图与节奏", brief: "支援、TP、神符、关键物品与目标时间", icon: "navigation", module: "map" },
  combat_output: { label: "战斗输出", brief: "伤害、持续输出、目标选择与击杀转化", icon: "swords", module: "combat" },
  combat_duty: { label: "战斗职责", brief: "先手、反手、控制、救人、承伤与施法机会", icon: "crosshair", module: "combat" },
  survival_risk: { label: "生存与风险", brief: "死亡质量、撤退、买活与资源保护", icon: "shield-alert", module: "combat" },
  objective_conversion: { label: "目标转化", brief: "防御塔、肉山、高地与战后推进", icon: "landmark", module: "map" },
  vision_team: { label: "视野与团队功能", brief: "眼位、排眼、救人、先反手与资源纪律", icon: "scan-eye", module: "vision" },
  observable_execution: { label: "可观测执行", brief: "有效指令、机会转化、响应与技能物品衔接", icon: "mouse-pointer-click", module: "combat" },
};

const PLAYER_SCORE_MISSING_META = {
  reviewable_lane_unit_outcomes: "缺少可复核的兵线单位结果",
  support_route_outcomes: "缺少辅助离线与回线结果",
  hard_gated_lane_opportunity_windows: "没有通过门禁的兵线机会窗口",
  hard_gated_route_windows: "没有通过安全性与资源存续门禁的路线窗口",
  confirmed_lane_jungle_cycles: "缺少已确认的线野循环",
  stack_team_value: "缺少可归属的叠野团队价值",
  team_resource_claims: "暂缺队友资源占用与让线归因",
  classified_combat_contributions: "缺少可归属的有效战斗贡献",
  passed_responsibility_gate_fights: "没有战斗片段通过职责硬门禁",
  hero_specific_duty_context: "暂缺英雄专属职责上下文",
  ward_lifecycle_module: "缺少眼位生命周期数据",
  enemy_detection_events: "缺少眼位发现敌方事件",
  death_context_quality: "暂缺阵亡收益与代价归因",
  retreat_decision_context: "暂缺撤退窗口上下文",
  objective_setup_attribution: "暂缺目标前准备与站位归因",
  classified_fight_arrival_windows: "缺少有效战斗到场窗口",
  key_item_activation_windows: "暂缺关键装备后的行动窗口",
  invalid_order_rate: "Replay 暂不能确认无效指令比例",
  camera_movement: "Replay 暂不能可靠观察镜头移动",
  hero_specific_combo_windows: "暂缺英雄专属连招机会窗口",
  minimum_evidence_not_met: "未达到最低证据门槛",
  dimension_not_implemented: "当前版本尚未实现该维度",
  gpm: "缺少同位置 GPM 比较",
  xpm: "缺少同位置 XPM 比较",
  networth: "缺少同位置净值比较",
};

const PLAYER_SCORE_ROLE_WEIGHTS = {
  1: { lane_execution: 15, farm_efficiency: 20, resource_decision: 15, map_tempo: 5, combat_output: 15, combat_duty: 8, survival_risk: 10, objective_conversion: 7, vision_team: 2, observable_execution: 3 },
  2: { lane_execution: 17, farm_efficiency: 12, resource_decision: 8, map_tempo: 15, combat_output: 14, combat_duty: 10, survival_risk: 8, objective_conversion: 7, vision_team: 3, observable_execution: 6 },
  3: { lane_execution: 15, farm_efficiency: 8, resource_decision: 7, map_tempo: 15, combat_output: 8, combat_duty: 20, survival_risk: 10, objective_conversion: 8, vision_team: 5, observable_execution: 4 },
  4: { lane_execution: 12, farm_efficiency: 3, resource_decision: 5, map_tempo: 20, combat_output: 5, combat_duty: 20, survival_risk: 7, objective_conversion: 5, vision_team: 16, observable_execution: 7 },
  5: { lane_execution: 15, farm_efficiency: 2, resource_decision: 4, map_tempo: 15, combat_output: 3, combat_duty: 18, survival_risk: 7, objective_conversion: 5, vision_team: 23, observable_execution: 8 },
};

const PLAYER_SCORE_DIMENSION_ALIASES = {
  lane_execution: ["lane_execution", "mid_lane", "offlane_result", "lane_support", "lane_protection"],
  farm_efficiency: ["farm_efficiency", "resource_efficiency", "resource_conversion"],
  resource_decision: ["resource_decision", "resource_discipline"],
  map_tempo: ["map_tempo", "tempo_control", "roam_tempo", "team_tempo", "space_pressure"],
  combat_output: ["combat_output", "core_output"],
  combat_duty: ["combat_duty", "combat_execution", "initiation_utility", "combat_utility"],
  survival_risk: ["survival_risk", "survival_uptime", "survival_trade"],
  objective_conversion: ["objective_conversion", "objective_finish", "objective_pressure"],
  vision_team: ["vision_team", "vision_control"],
  observable_execution: ["observable_execution"],
};

const PLAYER_SCORE_PHASE_META = {
  laning: "0-10 分钟 · 对线",
  mid_game: "10-20 分钟 · 转线",
  late_game: "20 分钟后 · 运营",
  lane_transition: "换线与节奏",
  farm_distribution: "资源分配",
  map_control: "地图控制",
  high_ground: "高地阶段",
};

const PLAYER_SCORE_PHASE_SHORT_META = {
  laning: "对线",
  mid_game: "转线",
  late_game: "运营",
  lane_transition: "换线",
  farm_distribution: "资源",
  map_control: "地图",
  high_ground: "高地",
};

const PLAYER_SCORE_DOMAIN_META = {
  lane: { label: "对线", keys: ["lane_execution"], icon: "git-compare-arrows" },
  farm: { label: "发育", keys: ["farm_efficiency", "resource_decision"], icon: "coins" },
  tempo: { label: "节奏", keys: ["map_tempo", "objective_conversion"], icon: "navigation" },
  combat: { label: "战斗", keys: ["combat_output", "combat_duty", "survival_risk"], icon: "crosshair" },
  team: { label: "团队", keys: ["vision_team", "observable_execution"], icon: "users" },
};

const PLAYER_SCORE_BRIEF_VERDICT_META = {
  major_advantage: { label: "大优势", className: "positive" },
  advantage: { label: "优势", className: "positive" },
  even: { label: "均势", className: "stable" },
  disadvantage: { label: "承压", className: "negative" },
  major_disadvantage: { label: "大劣势", className: "negative" },
  stable: { label: "表现稳定", className: "positive" },
  issue: { label: "问题集中", className: "negative" },
  missing: { label: "证据不足", className: "missing" },
};

function positionLabel(position) {
  const value = Number(position);
  return value >= 1 && value <= 5 ? `${value}号位` : "职责待识别";
}

function laneReviewForSlot(slot = state.selectedHeroSlot) {
  return state.currentAnalysis?.modules?.laning?.reviews_by_slot?.[String(slot)] || null;
}

function matchupSlotFor(slot = state.selectedHeroSlot) {
  const fromAnalysis = state.currentAnalysis?.modules?.laning?.matchup_slot_by_slot?.[String(slot)];
  if (fromAnalysis != null && Number.isFinite(Number(fromAnalysis))) return Number(fromAnalysis);
  const hero = safeHero(slot);
  const targetPosition = ({ 1: 3, 2: 2, 3: 1, 4: 5, 5: 4 })[Number(hero.position)] || Number(hero.position);
  return HEROES.find((candidate) => candidate.team !== hero.team && Number(candidate.position) === targetPosition)?.slot
    ?? (Number(slot) < 5 ? Number(slot) + 5 : Number(slot) - 5);
}

function safeHero(slot) {
  return HEROES[Number(slot)] || { slot: Number(slot) || 0, team: "radiant", token: "unknown", name: "未知英雄", player: "未知玩家", me: false };
}

function formatTime(seconds) {
  const value = Number(seconds) || 0;
  const sign = value < 0 ? "-" : "";
  const safe = Math.abs(Math.round(value));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatPreciseTimeMs(milliseconds) {
  const value = Number(milliseconds) || 0;
  const sign = value < 0 ? "-" : "";
  const safe = Math.abs(Math.round(value));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function eventTimeMs(event, fallbackSeconds = 0) {
  const milliseconds = Number(event?.game_time_ms ?? event?.time_ms);
  if (Number.isFinite(milliseconds)) return milliseconds;
  const seconds = Number(event?.time ?? event?.second ?? fallbackSeconds);
  return (Number.isFinite(seconds) ? seconds : fallbackSeconds) * 1000;
}

function eventTimeSeconds(event, fallbackSeconds = 0) {
  return eventTimeMs(event, fallbackSeconds) / 1000;
}

function normalizeTimedEvent(event, fallbackSeconds = 0) {
  const timeMs = eventTimeMs(event, fallbackSeconds);
  return { ...event, time: timeMs / 1000, timeMs };
}

function compactNumber(value) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function refreshIcons(root = document) {
  createIcons({ icons: APP_ICONS, attrs: { "aria-hidden": "true" }, root });
}

function showToast(title, detail = "", icon = "circle-check") {
  const region = document.querySelector("#toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i data-lucide="${icon}"></i><span><strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span>`;
  region.appendChild(toast);
  refreshIcons(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function readDirectorySettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DIRECTORY_SETTINGS_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function persistDirectorySetting(key, value) {
  const settings = readDirectorySettings();
  settings[key] = value;
  window.localStorage.setItem(DIRECTORY_SETTINGS_KEY, JSON.stringify(settings));
}

function restoreDirectorySettings() {
  const settings = readDirectorySettings();
  document.querySelectorAll("[data-settings-path]").forEach((input) => {
    const value = settings[input.dataset.settingsPath];
    if (typeof value === "string" && value.trim()) input.value = value;
  });
}

async function chooseSettingsDirectory(button) {
  const input = document.querySelector(`#${button.dataset.directoryTarget}`);
  if (!input) return;
  if (!window.dotaLensDesktop?.selectDirectory) {
    showToast("桌面目录选择不可用", "请从 Dota Lens 桌面客户端打开设置", "monitor-x");
    return;
  }

  button.disabled = true;
  button.classList.add("is-busy");
  try {
    const result = await window.dotaLensDesktop.selectDirectory({
      key: button.dataset.directoryPicker,
      title: button.title,
      defaultPath: input.value.trim(),
      allowCreate: button.dataset.directoryCreate === "true",
    });
    if (result?.canceled || !result?.filePath) return;
    input.value = result.filePath;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    showToast("目录已更新", result.filePath, "folder-check");
  } catch (error) {
    showToast("无法选择目录", error?.message || "系统文件夹对话框调用失败", "circle-alert");
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

const TASK_STAGE_META = {
  queued: ["等待解析", "任务已进入本地单任务队列"],
  importing_replay: ["导入 Replay", "正在把参赛者本机 Replay 写入本地解析缓存"],
  resolving: ["读取比赛", "正在确认比赛信息和 Replay 地址"],
  requesting_replay: ["请求 Replay", "OpenDota 尚无地址，正在提交公开解析请求"],
  waiting_replay: ["等待 Replay", "等待 OpenDota 返回 Replay 下载信息"],
  waiting_replay_file: ["等待下载重试", "Valve Replay 服务暂时不可用，任务会自动重试"],
  downloading: ["下载 Replay", "正在从 Valve Replay 服务器流式下载"],
  downloaded: ["下载完成", "Replay 已进入本地缓存"],
  decompressing: ["解压 Replay", "正在生成可复用的本地 DEM 缓存"],
  decompressed: ["解压完成", "已准备本地 DEM 文件"],
  parsing: ["解析 Replay", "正在逐帧读取并生成逐事件 JSONL"],
  summarizing: ["生成索引", "正在校验完整性并生成产品摘要"],
  completed: ["解析完成", "真实数据已经可以打开"],
  failed: ["解析失败", "查看错误后可点击比赛重试"],
  canceled: ["已取消", "解析进程已终止，临时文件正在清理"],
};

const COVERAGE_LABELS = {
  interval: "玩家逐秒快照",
  orders: "完整玩家命令",
  combat: "战斗事件",
  units: "单位生命周期",
  wards: "眼位生命周期",
  vision: "视野事件锚点",
};

const COVERAGE_PRECISION_ZH = {
  "1 second": "1 秒",
  event: "逐事件",
  "state change": "状态变化",
  "combat event": "战斗事件",
};

const COVERAGE_SOURCE_ZH = {
  "Replay interval": "Replay 逐秒快照",
  "Unit orders": "玩家单位命令",
  CombatLog: "战斗日志",
  "Replay entities": "Replay 实体",
};

const TASK_ERROR_MESSAGES = {
  replay_unavailable: "OpenDota 暂时没有这场比赛的 Replay 地址，请稍后重试。",
  replay_server_unavailable: "Valve Replay 下载服务持续不可用，自动重试窗口已用尽，可稍后重新解析。",
  rate_limited: "OpenDota 请求过于频繁，请稍后再试。",
  parse_incomplete: "Replay 没有完整结束标记，无法生成可信报告。",
  replay_corrupt: "Replay 文件损坏或下载不完整，请重新解析。",
  replay_match_id_mismatch: "录像内部比赛 ID 与导入时填写的 ID 不一致。缓存副本已移除，请按录像内部 ID 重命名后重新导入。",
  parse_failed: "本地解析失败，请查看解析器日志。",
  request_failed: "无法创建本地解析任务，请检查解析器连接。",
  request_timeout: "本地服务请求超时；任务可能仍在运行，请到任务页查看或取消。",
  job_not_found: "上次任务已中断或本地解析器已重启；Replay 缓存仍可用于重新解析。",
};

function taskErrorMessage(job = {}) {
  if (job.error_code === "replay_match_id_mismatch" && job.error_context) {
    const declared = job.error_context.declared_match_id ?? job.match_id ?? "--";
    const internal = job.error_context.internal_match_id ?? "--";
    return `导入 ID ${declared}，录像内部 ID ${internal}。请把文件按内部 ID 重命名后重新导入。`;
  }
  return TASK_ERROR_MESSAGES[job.error_code] || job.message || "本地解析失败，请查看解析器日志。";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMatchDate(epochSeconds) {
  if (!epochSeconds) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(Number(epochSeconds) * 1000));
}

function formatGeneratedAt(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "--";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function apiFetch(path, options = {}) {
  const { timeout = 60000, body, ...requestOptions } = options;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...requestOptions,
      body: body && typeof body !== "string" ? JSON.stringify(body) : body,
      headers: { "Content-Type": "application/json", ...(requestOptions.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = new Error(payload.message || `本地服务返回 HTTP ${response.status}`);
      error.code = payload.error;
      error.status = response.status;
      error.context = payload.error_context || null;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("本地服务响应超时");
      timeoutError.code = "request_timeout";
      throw timeoutError;
    }
    if (error instanceof SyntaxError) throw new Error("本地服务返回了无法识别的数据");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function decodeSnapshotColumns(module) {
  if (!String(module?.schema || "").startsWith("snapshot-columns/")) return module || {};
  const fields = Array.isArray(module.fields) ? module.fields : [];
  const regions = Array.isArray(module.regions) ? module.regions : [];
  const decoded = {};
  Object.entries(module.by_slot || {}).forEach(([slot, rows]) => {
    decoded[slot] = (Array.isArray(rows) ? rows : []).map((values) => {
      const snapshot = {};
      fields.forEach((field, index) => {
        const value = values?.[index] ?? null;
        snapshot[field] = field === "region" && Number.isInteger(value) ? regions[value] ?? "unknown" : value;
      });
      snapshot.coordinate_valid = snapshot.x != null && snapshot.y != null
        && Number.isFinite(Number(snapshot.x)) && Number.isFinite(Number(snapshot.y));
      snapshot.coordinate_space = snapshot.coordinate_valid ? "map_percent" : "unknown";
      snapshot.coordinate_source = "snapshot_columns";
      return snapshot;
    });
  });
  return decoded;
}

function normalizeAnalysisSnapshots(analysis) {
  const snapshots = analysis?.modules?.snapshots;
  if (String(snapshots?.schema || "").startsWith("snapshot-columns/")) {
    analysis.modules.snapshots = decodeSnapshotColumns(snapshots);
  }
  return analysis;
}

function analysisModuleAvailable(analysis, moduleName) {
  const available = analysis?.analysis_storage?.available_modules;
  return Array.isArray(available) && available.includes(moduleName);
}

async function fetchAnalysisModules(analysis, matchId, moduleNames) {
  if (!analysis?.modules) return { changed: false, loaded: [], failures: [] };
  const missing = [...new Set(moduleNames)].filter((name) => !analysis.modules[name]
    && analysisModuleAvailable(analysis, name));
  if (!missing.length) return { changed: false, loaded: [], failures: [] };
  const settled = await Promise.allSettled(missing.map(async (name) => {
    const key = `${matchId}:${analysis.generated_at || "current"}:${name}`;
    let request = state.analysisModuleLoads.get(key);
    if (!request) {
      request = apiFetch(`/matches/${matchId}/analysis/modules/${name}`, { timeout: 60000 })
        .catch((error) => {
          state.analysisModuleLoads.delete(key);
          throw error;
        });
      state.analysisModuleLoads.set(key, request);
    }
    return { name, value: await request };
  }));
  const loaded = [];
  const failures = [];
  analysis.module_load_errors ||= {};
  settled.forEach((result, index) => {
    const name = missing[index];
    if (result.status === "fulfilled") {
      analysis.modules[name] = result.value.value;
      delete analysis.module_load_errors[name];
      loaded.push(name);
      return;
    }
    analysis.module_load_errors[name] = result.reason?.message || "模块读取失败";
    failures.push({ name, error: result.reason });
  });
  normalizeAnalysisSnapshots(analysis);
  return { changed: loaded.length > 0, loaded, failures };
}

function normalizeMatch(raw) {
  const hero = heroMeta(raw.hero_id);
  const isRadiant = Number(raw.player_slot) < 128;
  const win = typeof raw.radiant_win === "boolean"
    ? (isRadiant ? raw.radiant_win : !raw.radiant_win)
    : null;
  const status = raw.local_status || (raw.version == null ? "basic" : "available");
  return {
    id: String(raw.match_id),
    hero,
    status,
    win,
    kills: Number(raw.kills) || 0,
    deaths: Number(raw.deaths) || 0,
    assists: Number(raw.assists) || 0,
    lh: Number(raw.last_hits) || 0,
    denies: raw.denies == null ? null : Number(raw.denies),
    gpm: Number(raw.gold_per_min) || 0,
    xpm: Number(raw.xp_per_min) || 0,
    duration: Number(raw.duration) || 0,
    date: formatMatchDate(raw.start_time),
    mode: GAME_MODES_ZH[raw.game_mode] || `模式 ${raw.game_mode ?? "--"}`,
    progress: Number(raw.local_job?.progress) || null,
    localJob: raw.local_job || null,
    recoverable: Boolean(raw.local_replay_cache) && !raw.local_analysis,
    raw,
  };
}

function validAccountId(value) {
  if (!/^\d{1,10}$/.test(value)) return false;
  try {
    const id = BigInt(value);
    return id > 0n && id <= 4294967295n;
  } catch {
    return false;
  }
}

function matchCacheKey(accountId) {
  return `${MATCH_CACHE_KEY_PREFIX}:${String(accountId)}`;
}

function readCachedMatches(accountId) {
  return normalizeMatchCache(readStoredJson(matchCacheKey(accountId)), accountId);
}

function persistMatchPayload(accountId, matches, fetchedAt) {
  if (!validAccountId(String(accountId)) || !Array.isArray(matches) || !matches.length) return false;
  return writeStoredJson(matchCacheKey(accountId), createMatchCache(accountId, matches, fetchedAt));
}

function persistCurrentMatchesCache() {
  if (!validAccountId(state.accountId) || !state.matches.length) return false;
  const rawMatches = state.matches.map((match) => ({
    ...(match.raw || {}),
    match_id: Number(match.id),
    local_status: match.status,
    local_job: match.localJob || null,
    local_analysis: match.status === "full",
  }));
  return persistMatchPayload(state.accountId, rawMatches, state.matchesFetchedAt);
}

function updateAccountChrome() {
  const connected = state.matchesStatus === "ready";
  const accountId = state.accountId;
  document.querySelector("#account-id-input").value = accountId;
  document.querySelector("#settings-account-id").value = accountId;
  document.querySelector("#settings-steam-id64").value = validAccountId(accountId)
    ? String(76561197960265728n + BigInt(accountId))
    : "--";
  document.querySelector("#sidebar-account-id").textContent = connected ? accountId : "未连接账号";
  document.querySelector("#sidebar-account-avatar").textContent = connected ? accountId.slice(-2) : "--";
  document.querySelector("#sidebar-account-detail").textContent = connected
    ? state.matchesOffline ? "正在使用本地比赛缓存" : "最近比赛已同步"
    : "输入 Steam 数字 ID";
  if (state.page === "matches") {
    document.querySelector("#page-context").textContent = connected
      ? `账号 ${accountId} · ${state.matchesOffline ? "离线缓存" : "OpenDota 最近比赛"}`
      : "等待连接账号";
  }
}

function updateMatchSummary() {
  const matches = state.matches;
  const wins = matches.filter((match) => match.win).length;
  const completed = matches.filter((match) => match.status === "full").length;
  const averageKda = matches.length
    ? matches.reduce((sum, match) => sum + (match.kills + match.assists) / Math.max(1, match.deaths), 0) / matches.length
    : 0;
  document.querySelector("#account-win-summary").textContent = matches.length ? `${wins} 胜` : "--";
  document.querySelector("#account-win-summary").classList.toggle("positive", wins >= matches.length / 2 && matches.length > 0);
  document.querySelector("#account-full-summary").textContent = matches.length ? `${completed} 场` : "--";
  document.querySelector("#account-kda-summary").textContent = matches.length ? averageKda.toFixed(2) : "--";
  document.querySelectorAll("[data-status-count]").forEach((element) => {
    const status = element.dataset.statusCount;
    element.textContent = status === "all" ? matches.length : matches.filter((match) => match.status === status).length;
  });
}

function setParserStatus(online, detail = "") {
  state.parserOnline = online;
  const parserLed = document.querySelector("#parser-status-led");
  const globalLed = document.querySelector("#global-parser-led");
  [parserLed, globalLed].forEach((led) => {
    led.classList.toggle("available", online);
    led.classList.toggle("unavailable", !online);
    led.classList.remove("checking");
  });
  document.querySelector("#parser-status-detail").textContent = online ? detail || "就绪 · v0.7.0" : "未启动 · 端口 5600";
  document.querySelector("#global-parser-status").textContent = online ? "本地解析器可用" : "本地解析器未连接";
}

async function checkParserStatus({ retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const status = await apiFetch("/status", { timeout: 3500 });
      if (status.status !== "ready") throw new Error("本地解析器尚未就绪");
      state.parserStatus = status;
      setParserStatus(true, `就绪 · v${status.version}`);
      renderDiagnostics();
      return true;
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }
  state.parserStatus = null;
  setParserStatus(false);
  renderDiagnostics();
  return false;
}

async function loadMatches(accountId = state.accountId, options = {}) {
  const normalized = String(accountId).trim();
  if (!validAccountId(normalized)) {
    showToast("账号格式不正确", "请输入 1 到 10 位 Steam 数字 ID", "circle-alert");
    document.querySelector("#account-id-input").focus();
    return;
  }
  state.accountId = normalized;
  state.matchesStatus = "loading";
  state.matchesError = "";
  state.matchesOffline = false;
  state.matchesAvailability = null;
  renderMatches();
  updateAccountChrome();
  const lookupButton = document.querySelector("#account-lookup-button");
  lookupButton.disabled = true;
  lookupButton.innerHTML = `<i data-lucide="loader-circle"></i><span>读取中</span>`;
  refreshIcons(lookupButton);
  try {
    const payload = await apiFetch(`/players/${normalized}/matches`);
    state.matches = (payload.matches || []).map(normalizeMatch);
    state.matchesAvailability = payload.availability || null;
    state.matchesStatus = "ready";
    state.matchesOffline = false;
    state.matchesFetchedAt = payload.fetched_at || new Date().toISOString();
    window.localStorage.setItem("dota-lens-account-id", normalized);
    persistMatchPayload(normalized, payload.matches || [], state.matchesFetchedAt);
    document.querySelector("#background-status").textContent = `最近同步：${formatGeneratedAt(payload.fetched_at)}`;
    updateAccountChrome();
    updateMatchSummary();
    renderMatches();
    if (!options.silent) {
      if (state.matches.length) {
        showToast("比赛列表已更新", `读取到 ${state.matches.length} 场最近比赛`, "list-checks");
      } else {
        const guidance = matchHistoryGuidance(state.matchesAvailability);
        showToast(guidance.title, "可导入账号本人在 Dota 2 客户端下载的 Replay", "shield-alert");
      }
    }
  } catch (error) {
    const cached = readCachedMatches(normalized);
    const fallback = resolveMatchListFailure(cached, normalized, error.message || "OpenDota 暂时不可用");
    const parserAvailable = await checkParserStatus({ retries: 0 });
    if (fallback.offline) {
      state.matches = fallback.matches.map(normalizeMatch);
      state.matchesStatus = fallback.status;
      state.matchesOffline = true;
      state.matchesAvailability = null;
      state.matchesFetchedAt = fallback.fetchedAt;
      state.matchesError = fallback.error;
      document.querySelector("#background-status").textContent = `离线缓存：${formatGeneratedAt(fallback.savedAt)}`;
      if (parserAvailable) setParserStatus(true, "就绪 · 当前使用比赛缓存");
      updateAccountChrome();
      updateMatchSummary();
      renderMatches();
      if (!options.silent) {
        showToast("已切换到离线比赛列表", `${state.matches.length} 场缓存比赛可用，本地 Replay 不受影响`, "cloud-off");
      }
      return;
    }
    state.matches = [];
    state.matchesStatus = "error";
    state.matchesOffline = false;
    state.matchesAvailability = null;
    if (parserAvailable && error.code === "opendota_unavailable") {
      state.matchesError = `本地解析器已就绪，但 OpenDota 暂时无法连接：${error.message}`;
      setParserStatus(true, "就绪 · OpenDota 暂不可用");
    } else {
      state.matchesError = error.message || "无法读取比赛列表";
    }
    updateAccountChrome();
    updateMatchSummary();
    renderMatches();
  } finally {
    lookupButton.disabled = false;
    lookupButton.innerHTML = `<i data-lucide="search"></i><span>读取比赛</span>`;
    refreshIcons(lookupButton);
  }
}

function replaceArray(target, values = []) {
  target.splice(0, target.length, ...values);
}

function replaceObject(target, value = {}) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, value || {});
}

function timelineEventView(event) {
  const actor = event.actor_slot == null ? "系统" : safeHero(event.actor_slot).name;
  const target = event.target_slot == null ? "" : safeHero(event.target_slot).name;
  const location = regionName(event.location || event.region || "unknown");
  const timeMs = eventTimeMs(event);
  const base = {
    id: event.id,
    time: timeMs / 1000,
    timeMs,
    category: event.category || "combat",
    icon: "activity",
    actor,
    type: "事件",
    text: "Replay 事件",
    value: "",
    location,
    evidence: event.evidence === "fact" ? "事实" : "推导",
    raw: event,
  };
  if (event.kind === "purchase") return { ...base, category: "item", type: "装备", icon: "shopping-bag", text: `购买 ${itemName(event.key)}`, value: timeMs <= 0 ? "初始装备" : "购买" };
  if (event.kind === "ability_level") return { ...base, category: "item", type: "技能", icon: "sparkles", text: `${abilityName(event.key)}升级`, value: `Lv.${event.value}` };
  if (event.kind === "item_use") return { ...base, category: "item", type: "物品", icon: "package-open", text: `使用 ${itemName(event.key)}`, value: target ? `目标：${target}` : "已使用" };
  if (event.kind === "ability_use") return { ...base, category: "combat", type: "技能", icon: "zap", text: `施放 ${abilityName(event.key)}`, value: target ? `目标：${target}` : "已施放" };
  if (event.kind === "gold") return { ...base, category: event.source === "combat" ? "combat" : "farm", type: "收益", icon: event.source === "neutral" ? "trees" : event.source === "lane" ? "wheat" : "coins", text: GOLD_REASON_NAMES_ZH[event.reason] || "资源收益", value: `+${Number(event.value || 0)} 金钱` };
  if (event.kind === "hero_death") return { ...base, category: "combat", type: "击杀", icon: "skull", text: target ? `击杀 ${target}` : "英雄阵亡", value: event.value ? `+${event.value} 金钱` : "击杀" };
  if (event.kind === "damage") return { ...base, category: "combat", type: "伤害", icon: "swords", text: `${abilityName(event.key)}命中${target ? ` ${target}` : "目标"}`, value: `${Number(event.value || 0)} 伤害` };
  if (event.kind === "heal") return { ...base, category: "combat", type: "治疗", icon: "heart-pulse", text: `${abilityName(event.key)}治疗${target ? ` ${target}` : "队友"}`, value: `${Number(event.value || 0)} 治疗` };
  if (event.kind === "control") return { ...base, category: "combat", type: "控制", icon: "link", text: `${abilityName(event.key)}控制${target ? ` ${target}` : "目标"}`, value: `${Number(event.value || 0).toFixed(1)} 秒` };
  if (event.kind === "tp_support") return { ...base, category: "combat", type: "支援", icon: "send", text: "TP 落地后参与战斗", value: `响应 +${Number(event.value || 0)} 秒` };
  if (event.kind === "tp_arrival") return { ...base, category: "combat", type: "支援", icon: "map-pin", text: "TP 到达战场附近", value: "未记录有效动作" };
  if (event.kind === "ward_place") return { ...base, category: "vision", type: "视野", icon: "eye", text: `放置${event.key === "observer" ? "侦查守卫" : "岗哨守卫"}`, value: "放置" };
  if (event.kind === "ward_end") return { ...base, category: "vision", type: "视野", icon: "eye-off", text: `${event.key === "observer" ? "侦查守卫" : "岗哨守卫"}失效`, value: event.reason_text === "killed" ? "被拆除" : "自然消失" };
  if (event.kind === "objective") return { ...base, category: "objective", type: "目标", icon: "landmark", text: objectiveTitle(event), value: "目标事件" };
  return base;
}

function objectiveTitle(event) {
  const kind = event.objective_kind || event.kind;
  if (kind === "roshan") return "击杀肉山";
  if (kind === "aegis") return "拾取不朽之守护";
  if (kind === "courier") return "击杀信使";
  const target = String(event.target || "");
  if (target.includes("tower")) return "摧毁防御塔";
  if (target.includes("rax")) return "摧毁兵营";
  if (target.includes("fort")) return "摧毁遗迹";
  return "建筑目标事件";
}

function hydrateSelectedHeroModules(slot = state.selectedHeroSlot) {
  const modules = state.currentAnalysis?.modules;
  if (!modules) return;
  const key = String(slot);
  const snapshots = modules.snapshots?.[key] || [];
  replaceArray(ROUTE_POINTS, snapshots
    .filter((point, index) => index % 5 === 0 && point.coordinate_valid !== false
      && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
    .map((point) => [eventTimeSeconds(point, point.second), point.x, point.y]));

  const segments = (modules.development?.segments_by_slot?.[key] || []).map((segment) => {
    const type = segment.type === "neutral" ? "farm" : segment.type;
    const typeLabel = type === "lane" ? "兵线发育" : type === "farm" ? "野区发育" : "战斗与目标";
    return {
      ...segment,
      type,
      title: `${formatTime(segment.start)} ${typeLabel}`,
      region: regionName(segment.region),
      creeps: Number(segment.units) || 0,
      missed: null,
      confidence: "推导",
    };
  });
  replaceArray(SEGMENTS, segments);

  const build = modules.build?.by_slot?.[key] || {};
  replaceArray(ITEM_EVENTS, (build.purchases || []).map((event) => ({ ...normalizeTimedEvent(event), action: eventTimeMs(event) <= 0 ? "初始装备" : "购买" })));
  replaceArray(ABILITY_EVENTS, (build.abilities || []).map((event) => ({ ...normalizeTimedEvent(event), level: event.value, name: abilityName(event.key) })));

  replaceArray(FARM_HEAT_CELLS, (modules.farm?.heat_cells_by_slot?.[key] || []).map((cell) => ({ ...cell, region: regionName(cell.region) })));
  const anomalyRows = modules.farm?.anomalies_by_slot?.[key] || [];
  const relativeLowRows = modules.farm?.relative_lows_by_slot?.[key] || [];
  const diagnosticRows = anomalyRows.length || relativeLowRows.length
    ? [...anomalyRows, ...relativeLowRows]
    : (modules.farm?.diagnostics_by_slot?.[key] || []);
  replaceArray(FARM_DIAGNOSTICS, diagnosticRows
    .map((diagnostic) => ({ ...diagnostic, reason: farmDiagnosticReason(diagnostic) }))
    .sort((left, right) => Number(left.time || 0) - Number(right.time || 0)));
  Object.assign(FARM_MECHANICS, modules.farm?.mechanics || {});
  replaceArray(FARM_STACK_EVENTS, (modules.farm?.stack_events_by_slot?.[key] || []).map((event) => ({ ...event, region: regionName(event.region) })));
  replaceArray(FARM_LANE_JUNGLE_CYCLES, modules.farm?.lane_jungle_cycles_by_slot?.[key] || []);
  replaceArray(FARM_CREEP_RESOLUTIONS, modules.farm?.creep_resolutions || []);
  replaceObject(FARM_LANE_OPPORTUNITY, modules.farm?.lane_opportunities_by_slot?.[key] || { summary: {}, events: [] });
  replaceObject(FARM_STACK_VALUE_SUMMARY, modules.farm?.stack_value_summary_by_slot?.[key] || {});

  const resourcePosition = Number(FARM_LANE_OPPORTUNITY.position || 0);
  const post20Diagnostics = FARM_DIAGNOSTICS.filter((diagnostic) => Number(diagnostic.time || 0) >= 1200);
  state.farmTimeWindow = resourcePosition > 0 && resourcePosition <= 3 && post20Diagnostics.length
    ? "post20" : "pre20";
  const preferredDiagnostics = state.farmTimeWindow === "post20" ? post20Diagnostics : FARM_DIAGNOSTICS;
  const preferredDiagnostic = preferredDiagnostics.find((diagnostic) => diagnostic.recommendation_enabled)
    || preferredDiagnostics.find((diagnostic) => diagnostic.diagnostic_class === "anomaly")
    || preferredDiagnostics[0];

  state.selectedSegmentId = SEGMENTS[0]?.id || null;
  state.selectedFarmDiagnosticId = preferredDiagnostic?.id || null;
}

function hydrateAnalysisModules(analysis) {
  normalizeAnalysisSnapshots(analysis);
  const modules = analysis?.modules;
  if (!modules) throw new Error("分析包缺少产品模块，请重新解析这场比赛");
  const playerFactsBySlot = modules.players?.by_slot || {};
  HEROES.forEach((hero, slot) => {
    const playerFacts = playerFactsBySlot[String(slot)];
    if (!playerFacts) return;
    const laning = modules.laning?.positions_by_slot?.[String(slot)] || {};
    hero.taken = Number(playerFacts.damage_taken) || 0;
    hero.vision = Number(playerFacts.vision_score) || 0;
    hero.position = Number(playerFacts.position || laning.position) || hero.position;
    hero.lane = laning.lane || hero.lane || "unknown";
    hero.roleConfidence = Number(playerFacts.role_confidence || laning.confidence) || hero.roleConfidence || 0;
    hero.facts = playerFacts;
    hero.report = playerFacts.report || null;
  });
  state.snapshotCache.clear();
  Object.entries(modules.snapshots || {}).forEach(([slot, rows]) => state.snapshotCache.set(Number(slot), rows));

  replaceArray(WARD_RECORDS, (modules.vision?.wards || []).map((ward) => ({
    ...ward,
    placedAt: Number(ward.placedAtMs ?? ward.placedAt * 1000) / 1000,
    endedAt: Number(ward.endedAtMs ?? ward.endedAt * 1000) / 1000,
    playerSlot: ward.playerSlot == null ? null : Number(ward.playerSlot),
    region: regionName(ward.region),
    endReason: ward.endReason === "killed" ? "被反眼" : "自然消失",
    objective: ward.type === "observer" ? "英雄视野（几何推导）" : "反眼控制（事件推导）",
    detectionEvents: ward.detectionEvents || [],
  })));
  replaceArray(WARD_EVENTS, WARD_RECORDS
    .filter((ward) => ward.coordinate_valid !== false && Number.isFinite(Number(ward.x)) && Number.isFinite(Number(ward.y)))
    .map((ward) => ({ time: ward.placedAt, x: ward.x, y: ward.y, region: ward.region, location: ward.region, type: "ward", title: `${wardTypeMeta(ward.type).name} · ${ward.region}` })));

  state.visibilityByTeam = modules.vision?.visibility_by_team || {};
  state.mapCalibration = modules.coordinate_system || null;
  replaceArray(FARM_LANE_WAVES, modules.farm?.lane_waves || []);
  replaceArray(FARM_CAMP_STATES, modules.farm?.camp_states || []);
  replaceArray(CAMP_MARKERS, FARM_CAMP_STATES
    .filter((camp) => camp.coordinate_valid !== false && Number.isFinite(Number(camp.x)) && Number.isFinite(Number(camp.y)))
    .map((camp) => {
      const rawX = Number(camp.coordinate_raw?.x);
      const rawY = Number(camp.coordinate_raw?.y);
      const rawPosition = Number.isFinite(rawX) && Number.isFinite(rawY)
        ? ` · 实体坐标 ${rawX.toFixed(2)}, ${rawY.toFixed(2)}`
        : "";
      return {
        id: camp.id,
        x: Number(camp.x),
        y: Number(camp.y),
        type: "camp",
        static: true,
        title: `Replay 营地锚点 · 地图 ${Number(camp.x).toFixed(2)}%, ${Number(camp.y).toFixed(2)}%${rawPosition}`,
        camp,
      };
    }));

  replaceArray(UNIT_KILL_STATS, (modules.farm?.unit_kills || []).map((row) => ({ ...row, other: row.other ? String(row.other) : "—" })));
  replaceArray(COMBAT_SEGMENTS, (modules.combat?.fights || []).map((fight) => {
    const location = regionName(fight.region);
    const kind = ({ teamfight: "团战", skirmish: "小规模冲突", pickoff: "抓单", lane_trade: "线上换血", harass: "线上消耗" })[fight.kind] || "战斗片段";
    const context = (fight.classification?.context_tags || [])
      .map((tag) => COMBAT_CONTEXT_NAMES[tag])
      .filter(Boolean)
      .filter((tag) => tag !== "兵线区域")
      .slice(0, 2);
    return {
      ...fight,
      start: Number(fight.review_start_ms ?? fight.start * 1000) / 1000,
      end: Number((fight.contact_end_ms ?? fight.contact_end * 1000) + 4000) / 1000,
      contact_start: Number(fight.contact_start_ms ?? fight.contact_start * 1000) / 1000,
      contact_end: Number(fight.contact_end_ms ?? fight.contact_end * 1000) / 1000,
      peak_start: Number(fight.peak_start_ms ?? fight.peak_start * 1000) / 1000,
      peak_end: Number(fight.peak_end_ms ?? fight.peak_end * 1000) / 1000,
      phases: (fight.phases || []).map((phase) => ({
        ...phase,
        start: Number(phase.start_ms ?? phase.start * 1000) / 1000,
        end: Number(phase.end_ms ?? phase.end * 1000) / 1000,
      })),
      events: (fight.events || []).map((event) => normalizeTimedEvent(event)),
      title: `${location} · ${kind}${context.length ? ` · ${context.join(" / ")}` : ""}`,
      location,
      result: `天辉 ${fight.radiant_deaths} : ${fight.dire_deaths} 夜魇`,
      tone: "info",
      damage: Number(fight.total_damage) || 0,
      damageBySlot: fight.damage_by_slot || {},
      contributions: fight.contributions || [],
      vision: fight.vision || {},
    };
  }));
  replaceArray(OBJECTIVE_EVENTS, (modules.map?.objectives || []).map((event) => ({
    ...normalizeTimedEvent(event),
    type: "objective",
    title: objectiveTitle({ ...event, objective_kind: event.kind }),
    region: regionName(event.region),
    location: regionName(event.region),
    x: event.x == null ? null : Number(event.x),
    y: event.y == null ? null : Number(event.y),
  })));
  replaceArray(ROSHAN_ATTEMPTS, (modules.objectives?.roshan_attempts || []).map((attempt) => ({
    ...attempt,
    start: Number(attempt.start_ms ?? attempt.start * 1000) / 1000,
    end: Number(attempt.end_ms ?? attempt.end * 1000) / 1000,
    x: attempt.x == null ? null : Number(attempt.x),
    y: attempt.y == null ? null : Number(attempt.y),
  })));
  replaceArray(AEGIS_LIFECYCLES, (modules.objectives?.aegis_lifecycles || []).map((aegis) => ({
    ...aegis,
    time: Number(aegis.game_time_ms ?? aegis.time * 1000) / 1000,
    heldUntil: Number(aegis.held_until_ms ?? 0) / 1000,
  })));
  replaceArray(TIMELINE_EVENTS, (modules.timeline?.events || []).map(timelineEventView));
  hydrateSelectedHeroModules(state.selectedHeroSlot);

  state.selectedCombatId = COMBAT_SEGMENTS.find((fight) => (fight.participants || []).includes(state.selectedHeroSlot))?.id || COMBAT_SEGMENTS[0]?.id || null;
  state.selectedCombatPlayerSlot = state.selectedHeroSlot;
  state.selectedWardId = WARD_RECORDS.find((ward) => ward.playerSlot === state.selectedHeroSlot)?.id || WARD_RECORDS[0]?.id || null;
}

function snapshotsFor(slot) {
  if (state.snapshotCache.has(slot)) return state.snapshotCache.get(slot);
  if (state.currentAnalysis) return [];
  const hero = HEROES[slot];
  const killTimes = [421, 761, 786, 1312, 1329, 1578, 2085, 2112];
  const deathTimes = [1034, 1608, 1892];
  const data = Array.from({ length: MATCH_DURATION + 1 }, (_, second) => {
    const factor = hero.factor;
    const killBonus = killTimes.reduce((sum, time) => sum + (second >= time ? 265 : 0), 0) * factor;
    const deathPenalty = deathTimes.reduce((sum, time) => sum + (second >= time ? 85 : 0), 0) * (slot === 0 ? 1 : 0.7);
    const wave = Math.sin((second + slot * 17) / 72) * 55 + Math.sin((second + slot * 9) / 19) * 15;
    const networth = Math.max(600, 600 + second * (6.1 * factor) + killBonus - deathPenalty + wave);
    const gold = Math.max(600, 600 + second * (5.35 * factor) + killBonus * 0.72 + wave * 0.35);
    const xp = Math.max(0, second * (6.8 * factor) + killBonus * 0.88 + Math.sin(second / 88) * 70);
    const lh = Math.max(0, Math.floor(second / (10.2 / factor) + Math.sin(second / 110) * 3));
    return { second, networth: Math.round(networth), gold: Math.round(gold), xp: Math.round(xp), lh };
  });
  state.snapshotCache.set(slot, data);
  return data;
}

function snapshotAtTime(slot, second) {
  const rows = snapshotsFor(slot);
  if (!rows.length) return null;
  const target = clamp(Math.round(second), 0, MATCH_DURATION);
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const time = Number(rows[middle].second);
    if (time === target) return rows[middle];
    if (time < target) low = middle + 1;
    else high = middle - 1;
  }
  const before = rows[Math.max(0, high)];
  const after = rows[Math.min(rows.length - 1, low)];
  return target - Number(before.second) <= Number(after.second) - target ? before : after;
}

function positionAtTime(second, slot = state.selectedHeroSlot) {
  const time = clamp(second, 0, MATCH_DURATION);
  if (state.currentAnalysis) {
    const snapshot = snapshotAtTime(slot, time);
    const x = Number(snapshot?.x);
    const y = Number(snapshot?.y);
    if (snapshot?.coordinate_valid !== false && Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y, region: snapshot.region || "unknown", coordinateSource: snapshot.coordinate_source || "unknown" };
    }
    return null;
  }
  let previous = ROUTE_POINTS[0];
  let next = ROUTE_POINTS[ROUTE_POINTS.length - 1];
  for (let index = 1; index < ROUTE_POINTS.length; index += 1) {
    if (ROUTE_POINTS[index][0] >= time) {
      previous = ROUTE_POINTS[index - 1];
      next = ROUTE_POINTS[index];
      break;
    }
  }
  const span = Math.max(1, next[0] - previous[0]);
  const progress = (time - previous[0]) / span;
  let x = previous[1] + (next[1] - previous[1]) * progress;
  let y = previous[2] + (next[2] - previous[2]) * progress;
  const offset = (slot % 5) * 1.2;
  x += Math.sin(time / 48 + slot) * 1.4 + offset;
  y += Math.cos(time / 57 + slot) * 1.2 - offset * 0.4;
  if (slot >= 5) {
    x = 100 - x;
    y = 100 - y;
  }
  return { x: clamp(x, 5, 95), y: clamp(y, 5, 95) };
}

function observedPositionAtTime(second, slot = state.selectedHeroSlot) {
  if (!state.currentAnalysis) return positionAtTime(second, slot);
  const snapshot = snapshotAtTime(slot, clamp(second, 0, MATCH_DURATION));
  if (snapshot?.x == null || snapshot?.y == null) return null;
  const x = Number(snapshot.x);
  const y = Number(snapshot.y);
  return Number.isFinite(x) && Number.isFinite(y) && snapshot.coordinate_valid !== false
    ? { x, y, region: snapshot.region || "unknown" } : null;
}

function regionForPosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return "位置未知";
  if (x < 24 && y > 75) return "天辉基地";
  if (x > 76 && y < 25) return "夜魇基地";
  if (Math.abs(x + y - 100) <= 12 && x >= 28 && x <= 72 && y >= 28 && y <= 72) return "中路";
  if ((x <= 27 && y <= 58) || (y <= 27 && x <= 58)) return "上路";
  if ((x >= 73 && y >= 42) || (y >= 73 && x >= 42)) return "下路";
  if (x < 43 && y > 55) return "天辉主野区";
  if (x > 57 && y < 45) return "夜魇主野区";
  return "河道交汇区";
}

function renderMatches() {
  const list = document.querySelector("#matches-list");
  const resultCount = document.querySelector("#match-result-count");
  if (state.matchesStatus === "loading") {
    list.innerHTML = Array.from({ length: 7 }, () => `<div class="match-row match-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>`).join("");
    resultCount.textContent = "正在从 OpenDota 读取最近比赛";
    return;
  }
  if (state.matchesStatus === "error") {
    list.innerHTML = `<div class="match-empty-state"><span class="empty-state-icon negative"><i data-lucide="plug-zap"></i></span><strong>比赛列表暂时不可用</strong><p>${escapeHtml(state.matchesError)}</p><button class="command-button secondary" type="button" data-retry-matches><i data-lucide="refresh-cw"></i><span>重新连接</span></button></div>`;
    resultCount.textContent = "未读取到比赛";
    refreshIcons(list);
    return;
  }
  if (state.matchesStatus === "idle") {
    list.innerHTML = `<div class="match-empty-state"><span class="empty-state-icon"><i data-lucide="user-round-search"></i></span><strong>输入 Steam 数字 ID</strong><p>本地解析器会读取该账号最近 20 场比赛，并标出可自动解析的场次。</p></div>`;
    resultCount.textContent = "等待账号";
    refreshIcons(list);
    return;
  }
  if (!state.matches.length) {
    const guidance = matchHistoryGuidance(state.matchesAvailability);
    list.innerHTML = `
      <div class="match-empty-state match-private-state">
        <span class="empty-state-icon warning"><i data-lucide="shield-alert"></i></span>
        <strong>${escapeHtml(guidance.title)}</strong>
        <p>${escapeHtml(guidance.detail)}</p>
        <div class="empty-state-actions">
          <button class="command-button" type="button" data-import-private-replay><i data-lucide="file-plus-2"></i><span>导入本机 Replay</span></button>
          <button class="command-button secondary" type="button" data-scan-private-replays><i data-lucide="scan-search"></i><span>扫描 Replay 目录</span></button>
        </div>
      </div>`;
    resultCount.textContent = state.matchesAvailability?.likely_immortal_draft
      ? "公开 API 不包含 8500+ Immortal Draft 对局"
      : "公开比赛历史为空";
    refreshIcons(list);
    return;
  }

  const search = document.querySelector("#match-search").value.trim().toLowerCase();
  const filtered = state.matches.filter((match) => {
    const statusMatches = state.matchFilter === "all" || match.status === state.matchFilter;
    const searchMatches = !search || match.id.includes(search) || match.hero.name.toLowerCase().includes(search);
    return statusMatches && searchMatches;
  });
  if (!filtered.length) {
    list.innerHTML = `<div class="match-empty-state"><span class="empty-state-icon"><i data-lucide="list-x"></i></span><strong>没有符合条件的比赛</strong><p>调整状态筛选或搜索内容后再看。</p></div>`;
    resultCount.textContent = `显示 0 / ${state.matches.length} 场比赛`;
    refreshIcons(list);
    return;
  }
  list.innerHTML = filtered.map((match) => {
    const meta = STATUS_META[match.status] || STATUS_META.basic;
    const statusDetail = match.recoverable ? "检测到本地缓存，可继续解析" : meta.detail;
    const progress = match.status === "processing" ? Math.max(2, match.progress || 2) : null;
    const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
    const result = match.win == null
      ? { label: "本地", className: "neutral" }
      : match.win
        ? { label: "胜利", className: "positive" }
        : { label: "失败", className: "negative" };
    return `
      <button class="match-row match-row-${match.status}" type="button" role="listitem" data-match-id="${match.id}" aria-label="${escapeHtml(match.hero.name)} ${result.label}，${meta.label}">
        <span class="match-identity">
          <img src="${heroImage(match.hero.token)}" alt="${escapeHtml(match.hero.name)}">
          <span><strong><b class="match-result ${result.className}">${result.label}</b>${escapeHtml(match.hero.name)}</strong><small>${escapeHtml(match.date)} · ${escapeHtml(match.mode)}</small></span>
        </span>
        <span class="row-stat">${match.kills} / ${match.deaths} / ${match.assists}<small>KDA ${kda < 10 ? kda.toFixed(2) : "10+"}</small></span>
        <span class="row-stat">${match.lh} / ${match.denies == null ? "--" : match.denies}<small>补刀 / 反补</small></span>
        <span class="row-stat">${match.gpm} / ${match.xpm}<small>GPM / XPM</small></span>
        <span class="row-stat">${formatTime(match.duration)}<small>${match.id}</small></span>
        <span><span class="data-status ${match.status}"><i data-lucide="${meta.icon}"></i>${progress ? `${progress}%` : meta.label}</span>${progress ? `<span class="progress-mini"><span style="width:${progress}%"></span></span>` : `<small class="status-detail">${statusDetail}</small>`}</span>
        <span class="match-open-icon"><i data-lucide="${match.status === "full" ? "arrow-up-right" : match.status === "processing" ? "activity" : "play"}"></i></span>
      </button>
    `;
  }).join("");
  resultCount.textContent = `显示 ${filtered.length} / ${state.matches.length} 场比赛${state.matchesOffline ? " · 离线缓存" : ""}`;
  refreshIcons(list);
}

function renderHeroStrip() {
  const strip = document.querySelector("#hero-strip");
  const buttons = HEROES.map((hero, index) => `
    <button class="hero-button ${state.selectedHeroSlot === hero.slot ? "active" : ""} ${hero.me ? "me" : ""}" type="button" data-hero-slot="${hero.slot}" title="${hero.name} · ${hero.player} · ${positionLabel(hero.position)}">
      <img src="${heroImage(hero.token)}" alt="${hero.name}">
      <span class="hero-position-badge">P${Number(hero.position) || index % 5 + 1}</span>
    </button>
  `);
  const radiantScore = state.currentAnalysis?.match?.radiant_score ?? 31;
  const direScore = state.currentAnalysis?.match?.dire_score ?? 24;
  strip.innerHTML = `${buttons.slice(0, 5).join("")}<span class="hero-strip-score"><strong>${radiantScore}</strong><span>:</span><strong>${direScore}</strong></span>${buttons.slice(5).join("")}`;
}

function signedValue(value, suffix = "") {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${number.toLocaleString("zh-CN")}${suffix}`;
}

function setDevelopmentSideView(view) {
  state.developmentSideView = view === "segments" ? "segments" : "lane";
  document.querySelectorAll("#development-side-tabs [data-development-side]").forEach((button) => {
    button.classList.toggle("active", button.dataset.developmentSide === state.developmentSideView);
  });
  const lane = document.querySelector("#lane-review");
  const segments = document.querySelector("#segment-review");
  lane.hidden = state.developmentSideView !== "lane";
  segments.hidden = state.developmentSideView !== "segments";
  document.querySelector("#development-side-title").textContent = state.developmentSideView === "lane" ? "分路与线况" : "发育片段";
}

function renderLaneReview() {
  const root = document.querySelector("#lane-review");
  if (!root) return;
  const review = laneReviewForSlot();
  if (!review) {
    root.innerHTML = `<div class="lane-review-empty"><strong>等待分路识别</strong><small>重新解析比赛后生成 3 / 5 / 7 / 10 分钟线况</small></div>`;
    return;
  }
  const selected = safeHero(state.selectedHeroSlot);
  const opponent = safeHero(matchupSlotFor(state.selectedHeroSlot));
  const ownCore = safeHero(review.own_core_slot);
  const enemyCore = safeHero(review.enemy_core_slot);
  const support = review.own_support_slot == null ? null : safeHero(review.own_support_slot);
  const enemySupport = review.enemy_support_slot == null ? null : safeHero(review.enemy_support_slot);
  const verdict = LANE_VERDICT_META[review.verdict] || LANE_VERDICT_META.even;
  const laneRole = Number(review.position) === 2 ? "中路单人线" : [1, 5].includes(Number(review.position)) ? "优势路双人组" : "劣势路双人组";
  const core = review.core || {};
  const pair = review.lane_pair || {};
  const supportComparison = review.support || {};
  const route = review.support_route || {};
  const supportRoute = (route.route || []).filter((segment) => Number(segment.end) - Number(segment.start) >= 10);
  const checkpoints = review.checkpoints || [];
  const score = Number(review.score) || 0;
  root.innerHTML = `
    <div class="lane-verdict-head">
      <div class="lane-matchup-identity">
        <img src="${heroImage(selected.token)}" alt="${escapeHtml(selected.name)}">
        <span class="lane-matchup-copy"><strong>${escapeHtml(selected.name)} · ${positionLabel(selected.position)}</strong><small>${LANE_NAMES_ZH[review.lane] || "分路待识别"} · ${laneRole}</small></span>
        <i>VS</i>
        <img src="${heroImage(opponent.token)}" alt="${escapeHtml(opponent.name)}" title="${escapeHtml(opponent.name)} · ${positionLabel(opponent.position)}">
      </div>
      <span class="lane-verdict-score ${verdict.tone}"><strong>${score > 0 ? "+" : ""}${score}</strong><span>${verdict.label}</span></span>
    </div>
    <div class="lane-metric-grid">
      <span><small>核心补 / 反补差 · ${ownCore.name} 对 ${enemyCore.name}</small><strong>${signedValue(core.last_hits_diff)} / ${signedValue(core.denies_diff)}</strong></span>
      <span><small>核心等级差</small><strong>${signedValue(core.level_diff, " 级")}</strong></span>
      <span><small>核心累计经验差</small><strong>${signedValue(core.xp_diff)}</strong></span>
      <span><small>双人总经验差</small><strong>${signedValue(pair.xp_diff)}</strong></span>
      ${support ? `<span><small>${positionLabel(support.position)}经验差 · 对 ${escapeHtml(enemySupport?.name || "对位辅助")}</small><strong>${signedValue(supportComparison.xp_diff)}</strong></span>` : ""}
      <span><small>双人净值差 · 交叉校验</small><strong>${signedValue(pair.networth_diff)}</strong></span>
    </div>
    <div class="lane-checkpoints">
      ${checkpoints.map((point) => {
        const meta = LANE_VERDICT_META[point.verdict] || LANE_VERDICT_META.even;
        return `<span class="lane-checkpoint"><time>${formatTime(point.time)}</time><strong>${Number(point.score) > 0 ? "+" : ""}${Number(point.score) || 0}</strong><small>${meta.label} · 补 ${signedValue(point.last_hits_diff)}</small></span>`;
      }).join("")}
    </div>
    ${support ? `<div class="lane-support-audit">
      <div><h3>${positionLabel(support.position)} ${escapeHtml(support.name)} · 路线影响</h3><span>在路 ${Number(route.lane_presence_pct || 0).toFixed(1)}% · 核辅经验差 ${signedValue(supportComparison.own_core_support_xp_gap)}</span></div>
      <p>${escapeHtml(route.interpretation || "辅助路线证据不足")}</p>
      <div class="lane-support-metrics"><span>离线 ${formatTime(route.away_seconds || 0)}</span><span>核心单吃经验 ${formatTime(route.core_solo_xp_seconds || 0)}</span><span>叠野 ${Number(route.stacks || 0)}</span><span>控符 ${Number(route.runes || 0)}</span><span>离线插眼 ${Number(route.wards || 0)}</span><span>离线助攻 ${Number(route.away_assists || 0)}</span><span>核心阵亡 ${Number(route.core_deaths_away || 0)}</span></div>
      ${supportRoute.length ? `<div class="lane-support-route" aria-label="辅助路线时间轴">${supportRoute.map((segment) => `<span><time>${formatTime(segment.start)}-${formatTime(segment.end)}</time>${escapeHtml(regionName(segment.region))}</span>`).join("")}</div>` : `<small class="lane-route-empty">辅助路线片段不足</small>`}
    </div>` : `<div class="lane-support-audit"><div><h3>中路单人线</h3><span>2号位对2号位</span></div><p>中路以补刀、反补、等级节点、经验与线上阵亡为主，不套用边路辅助分摊模型。</p></div>`}
    <small class="lane-evidence-note">置信度 ${Number(review.confidence || 0)}% · 暂缺 ${(review.missing || []).join("、")}，因此塔压与精确拉野影响不计入硬分。</small>
  `;
  installImageFallback(root, heroImage("unknown"));
}

function renderSegments() {
  const visible = SEGMENTS.filter((segment) => state.segmentFilter === "all" || segment.type === state.segmentFilter);
  const list = document.querySelector("#segment-list");
  if (!visible.length) {
    list.innerHTML = `<div class="coverage-empty"><i data-lucide="route-off"></i><span>该英雄没有可用的资源片段</span></div>`;
    document.querySelector("#segment-inspector").innerHTML = "";
    refreshIcons(list);
    return;
  }
  list.innerHTML = visible.map((segment) => `
    <button class="segment-row ${state.selectedSegmentId === segment.id ? "active" : ""}" type="button" data-segment-id="${segment.id}">
      <time class="segment-time">${formatTime(segment.start)}<br>${formatTime(segment.end)}</time>
      <span class="segment-main"><strong>${segment.title}</strong><small>${segment.region} · ${segment.end - segment.start} 秒</small></span>
      <span class="segment-values"><strong>+${segment.gold}g</strong><small>${segment.missed == null ? `${segment.creeps} 个资源事件` : segment.missed ? `错过 ${segment.missed} 兵` : "无漏线"}</small></span>
    </button>
  `).join("");
  renderSegmentInspector();
}

function renderSegmentInspector() {
  const segment = SEGMENTS.find((item) => item.id === state.selectedSegmentId) || SEGMENTS[0];
  if (!segment) {
    document.querySelector("#segment-inspector").innerHTML = "";
    return;
  }
  const confidenceClass = segment.confidence === "事实" ? "fact" : "derived";
  document.querySelector("#segment-inspector").innerHTML = `
    <div class="segment-inspector-head"><strong>${segment.title}</strong><span class="evidence-tag ${confidenceClass}">${segment.confidence === "事实" ? "事实" : "按分钟归因"}</span></div>
    <div class="segment-evidence"><span><small>资源事件</small><strong>${segment.creeps} 个</strong></span><span><small>经验变化</small><strong>+${segment.xp}</strong></span><span><small>漏线估计</small><strong>${segment.missed == null ? "暂无兵线单位轨迹" : segment.missed ? `约 ${segment.missed * 43}g` : "0"}</strong></span></div>
  `;
}

function renderTimelineMarkers() {
  const markers = [
    ...SEGMENTS.filter((segment) => segment.type === "farm").map((segment) => ({ time: segment.start, type: "farm" })),
    ...COMBAT_SEGMENTS.map((fight) => ({ time: fight.start, type: "combat" })),
    ...ITEM_EVENTS.filter((event) => event.time > 0).map((event) => ({ time: event.time, type: "item" })),
    ...WARD_RECORDS.map((ward) => ({ time: ward.placedAt, type: "vision" })),
    ...OBJECTIVE_EVENTS.map((event) => ({ time: event.time, type: "objective" })),
  ];
  document.querySelector("#timeline-markers").innerHTML = markers.map((marker) => `<span class="timeline-marker ${marker.type}" style="left:${(marker.time / MATCH_DURATION) * 100}%"></span>`).join("");
}

function markerHtml(marker) {
  if (!Number.isFinite(Number(marker.x)) || !Number.isFinite(Number(marker.y))) return "";
  const icon = marker.type === "camp" ? "trees" : marker.type === "ward" ? "eye" : marker.type === "objective" ? "landmark" : "swords";
  const title = marker.static ? marker.title : `${formatTime(marker.time)} · ${marker.title}`;
  const actionAttribute = marker.static
    ? `data-map-marker-id="${escapeHtml(marker.id || marker.type)}" aria-disabled="true"`
    : `data-map-time="${Number(marker.time)}"`;
  return `<button class="map-pin ${marker.type}" type="button" ${actionAttribute} style="left:${marker.x}%;top:${marker.y}%" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><i data-lucide="${icon}"></i></button>`;
}

function combatMapMarkers() {
  return COMBAT_SEGMENTS.map((fight) => {
    const position = fight.x != null && fight.y != null
      ? { x: Number(fight.x), y: Number(fight.y) }
      : state.currentAnalysis ? null : positionAtTime(fight.start, state.selectedHeroSlot);
    return position ? { time: fight.start, x: position.x, y: position.y, region: fight.location,
      location: fight.location, type: "combat", title: fight.title } : null;
  }).filter(Boolean);
}

const MAP_REFERENCE_PATCH = "7.40";

function renderDevelopmentMapCalibration() {
  const badge = document.querySelector("#development-map-calibration");
  const campLabel = document.querySelector('[data-dev-layer="camps"] span');
  if (campLabel) campLabel.textContent = `营地 ${CAMP_MARKERS.length}`;
  if (!badge) return;

  const analysis = state.currentAnalysis;
  const farmLoaded = Boolean(analysis?.modules?.farm);
  const patchLabel = String(analysis?.match?.patch_name || "").replace(/^Patch\s*/i, "");
  const patchSeries = patchLabel.match(/\d+\.\d+/)?.[0] || "";
  const mapMismatch = Boolean(patchSeries && patchSeries !== MAP_REFERENCE_PATCH);
  const calibrationProfile = state.mapCalibration?.calibration_profile || state.mapCalibration?.profile || "Replay 动态校准";
  const mapImage = document.querySelector("#development-map > img:first-child");

  badge.classList.remove("ready", "patch-mismatch");
  if (analysis && !farmLoaded) {
    badge.textContent = "营地坐标加载中";
    badge.title = "正在读取 Replay 的 CDOTA_NeutralSpawner 营地实体";
  } else if (analysis && CAMP_MARKERS.length) {
    badge.classList.add(mapMismatch ? "patch-mismatch" : "ready");
    badge.textContent = mapMismatch
      ? `${patchSeries} 坐标 / ${MAP_REFERENCE_PATCH} 图`
      : `Replay 坐标 · ${CAMP_MARKERS.length} 营地`;
    badge.title = `坐标来自 ${patchLabel || "当前"} Replay 的 CDOTA_NeutralSpawner，共 ${CAMP_MARKERS.length} 个；校准 ${calibrationProfile}${mapMismatch ? `；当前贴图为 ${MAP_REFERENCE_PATCH} 参考图，已在游戏内移动的地形可能与标记存在视觉差异` : ""}`;
  } else if (analysis) {
    badge.textContent = "未发现营地实体";
    badge.title = "该 Replay 的 farm 模块没有返回有效 CDOTA_NeutralSpawner 坐标";
  } else {
    badge.classList.add("ready");
    badge.textContent = `演示营地 · ${CAMP_MARKERS.length}`;
    badge.title = "当前为界面演示数据；载入 Replay 后将替换为营地生成器实体坐标";
  }

  if (mapImage) {
    mapImage.alt = `Dota 2 ${MAP_REFERENCE_PATCH} 参考底图`;
    mapImage.title = badge.title;
  }
}

function renderMapMarkers() {
  const developmentMarkers = [
    ...(state.devLayers.camps ? CAMP_MARKERS : []),
    ...(state.devLayers.events ? [...combatMapMarkers(), ...OBJECTIVE_EVENTS] : []),
  ];
  const devLayer = document.querySelector("#development-map-markers");
  devLayer.innerHTML = developmentMarkers.map(markerHtml).join("");

  const fullMarkers = [
    ...(state.mapLayers.camps ? CAMP_MARKERS : []),
    ...(state.mapLayers.wards ? WARD_EVENTS : []),
    ...(state.mapLayers.combat ? combatMapMarkers() : []),
    ...(state.mapLayers.objectives ? OBJECTIVE_EVENTS : []),
  ];
  const fullLayer = document.querySelector("#full-map-markers");
  fullLayer.innerHTML = `${state.mapLayers.heat ? renderHeatSpots() : ""}${fullMarkers.map(markerHtml).join("")}`;
  document.querySelector("#full-map-trail").style.display = state.mapLayers.trail ? "block" : "none";
  renderDevelopmentMapCalibration();
  const counts = {
    "map-layer-trail-count": `${snapshotsFor(state.selectedHeroSlot).length.toLocaleString("zh-CN")} 点`,
    "map-layer-heat-count": `${FARM_HEAT_CELLS.length} 区`,
    "map-layer-camps-count": `${CAMP_MARKERS.length} 个`,
    "map-layer-wards-count": `${WARD_RECORDS.length} 个`,
    "map-layer-combat-count": `${COMBAT_SEGMENTS.length} 场`,
    "map-layer-objectives-count": `${OBJECTIVE_EVENTS.length} 个`,
  };
  Object.entries(counts).forEach(([id, value]) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = value;
  });
  refreshIcons(devLayer);
  refreshIcons(fullLayer);
}

function renderHeatSpots() {
  const strongest = [...FARM_HEAT_CELLS].sort((a, b) => b.gold - a.gold).slice(0, 8);
  const maxGold = Math.max(1, ...strongest.map((cell) => cell.gold));
  return strongest.map((cell) => {
    const size = 10 + (cell.gold / maxGold) * 14;
    return `<span class="heat-spot" style="left:${cell.x}%;top:${cell.y}%;width:${size}%;height:${size}%"></span>`;
  }).join("");
}

function wardTypeMeta(type) {
  return type === "observer"
    ? { label: "假眼", name: "侦查守卫", item: "ward_observer", radiusLabel: "1600 视野" }
    : { label: "真眼", name: "岗哨守卫", item: "ward_sentry", radiusLabel: "1050 真视" };
}

function wardRangeDiameter(ward) {
  const radius = Number(ward?.radius) || (ward?.type === "observer" ? 1600 : 1050);
  return clamp((radius * 2 / (128 * 128)) * 100, 4, 32);
}

function wardPurposeLabel(purpose) {
  return purpose === "offense" ? "进攻眼" : "防守眼";
}

function wardGrade(score) {
  if (score >= 90) return "S";
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function wardIsActive(ward, time = state.currentTime) {
  return time >= ward.placedAt && time <= ward.endedAt;
}

function filteredWards() {
  return WARD_RECORDS.filter((ward) => (
    (state.wardFilters.team === "all" || ward.team === state.wardFilters.team)
    && (state.wardFilters.player === "all" || String(ward.playerSlot) === state.wardFilters.player)
    && (state.wardFilters.type === "all" || ward.type === state.wardFilters.type)
    && (state.wardFilters.purpose === "all" || ward.purpose === state.wardFilters.purpose)
  ));
}

function renderWardFilterOptions() {
  const select = document.querySelector("#ward-player-filter");
  const slots = [...new Set(WARD_RECORDS.map((ward) => ward.playerSlot).filter((slot) => slot != null))].sort((a, b) => a - b);
  select.innerHTML = `<option value="all">全部玩家</option>${slots.map((slot) => {
    const hero = safeHero(slot);
    return `<option value="${slot}">${hero.name} · ${hero.player}</option>`;
  }).join("")}`;
  select.value = state.wardFilters.player;
}

function renderWardSummary(wards) {
  const count = wards.length;
  const totalDuration = wards.reduce((sum, ward) => sum + Number(ward.duration ?? ward.endedAt - ward.placedAt), 0);
  const averageDuration = count ? Math.round(totalDuration / count) : 0;
  const detections = wards.reduce((sum, ward) => sum + ward.detections, 0);
  const dewards = wards.reduce((sum, ward) => sum + ward.dewards, 0);
  const conversions = wards.reduce((sum, ward) => sum + ward.conversions, 0);
  const score = count ? Math.round(wards.reduce((sum, ward) => sum + ward.score, 0) / count) : 0;
  const metrics = [
    ["eye", "眼位", String(count), `${wards.filter((ward) => ward.type === "observer").length} 假眼 · ${wards.filter((ward) => ward.type === "sentry").length} 真眼`],
    ["timer", "平均存活", formatTime(averageDuration), `${wards.filter((ward) => ward.endReason === "被反眼").length} 个被拆除`],
    ["scan-eye", "敌方发现", `${detections} 次`, `${new Set(wards.flatMap((ward) => ward.detectionEvents.map((event) => event.heroSlot))).size} 名英雄`],
    ["shield-check", "有效反眼", `${dewards} 个`, "岗哨与拆眼事件"],
    ["swords", "战斗转化", `${conversions} 次`, "发现后 20 秒内"],
    ["gauge", "平均评分", String(score), `${score >= 82 ? "高价值视野" : score >= 70 ? "有效视野" : "仍可优化"}`],
  ];
  const root = document.querySelector("#ward-summary");
  root.innerHTML = metrics.map(([icon, label, value, detail]) => `
    <span class="ward-summary-item"><i data-lucide="${icon}"></i><span><small>${label}</small><strong>${value}</strong><em>${detail}</em></span></span>
  `).join("");
  refreshIcons(root);
}

function renderWardList(wards) {
  const list = document.querySelector("#ward-list");
  document.querySelector("#ward-filter-count").textContent = `${wards.length} 个`;
  if (!wards.length) {
    list.innerHTML = `<div class="ward-empty"><i data-lucide="eye-off"></i><strong>没有符合条件的眼位</strong><small>调整玩家或眼位类型筛选</small></div>`;
    refreshIcons(list);
    return;
  }
  list.innerHTML = wards.map((ward) => {
    const hero = safeHero(ward.playerSlot);
    const meta = wardTypeMeta(ward.type);
    const duration = Number(ward.duration ?? ward.endedAt - ward.placedAt);
    return `
      <button class="ward-list-row ${state.selectedWardId === ward.id ? "active" : ""} ${wardIsActive(ward) ? "live-now" : ""} ${ward.team}" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}">
        <span class="ward-icon-stack"><img src="${itemImage(meta.item)}" alt="${meta.name}"><img src="${heroImage(hero.token)}" alt="${hero.name}"></span>
        <span class="ward-list-main"><strong>${ward.region}</strong><small>${hero.name} · ${wardPurposeLabel(ward.purpose)} · ${meta.label}</small></span>
        <span class="ward-list-life"><strong>${formatTime(ward.placedAt)}</strong><small>存活 ${formatTime(duration)}</small></span>
        <span class="ward-list-score ${ward.score >= 82 ? "high" : ward.score < 65 ? "low" : ""}"><strong>${ward.score}</strong><small>${ward.detections} 次发现</small></span>
      </button>
    `;
  }).join("");
}

function renderWardInspector() {
  const ward = WARD_RECORDS.find((item) => item.id === state.selectedWardId);
  const root = document.querySelector("#ward-inspector");
  if (!ward) {
    root.innerHTML = "";
    return;
  }
  const hero = safeHero(ward.playerSlot);
  const meta = wardTypeMeta(ward.type);
  const duration = Number(ward.duration ?? ward.endedAt - ward.placedAt);
  const firstContact = ward.detectionEvents[0] ? ward.detectionEvents[0].time - ward.placedAt : null;
  const components = [
    ["情报", clamp(Math.round((ward.detections / 9) * 100), 20, 100)],
    ["时机", firstContact == null ? 45 : clamp(100 - firstContact, 32, 96)],
    ["转化", clamp(38 + ward.conversions * 26 + ward.dewards * 9, 30, 100)],
    ["覆盖", clamp(100 - ward.overlap, 35, 100)],
  ];
  const uniqueSlots = [...new Set(ward.detectionEvents.map((event) => event.heroSlot))];
  const insight = `${wardPurposeLabel(ward.purpose)}在${ward.region}实际存在 ${formatTime(duration)}。几何模型估算发现敌方 ${ward.detections} 次、覆盖 ${ward.uniqueEnemies} 名英雄。${ward.conversions ? `其中 ${ward.conversions} 次在 20 秒内转化为击杀。` : "未观察到直接击杀转化。"}${ward.overlap >= 25 ? ` 与己方同类眼位重叠约 ${ward.overlap}%。` : ` 与己方同类眼位重叠较低。`}`;
  root.innerHTML = `
    <div class="ward-inspector-head">
      <span class="ward-inspector-identity"><img src="${itemImage(meta.item)}" alt="${meta.name}"><span><small>${meta.name} · ${wardPurposeLabel(ward.purpose)}</small><strong>${ward.region}</strong><em>${hero.name} · ${hero.player}</em></span></span>
      <span class="ward-inspector-score"><small>眼位评分</small><strong>${ward.score}</strong><em>${wardGrade(ward.score)} 级</em></span>
    </div>
    <div class="ward-inspector-metrics">
      <span><small>存在时间</small><strong>${formatTime(ward.placedAt)} - ${formatTime(ward.endedAt)}</strong></span>
      <span><small>存活</small><strong>${formatTime(duration)}</strong></span>
      <span><small>发现单位</small><strong>${ward.detections} 次 / ${ward.uniqueEnemies} 人</strong></span>
      <span><small>首次发现</small><strong>${firstContact == null ? "—" : `+${formatTime(firstContact)}`}</strong></span>
      <span><small>真视收益</small><strong>${ward.dewards ? `${ward.dewards} 个反眼` : "无拆眼"}</strong></span>
      <span><small>结束原因</small><strong id="ward-inspector-status">${ward.endReason}</strong></span>
    </div>
    <div class="ward-score-components">${components.map(([label, value]) => `<span><small>${label}</small><i><b style="width:${value}%"></b></i><strong>${value}</strong></span>`).join("")}</div>
    <div class="ward-inspector-foot">
      <span class="ward-detected-heroes">${uniqueSlots.map((slot) => `<img src="${heroImage(safeHero(slot).token)}" alt="${safeHero(slot).name}" title="${safeHero(slot).name}">`).join("")}</span>
      <span><small>${meta.radiusLabel}</small><strong>${ward.objective}</strong></span>
    </div>
    <p class="ward-insight">${insight}</p>
  `;
}

function wardMapViewportMetrics() {
  const shell = document.querySelector("#ward-map-shell");
  const stage = document.querySelector("#ward-map");
  if (!shell || !stage) return null;
  const shellStyle = window.getComputedStyle(shell);
  const horizontalPadding = (Number.parseFloat(shellStyle.paddingLeft) || 0)
    + (Number.parseFloat(shellStyle.paddingRight) || 0);
  const verticalPadding = (Number.parseFloat(shellStyle.paddingTop) || 0)
    + (Number.parseFloat(shellStyle.paddingBottom) || 0);
  return {
    shell,
    stage,
    shellRect: shell.getBoundingClientRect(),
    viewportWidth: Math.max(0, shell.clientWidth - horizontalPadding),
    viewportHeight: Math.max(0, shell.clientHeight - verticalPadding),
    stageWidth: stage.offsetWidth,
    stageHeight: stage.offsetHeight,
  };
}

function clampWardMapPan(zoom = state.wardMapZoom, pan = state.wardMapPan) {
  const metrics = wardMapViewportMetrics();
  if (!metrics?.stageWidth || !metrics?.stageHeight) return { x: 0, y: 0 };
  const maxX = Math.max(0, (metrics.stageWidth * zoom - metrics.viewportWidth) / 2);
  const maxY = Math.max(0, (metrics.stageHeight * zoom - metrics.viewportHeight) / 2);
  return {
    x: clamp(Number(pan?.x) || 0, -maxX, maxX),
    y: clamp(Number(pan?.y) || 0, -maxY, maxY),
  };
}

function applyWardMapTransform() {
  const metrics = wardMapViewportMetrics();
  const zoom = clamp(Number(state.wardMapZoom) || WARD_MAP_ZOOM_MIN, WARD_MAP_ZOOM_MIN, WARD_MAP_ZOOM_MAX);
  state.wardMapZoom = zoom;
  state.wardMapPan = clampWardMapPan(zoom, state.wardMapPan);
  if (metrics) {
    metrics.stage.style.setProperty("--ward-map-zoom", zoom.toFixed(4));
    metrics.stage.style.setProperty("--ward-map-inverse-scale", (1 / zoom).toFixed(4));
    metrics.stage.style.setProperty("--ward-map-pan-x", `${state.wardMapPan.x.toFixed(2)}px`);
    metrics.stage.style.setProperty("--ward-map-pan-y", `${state.wardMapPan.y.toFixed(2)}px`);
    metrics.shell.classList.toggle("is-zoomed", zoom > WARD_MAP_ZOOM_MIN + 0.001);
  }
  const percent = `${Math.round(zoom * 100)}%`;
  const value = document.querySelector("#ward-map-zoom-reset");
  if (value) {
    value.textContent = percent;
    value.setAttribute("aria-label", `重置地图缩放，当前 ${percent}`);
  }
  const zoomOut = document.querySelector("#ward-map-zoom-out");
  const zoomIn = document.querySelector("#ward-map-zoom-in");
  if (zoomOut) zoomOut.disabled = zoom <= WARD_MAP_ZOOM_MIN + 0.001;
  if (zoomIn) zoomIn.disabled = zoom >= WARD_MAP_ZOOM_MAX - 0.001;
}

function setWardMapZoom(nextZoom, anchorX, anchorY) {
  const metrics = wardMapViewportMetrics();
  const previousZoom = state.wardMapZoom;
  const zoom = clamp(Number(nextZoom) || WARD_MAP_ZOOM_MIN, WARD_MAP_ZOOM_MIN, WARD_MAP_ZOOM_MAX);
  if (!metrics?.stageWidth || !metrics?.stageHeight) {
    state.wardMapZoom = zoom;
    applyWardMapTransform();
    return;
  }
  const centerX = metrics.shellRect.left + metrics.shellRect.width / 2;
  const centerY = metrics.shellRect.top + metrics.shellRect.height / 2;
  const pointerX = Number.isFinite(anchorX) ? anchorX : centerX;
  const pointerY = Number.isFinite(anchorY) ? anchorY : centerY;
  const contentX = (pointerX - centerX - state.wardMapPan.x) / previousZoom;
  const contentY = (pointerY - centerY - state.wardMapPan.y) / previousZoom;
  state.wardMapZoom = zoom;
  state.wardMapPan = {
    x: pointerX - centerX - contentX * zoom,
    y: pointerY - centerY - contentY * zoom,
  };
  applyWardMapTransform();
}

function resetWardMapView() {
  state.wardMapZoom = WARD_MAP_ZOOM_MIN;
  state.wardMapPan = { x: 0, y: 0 };
  applyWardMapTransform();
}

function focusWardOnMap(ward, options = {}) {
  if (!ward || ward.coordinate_valid === false || !Number.isFinite(Number(ward.x)) || !Number.isFinite(Number(ward.y))) return;
  const metrics = wardMapViewportMetrics();
  if (!metrics?.stageWidth || !metrics?.stageHeight) {
    window.requestAnimationFrame(() => focusWardOnMap(ward, options));
    return;
  }
  const minimumZoom = Number(options.minimumZoom) || 2.2;
  state.wardMapZoom = clamp(Math.max(state.wardMapZoom, minimumZoom), WARD_MAP_ZOOM_MIN, WARD_MAP_ZOOM_MAX);
  state.wardMapPan = {
    x: -(Number(ward.x) / 100 - 0.5) * metrics.stageWidth * state.wardMapZoom,
    y: -(Number(ward.y) / 100 - 0.5) * metrics.stageHeight * state.wardMapZoom,
  };
  applyWardMapTransform();
}

function setWardMapExpanded(expanded) {
  state.wardMapExpanded = Boolean(expanded);
  const panel = document.querySelector("#detail-vision");
  const button = document.querySelector("#ward-map-expand");
  panel?.classList.toggle("map-expanded", state.wardMapExpanded);
  if (button) {
    button.setAttribute("aria-pressed", String(state.wardMapExpanded));
    button.setAttribute("aria-label", state.wardMapExpanded ? "退出大眼位地图" : "放大眼位地图");
    button.title = state.wardMapExpanded ? "退出大眼位地图" : "放大眼位地图";
    button.innerHTML = `<i data-lucide="${state.wardMapExpanded ? "minimize-2" : "maximize-2"}"></i>`;
    refreshIcons(button);
  }
  window.requestAnimationFrame(applyWardMapTransform);
}

function setupWardMapInteractions() {
  const shell = document.querySelector("#ward-map-shell");
  if (!shell) return;
  shell.addEventListener("wheel", (event) => {
    if (event.target.closest(".ward-map-controls")) return;
    event.preventDefault();
    const delta = clamp(event.deltaY, -120, 120);
    setWardMapZoom(state.wardMapZoom * Math.exp(-delta * 0.0017), event.clientX, event.clientY);
  }, { passive: false });
  shell.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || state.wardMapZoom <= WARD_MAP_ZOOM_MIN + 0.001) return;
    if (event.target.closest("button")) return;
    wardMapDrag.active = true;
    wardMapDrag.pointerId = event.pointerId;
    wardMapDrag.startX = event.clientX;
    wardMapDrag.startY = event.clientY;
    wardMapDrag.panX = state.wardMapPan.x;
    wardMapDrag.panY = state.wardMapPan.y;
    shell.classList.add("is-dragging");
    shell.setPointerCapture(event.pointerId);
  });
  shell.addEventListener("pointermove", (event) => {
    if (!wardMapDrag.active || event.pointerId !== wardMapDrag.pointerId) return;
    state.wardMapPan = {
      x: wardMapDrag.panX + event.clientX - wardMapDrag.startX,
      y: wardMapDrag.panY + event.clientY - wardMapDrag.startY,
    };
    applyWardMapTransform();
  });
  const finishDrag = (event) => {
    if (!wardMapDrag.active || event.pointerId !== wardMapDrag.pointerId) return;
    wardMapDrag.active = false;
    wardMapDrag.pointerId = null;
    shell.classList.remove("is-dragging");
    if (shell.hasPointerCapture(event.pointerId)) shell.releasePointerCapture(event.pointerId);
  };
  shell.addEventListener("pointerup", finishDrag);
  shell.addEventListener("pointercancel", finishDrag);
  document.querySelector("#ward-map-zoom-out")?.addEventListener("click", () => {
    setWardMapZoom(state.wardMapZoom / WARD_MAP_ZOOM_FACTOR);
  });
  document.querySelector("#ward-map-zoom-in")?.addEventListener("click", () => {
    setWardMapZoom(state.wardMapZoom * WARD_MAP_ZOOM_FACTOR);
  });
  document.querySelector("#ward-map-zoom-reset")?.addEventListener("click", resetWardMapView);
  document.querySelector("#ward-map-focus")?.addEventListener("click", () => {
    focusWardOnMap(WARD_RECORDS.find((ward) => ward.id === state.selectedWardId));
  });
  document.querySelector("#ward-map-expand")?.addEventListener("click", () => {
    setWardMapExpanded(!state.wardMapExpanded);
  });
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => applyWardMapTransform());
    observer.observe(shell);
  }
  applyWardMapTransform();
}

function renderWardMap() {
  const wards = filteredWards();
  const selected = WARD_RECORDS.find((ward) => ward.id === state.selectedWardId);
  const rangeLayer = document.querySelector("#ward-range-layer");
  const markerLayer = document.querySelector("#ward-map-markers");
  if (!rangeLayer || !markerLayer) return;
  const drawableWards = wards.filter((ward) => ward.coordinate_valid !== false
    && Number.isFinite(Number(ward.x)) && Number.isFinite(Number(ward.y)));
  const activeWards = drawableWards.filter((ward) => wardIsActive(ward));
  const selectedDrawable = selected && drawableWards.some((ward) => ward.id === selected.id) ? selected : null;
  const rangeWards = state.wardLayers.ranges
    ? [...new Map([...activeWards, ...(selectedDrawable ? [selectedDrawable] : [])].map((ward) => [ward.id, ward])).values()]
    : [];
  rangeLayer.innerHTML = rangeWards.map((ward) => {
    const size = wardRangeDiameter(ward);
    return `<span class="ward-vision-circle ${ward.team} ${ward.type} ${ward.id === state.selectedWardId ? "selected" : ""} ${wardIsActive(ward) ? "active" : "inactive"}" style="left:${ward.x}%;top:${ward.y}%;width:${size}%;height:${size}%"></span>`;
  }).join("");

  const markers = drawableWards.map((ward) => {
    const hero = safeHero(ward.playerSlot);
    const meta = wardTypeMeta(ward.type);
    const timeState = wardIsActive(ward) ? "active" : state.currentTime < ward.placedAt ? "future" : "expired";
    return `
      <button class="ward-map-pin ${ward.team} ${ward.type} ${timeState} ${ward.id === state.selectedWardId ? "selected" : ""}" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}" style="left:${ward.x}%;top:${ward.y}%" title="${formatTime(ward.placedAt)} · ${hero.name} · ${meta.name}">
        <img src="${itemImage(meta.item)}" alt="${meta.name}"><img class="ward-owner-avatar" src="${heroImage(hero.token)}" alt="${hero.name}">
      </button>
    `;
  });

  const detections = selected && state.wardLayers.detections ? selected.detectionEvents.map((event) => {
    const position = positionAtTime(event.time, event.heroSlot);
    if (!position) return "";
    const timeState = Math.abs(state.currentTime - event.time) <= 12 ? "current" : event.time <= state.currentTime ? "seen" : "future";
    const enemy = safeHero(event.heroSlot);
    return `<button class="ward-detection-pin ${timeState}" type="button" data-ward-id="${selected.id}" data-ward-detection-time="${event.time}" style="left:${position.x}%;top:${position.y}%" title="${formatTime(event.time)} · 发现 ${enemy.name}"><img src="${heroImage(enemy.token)}" alt="${enemy.name}"></button>`;
  }) : [];
  markerLayer.innerHTML = `${markers.join("")}${detections.join("")}`;
  document.querySelector("#ward-map-heading").textContent = `${wards.length} 个眼位 · ${formatTime(state.currentTime)}`;
  document.querySelector("#ward-map-region").textContent = selected?.region || "无选中眼位";
  document.querySelector("#ward-map-time").textContent = formatTime(state.currentTime);
  applyWardMapTransform();
}

function renderWardTimeline(wards) {
  const root = document.querySelector("#ward-timeline");
  if (!wards.length) {
    root.innerHTML = `<div class="ward-timeline-empty">当前筛选没有眼位轨道</div>`;
    return;
  }
  const ticks = [0, Math.round(MATCH_DURATION * 0.25), Math.round(MATCH_DURATION * 0.5), Math.round(MATCH_DURATION * 0.75), MATCH_DURATION];
  root.innerHTML = `
    <div class="ward-timeline-ruler"><span>眼位 / 放置者</span><div>${ticks.map((time) => `<i style="left:${(time / MATCH_DURATION) * 100}%">${formatTime(time)}</i>`).join("")}</div></div>
    <div class="ward-track-scroll">
      ${wards.map((ward) => {
        const hero = safeHero(ward.playerSlot);
        const meta = wardTypeMeta(ward.type);
        const duration = Math.max(0, ward.endedAt - ward.placedAt);
        const visibleStart = clamp(ward.placedAt, 0, MATCH_DURATION);
        const visibleEnd = clamp(ward.endedAt, visibleStart, MATCH_DURATION);
        const start = (visibleStart / MATCH_DURATION) * 100;
        const width = ((visibleEnd - visibleStart) / MATCH_DURATION) * 100;
        const showDuration = duration >= Math.max(45, Math.round(MATCH_DURATION * 0.04));
        return `
          <div class="ward-track-row ${ward.id === state.selectedWardId ? "active" : ""} ${wardIsActive(ward) ? "live-now" : ""}" data-ward-row-id="${ward.id}">
            <button class="ward-track-label" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}" title="${hero.name} · ${ward.region}"><img src="${itemImage(meta.item)}" alt="${meta.label}"><span><strong>${hero.name}</strong><small>${ward.region}</small></span></button>
            <div class="ward-track-lane">
              <button class="ward-life-bar ${ward.team} ${ward.type} ${showDuration ? "" : "short"} ${ward.id === state.selectedWardId ? "selected" : ""}" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}" style="left:${start}%;width:${width}%" title="${formatTime(ward.placedAt)} - ${formatTime(ward.endedAt)} · ${ward.endReason}">${showDuration ? `<span>${formatTime(duration)}</span>` : ""}</button>
              ${ward.detectionEvents.map((event) => `<button class="ward-track-detection" type="button" data-ward-id="${ward.id}" data-ward-detection-time="${event.time}" style="left:${clamp(event.time / MATCH_DURATION * 100, 0, 100)}%" title="${formatTime(event.time)} · 发现 ${safeHero(event.heroSlot).name}"></button>`).join("")}
              <span class="ward-end-marker ${ward.endReason === "被反眼" ? "dewarded" : "natural"}" style="left:${clamp(ward.endedAt / MATCH_DURATION * 100, 0, 100)}%"></span>
              <span class="ward-row-playhead" style="left:${(state.currentTime / MATCH_DURATION) * 100}%"></span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderWardAnalysis() {
  const wards = filteredWards();
  if (wards.length && !wards.some((ward) => ward.id === state.selectedWardId)) state.selectedWardId = wards[0].id;
  renderWardSummary(wards);
  renderWardList(wards);
  renderWardInspector();
  renderWardTimeline(wards);
  renderWardMap();
}

function syncWardTime() {
  if (state.detailView !== "vision") return;
  const percent = (state.currentTime / MATCH_DURATION) * 100;
  document.querySelectorAll(".ward-row-playhead").forEach((playhead) => { playhead.style.left = `${percent}%`; });
  document.querySelectorAll("[data-ward-row-id]").forEach((row) => {
    const ward = WARD_RECORDS.find((item) => item.id === row.dataset.wardRowId);
    row.classList.toggle("live-now", wardIsActive(ward));
  });
  document.querySelectorAll(".ward-list-row").forEach((row) => {
    const ward = WARD_RECORDS.find((item) => item.id === row.dataset.wardId);
    row.classList.toggle("live-now", wardIsActive(ward));
  });
  renderWardMap();
}

function selectWard(wardId, time) {
  const ward = WARD_RECORDS.find((item) => item.id === wardId);
  if (!ward) return;
  state.selectedWardId = ward.id;
  updateCurrentTime(time ?? ward.placedAt, { syncSegment: false });
  renderWardAnalysis();
  if (window.innerWidth < 1440) setWardSideView("detail");
  window.requestAnimationFrame(() => {
    document.querySelector("#ward-list .ward-list-row.active")?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    document.querySelector("#ward-timeline .ward-track-row.active")?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    if (state.wardMapZoom > WARD_MAP_ZOOM_MIN + 0.001) focusWardOnMap(ward, { minimumZoom: state.wardMapZoom });
  });
}

const FARM_OPTION_NAMES = {
  collect_lane: "优先收线",
  lane_jungle_cycle: "线野双收",
  hold_jungle: "留野控风险",
  review_lane: "复核附近兵线",
  review_jungle: "复核当前野区",
  combat_or_idle: "战斗 / 空窗",
  combat: "参与战斗",
  dead: "阵亡等待",
  teleport_or_travel: "传送或赶路",
  base_or_recovery: "基地补给",
  waiting_resource: "等待资源",
  idle_suspected: "疑似停滞",
  unknown: "行为未确认",
  objective_or_resource: "目标或地图资源",
  current_route: "当前路线",
  insufficient_evidence: "证据不足",
};

function farmOptionName(value) {
  return FARM_OPTION_NAMES[value] || value || "等待更多证据";
}

function farmDiagnosticTitle(value) {
  const labels = {
    safe_lane_window: "安全兵线机会",
    verified_lane_farm: "兵线处理样本",
    verified_jungle_farm: "野区处理样本",
    lane_review_clue: "兵线复核线索",
    jungle_review_clue: "野区复核线索",
    lane_jungle_cycle: "线野循环",
    observed_lane_jungle_cycle: "已完成线野循环",
    strategic_commitment: "团战与目标投入",
    jungle_reset: "应留在安全野区",
    low_income_window: "低收益时间窗",
    evidence_gap: "路线证据不足",
  };
  return labels[value] || value || "资源决策复盘";
}

function farmDiagnosticReason(diagnostic) {
  const phase = ({
    laning: "对线期",
    expansion: "转线期",
    pre_tormentor: "20 分钟前目标期",
    core_route_20_30: "20–30 分钟核心发育期",
    core_route_30_40: "30–40 分钟核心发育期",
    core_route_40_plus: "40 分钟后核心发育期",
  })[diagnostic.phase] || "资源运营期";
  const facts = `Replay 事实：该 30 秒获得 ${Number(diagnostic.actualGold || 0)}g，其中兵线 ${Number(diagnostic.laneGold || 0)}g、野区 ${Number(diagnostic.neutralGold || 0)}g；可见敌人 ${(diagnostic.visible || []).length}/5，附近己方有效眼位 ${(diagnostic.wardIds || []).length} 个。`;
  const missingNames = {
    lane_unit_positions: "兵线实体位置",
    camp_occupancy: "野点存活状态",
    team_resource_claims: "队友资源归属",
    lane_unit_lifecycle_window: "候选兵线逐兵状态",
    camp_unit_lifecycle_window: "候选营地逐怪状态",
    team_resource_priority_conflict: "队友资源优先级冲突",
    hero_clear_time: "本英雄清线清野耗时",
  };
  const missing = (diagnostic.missingEvidence || []).map((key) => missingNames[key] || key);
  const model = diagnostic.strategic_commitment_exempt
    ? `模型判断：该窗口处于${phase}，但玩家正在参团或处理地图目标，因此只记录机会成本，不用纯打钱收益追责。`
    : diagnostic.recommendation_enabled
    ? `模型判断：逐单位资源、战争迷雾、位置职责和抵达截止时间均通过门禁，可复盘为一条受支持的${phase}路线。`
    : diagnostic.diagnostic_class === "relative_low"
    ? `模型判断：这是本场相对低点，不满足异常门槛，仅作为${phase}复盘样本。`
    : diagnostic.matched_best_option
      ? `模型判断：处于${phase}，实际行为与当前证据支持的最高分选项一致。`
      : `模型门控：${routeBlockerName(diagnostic.route_blocker) || (missing.length ? `缺少${missing.join("、")}` : "候选证据不完整")}，因此只保留复盘线索，不生成确定路线。`;
  return `${facts}${model}`;
}

function routeBlockerName(value) {
  return ({
    role_uncertain: "位置职责置信度不足",
    role_not_resource_priority: "该位置不应抢占核心资源",
    resource_sample_too_small: "候选资源单位不足",
    unit_value_unavailable: "同场单位金币样本不足",
    enemy_visibility_incomplete: "敌方连续可见性不完整",
    known_enemy_threat: "路线上存在已知敌方威胁",
    team_resource_claim: "更高优先级队友更接近资源",
    player_position_unavailable: "玩家位置缺失",
    pre10_jungle_clear_unproven: "10 分钟前尚未证明该英雄能完成清野",
    strategic_commitment: "正在参团或处理关键目标，免于纯打钱追责",
    arrival_after_resource_deadline: "预计抵达晚于资源消失时间",
  })[value] || "";
}

function laneOpportunityName(value) {
  return ({
    secured: "已补到",
    enemy_deny: "被反补",
    teammate_claimed: "队友收取",
    role_not_resource_priority: "非本位置资源",
    excused_dead: "阵亡豁免",
    excused_combat: "战斗豁免",
    reviewable_missed_last_hit: "可复核漏刀",
    missed_last_hit_safety_unproven: "安全性不足",
    reviewable_missed_wave_absence: "可复核漏线",
    missed_wave_safety_unproven: "缺视野未定责",
  })[value] || value || "未归类";
}

function farmCandidates(diagnostic) {
  if (diagnostic.candidates?.length) return diagnostic.candidates;
  if (diagnostic.recommendation === "insufficient_evidence") return [];
  return [{ kind: diagnostic.recommendation || "current_route", expectedGold: Number(diagnostic.suggestedGold || 0), risk: Number(diagnostic.risk || 0), travelSeconds: Number(diagnostic.travelSeconds || 0), deadlineSeconds: Number(diagnostic.expiresIn || 0), evidence: "legacy_model" }];
}

function farmCandidateEvidenceName(value) {
  return ({
    observed_lane_jungle_lane_sequence: "Replay 已完成",
    unit_lifecycle_plus_continuous_visibility: "逐兵 + 连续视野",
    camp_lifecycle_plus_continuous_visibility: "逐怪 + 连续视野",
    assigned_lane_plus_resource_event: "分路 + 资源事件",
    current_jungle_plus_resource_event: "当前位置 + 营地事件",
  })[value] || "事实候选";
}

function nextPeriodicTime(current, first, interval, last = Infinity) {
  if (current <= first) return first;
  const next = first + Math.ceil((current - first) / interval) * interval;
  return next <= last ? next : null;
}

function renderFarmResourceClock() {
  const current = state.currentTime;
  const m = FARM_MECHANICS;
  const patchLabel = document.querySelector("#farm-resource-patch");
  if (patchLabel) {
    patchLabel.textContent = resourceClockPatchLabel(
      state.currentAnalysis?.match?.patch_name,
      m.patch_baseline,
    );
  }
  const runeTime = current < Number(m.power_rune_first || 360)
    ? nextPeriodicTime(current, Number(m.water_rune_first || 120), 120, Number(m.water_rune_last || 240))
    : nextPeriodicTime(current, Number(m.power_rune_first || 360), Number(m.power_rune_interval || 120));
  const resources = [
    ["wheat", "下一波兵", nextPeriodicTime(current, Number(m.lane_spawn_first || 0), Number(m.lane_spawn_interval || 30))],
    ["trees", "野怪刷新", nextPeriodicTime(current, Number(m.neutral_spawn_first || 60), Number(m.neutral_spawn_interval || 60))],
    ["flower-2", "莲花", nextPeriodicTime(current, Number(m.lotus_first || 180), Number(m.lotus_interval || 180))],
    ["circle-dollar-sign", "赏金符", nextPeriodicTime(current, Number(m.bounty_first || 0), Number(m.bounty_interval || 240))],
    ["sparkles", current < 360 ? "河道水符" : "强化神符", runeTime],
    ["book-open", "经验符", nextPeriodicTime(current, Number(m.wisdom_first || 420), Number(m.wisdom_interval || 420))],
    ["shield", "魔方", current <= Number(m.tormentor_first || 1200) ? Number(m.tormentor_first || 1200) : null],
  ];
  const root = document.querySelector("#farm-resource-clock");
  root.innerHTML = resources.map(([icon, label, time]) => {
    const remaining = time == null ? null : Math.max(0, time - current);
    return `<span class="farm-resource-tick ${remaining != null && remaining <= 10 ? "due" : ""}"><i data-lucide="${icon}"></i><span><small>${label}</small><strong>${time == null ? "本轮已结束" : `${formatTime(time)} · ${formatCountdownSeconds(remaining)}`}</strong></span></span>`;
  }).join("");
  const resourcePosition = Number(FARM_LANE_OPPORTUNITY.position || 0);
  const phase = current < 450 ? "0-7:30 对线期"
    : current < 900 ? "7:30-15:00 转线期"
      : current < 1200 ? "15:00-20:00 目标前"
        : resourcePosition > 0 && resourcePosition <= 3 ? "20 分钟后核心路线期" : "20 分钟后团队运营期";
  document.querySelector("#farm-phase-label").textContent = phase;
  refreshIcons(root);
}

function farmDecisionMeta(decision) {
  if (decision === "correct") return { label: "正确决策", className: "positive", icon: "circle-check" };
  if (decision === "context_exempt") return { label: "战略投入", className: "fact", icon: "swords" };
  if (decision === "relative_low") return { label: "相对低点", className: "aggregate", icon: "scan-line" };
  if (decision === "evidence_gap") return { label: "证据不足", className: "aggregate", icon: "circle-help" };
  if (decision === "watch" || decision === "review") return { label: "需要复核", className: "warning", icon: "search-check" };
  return { label: "存在更优选择", className: "warning", icon: "route" };
}

function farmCellGroup(cell) {
  if (cell.source === "lane" || cell.source === "lane_creep") return "lane";
  if (["neutral", "ancient"].includes(cell.source)) return "neutral";
  if (["combat", "objective", "map_resource"].includes(cell.category)
      || ["hero_kill", "hero_assist", "courier", "ward", "building", "roshan", "bounty_rune"].includes(cell.source)) return "combat";
  return cell.source;
}

function farmCellsForHero(slot = state.selectedHeroSlot) {
  if (state.currentAnalysis) return FARM_HEAT_CELLS.map((cell) => ({ ...cell }));
  const factor = HEROES[slot].factor / HEROES[0].factor;
  return FARM_HEAT_CELLS.map((cell, index) => {
    if (slot === 0) return { ...cell };
    const midpoint = Math.round((cell.start + cell.end) / 2);
    const position = positionAtTime(midpoint, slot);
    const x = clamp(position.x + Math.sin(index * 1.7) * 3.2, 5, 95);
    const y = clamp(position.y + Math.cos(index * 1.4) * 3.2, 5, 95);
    return { ...cell, x, y, region: regionForPosition({ x, y }), gold: Math.round(cell.gold * factor) };
  });
}

function farmDiagnosticsForHero(slot = state.selectedHeroSlot) {
  if (state.currentAnalysis) return FARM_DIAGNOSTICS.map((diagnostic) => ({ ...diagnostic }));
  const factor = HEROES[slot].factor / HEROES[0].factor;
  return FARM_DIAGNOSTICS.map((diagnostic) => {
    const targetX = slot >= 5 ? 100 - diagnostic.targetX : diagnostic.targetX;
    const targetY = slot >= 5 ? 100 - diagnostic.targetY : diagnostic.targetY;
    const visible = slot >= 5 ? diagnostic.visible.map((enemySlot) => enemySlot - 5) : diagnostic.visible;
    const missing = slot >= 5 ? diagnostic.missing.map((enemySlot) => enemySlot - 5) : diagnostic.missing;
    return {
      ...diagnostic,
      targetX,
      targetY,
      visible,
      missing,
      actualGold: Math.round(diagnostic.actualGold * factor),
      suggestedGold: Math.round(diagnostic.suggestedGold * factor),
    };
  });
}

function farmWindowMatches(cell) {
  const start = Number(cell.start ?? cell.time ?? 0);
  const end = Number(cell.end ?? start);
  const midpoint = (start + end) / 2;
  if (state.farmTimeWindow === "pre20") return midpoint < 1200;
  if (state.farmTimeWindow === "m0_5") return midpoint < 300;
  if (state.farmTimeWindow === "m5_10") return midpoint >= 300 && midpoint < 600;
  if (state.farmTimeWindow === "m10_15") return midpoint >= 600 && midpoint < 900;
  if (state.farmTimeWindow === "m15_20") return midpoint >= 900 && midpoint < 1200;
  if (state.farmTimeWindow === "post20") return midpoint >= 1200;
  return true;
}

function farmDiagnosticsInSelectedWindow() {
  return farmDiagnosticsForHero().filter((diagnostic) => farmWindowMatches(diagnostic));
}

function filteredFarmCells() {
  return farmCellsForHero().filter((cell) => farmWindowMatches(cell)
    && (state.farmSource === "all" || farmCellGroup(cell) === state.farmSource));
}

function visibilityAtTime(team, slot, time) {
  const intervals = state.visibilityByTeam?.[team]?.[String(slot)]?.intervals || [];
  const interval = intervals.find((row) => Number(row.start) <= time && Number(row.end) >= time);
  if (!interval) return null;
  const start = Number(interval.start || 0);
  const end = Number(interval.end ?? start);
  const ratio = end > start ? clamp((time - start) / (end - start), 0, 1) : 0;
  const startX = Number(interval.start_x);
  const startY = Number(interval.start_y);
  const endX = Number(interval.end_x);
  const endY = Number(interval.end_y);
  const hasPosition = Number.isFinite(startX) && Number.isFinite(startY);
  return {
    ...interval,
    x: hasPosition ? startX + (Number.isFinite(endX) ? endX - startX : 0) * ratio : null,
    y: hasPosition ? startY + (Number.isFinite(endY) ? endY - startY : 0) * ratio : null,
    uncertainty: Number(interval.uncertainty_start_pct || 0)
      + (Number(interval.uncertainty_end_pct || 0) - Number(interval.uncertainty_start_pct || 0)) * ratio,
  };
}

function visibilityStateMeta(stateName) {
  const values = {
    confirmed: { label: "确认可见", className: "confirmed" },
    probable: { label: "视野推断", className: "probable" },
    last_seen: { label: "最后可见", className: "last-seen" },
    unknown: { label: "位置未知", className: "unknown" },
  };
  return values[stateName] || values.unknown;
}

function campStateAtTime(camp, time) {
  const cycleStart = Math.max(60, Math.floor(Math.max(60, time) / 60) * 60);
  const observation = (camp.observations || []).find((row) => Number(row.cycle_start) === cycleStart);
  if (!observation || time < Number(observation.observed_enter_start || cycleStart)) return "unknown";
  const transitions = observation.transitions || [];
  const latest = transitions.filter((row) => Number(row.time) <= time)
    .sort((left, right) => Number(right.time) - Number(left.time))[0];
  return latest?.state || "observed_present";
}

function campStateLabel(value) {
  return ({ observed_present: "观测存活", observed_cleared: "确认清空", visibility_lost: "失去观测", unknown: "状态未知" })[value] || "状态未知";
}

function renderFarmSummary() {
  const cells = farmCellsForHero();
  const total = cells.reduce((sum, cell) => sum + cell.gold, 0);
  const lane = cells.filter((cell) => farmCellGroup(cell) === "lane").reduce((sum, cell) => sum + cell.gold, 0);
  const neutral = cells.filter((cell) => farmCellGroup(cell) === "neutral").reduce((sum, cell) => sum + cell.gold, 0);
  const diagnostics = farmDiagnosticsInSelectedWindow();
  const enabledRoutes = diagnostics.filter((item) => item.recommendation_enabled === true);
  const recoverable = enabledRoutes.reduce((sum, item) => sum + Math.max(0, item.suggestedGold - item.actualGold), 0);
  const percentage = (value) => `${total ? Math.round((value / total) * 100) : 0}%`;
  const kills = UNIT_KILL_STATS.find((row) => Number(row.slot) === state.selectedHeroSlot) || {};
  const laneSummary = FARM_LANE_OPPORTUNITY.summary || {};
  const reviewableMisses = Number(laneSummary.reviewable_misses || 0);
  const missedGold = Number(laneSummary.estimated_reviewable_gold || 0);
  const stackGold = Number(FARM_STACK_VALUE_SUMMARY.created_gold_estimate || 0);
  const resourcePosition = Number(FARM_LANE_OPPORTUNITY.position || 0);
  const post20Core = state.farmTimeWindow === "post20" && resourcePosition > 0 && resourcePosition <= 3;
  const playerWaveCount = countPlayerLaneWaves(FARM_LANE_WAVES, state.selectedHeroSlot);
  const waveScopeTitle = `本人关联指该波存在本人的补刀、反补或已归因兵线收入；全场共观测 ${FARM_LANE_WAVES.length} 个阵营分路波次。`;
  const metrics = [
    ["coins", "资源收入", `${total.toLocaleString("zh-CN")}g`, "Replay 金钱事件归因"],
    ["wheat", "兵线收入", `${lane.toLocaleString("zh-CN")}g`, `${percentage(lane)} · ${Number(kills.lane || 0)} 小兵 · 本人关联 ${playerWaveCount} 波`, waveScopeTitle],
    ["trees", "野区", `${neutral.toLocaleString("zh-CN")}g`, `${percentage(neutral)} · ${FARM_CAMP_STATES.length} 野点 · ${FARM_CAMP_STATES.reduce((sum, camp) => sum + (camp.observations || []).length, 0)} 周期`],
    ["scan-search", "漏线复核", `${reviewableMisses} 个`, `${missedGold > 0 ? `约 ${missedGold}g` : "仅展示事实"} · 已补 ${Number(laneSummary.secured || 0)} 个`],
    ["layers-3", "叠野创造", `${stackGold > 0 ? `约 ${stackGold}g` : `${Number(FARM_STACK_VALUE_SUMMARY.stacked_camps || 0)} 营`}`, `${Number(FARM_STACK_VALUE_SUMMARY.stacked_creeps || 0)} 个额外单位 · 团队价值`],
    ["route", post20Core ? "20+ 核心路线" : "可执行路线", `${enabledRoutes.length} 条`, post20Core
      ? `${diagnostics.length} 窗 · 目标免责`
      : `${recoverable > 0 ? `复盘机会差 +${recoverable}g` : "严格证据门禁"}`],
  ];
  const root = document.querySelector("#farm-summary");
  root.innerHTML = metrics.map(([icon, label, value, detail, title = ""]) => `
    <span class="farm-summary-item" ${title ? `title="${escapeHtml(title)}"` : ""}><i data-lucide="${icon}"></i><span><small>${label}</small><strong>${value}</strong><em>${detail}</em></span></span>
  `).join("");
  refreshIcons(root);
}

function renderFarmMap() {
  const hero = safeHero(state.selectedHeroSlot);
  const currentPosition = positionAtTime(state.currentTime, state.selectedHeroSlot);
  const diagnostics = farmDiagnosticsInSelectedWindow();
  const diagnostic = diagnostics.find((item) => item.id === state.selectedFarmDiagnosticId) || diagnostics[0] || {
    decision: "correct", targetX: null, targetY: null, suggestedGold: 0, actualGold: 0, visible: [], missing: [], wardIds: [], confidence: 0,
  };
  const cells = filteredFarmCells().filter((cell) => Number.isFinite(Number(cell.x)) && Number.isFinite(Number(cell.y)));
  const maxGold = Math.max(1, ...cells.map((cell) => cell.gold));
  const heatLayer = document.querySelector("#farm-heat-layer");
  heatLayer.innerHTML = cells.map((cell) => {
    const intensity = cell.gold / maxGold;
    const size = 15 + intensity * 16;
    const midpoint = Math.round((cell.start + cell.end) / 2);
    return `
      <button class="farm-heat-point ${farmCellGroup(cell)}" type="button" data-farm-heat-time="${midpoint}" style="left:${cell.x}%;top:${cell.y}%;width:${size}%;height:${size}%;--heat:${intensity.toFixed(2)}" title="${formatTime(cell.start)}-${formatTime(cell.end)} · ${cell.region} · +${cell.gold}g">
        <span></span><strong>+${compactNumber(cell.gold)}${cell.gold < 1000 ? "g" : ""}</strong><small>${cell.region}</small>
      </button>
    `;
  }).join("");

  const routePoints = [];
  for (let time = 0; time <= state.currentTime; time += 35) {
    const point = positionAtTime(time, state.selectedHeroSlot);
    if (point) routePoints.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  if (currentPosition) routePoints.push(`${currentPosition.x.toFixed(2)},${currentPosition.y.toFixed(2)}`);
  document.querySelector("#farm-actual-route").setAttribute("points", routePoints.join(" "));
  const recommendationLine = document.querySelector("#farm-recommended-route");
  const hasRouteTarget = currentPosition && diagnostic.targetX != null && diagnostic.targetY != null
    && Number.isFinite(Number(diagnostic.targetX)) && Number.isFinite(Number(diagnostic.targetY))
    && diagnostic.recommendation_enabled === true && Number(diagnostic.confidence || 0) >= 68;
  if (hasRouteTarget) {
    recommendationLine.setAttribute("x1", currentPosition.x.toFixed(2));
    recommendationLine.setAttribute("y1", currentPosition.y.toFixed(2));
    recommendationLine.setAttribute("x2", Number(diagnostic.targetX).toFixed(2));
    recommendationLine.setAttribute("y2", Number(diagnostic.targetY).toFixed(2));
  }
  recommendationLine.style.display = hasRouteTarget && diagnostic.decision !== "correct" ? "block" : "none";

  const heroMarker = document.querySelector("#farm-hero-marker");
  heroMarker.src = heroImage(hero.token);
  heroMarker.alt = hero.name;
  heroMarker.style.display = currentPosition ? "block" : "none";
  if (currentPosition) {
    heroMarker.style.left = `${currentPosition.x}%`;
    heroMarker.style.top = `${currentPosition.y}%`;
  }

  const recommendationPin = document.querySelector("#farm-recommendation-pin");
  recommendationPin.style.display = hasRouteTarget ? "inline-flex" : "none";
  if (hasRouteTarget) {
    recommendationPin.style.left = `${diagnostic.targetX}%`;
    recommendationPin.style.top = `${diagnostic.targetY}%`;
  }
  recommendationPin.classList.toggle("correct", diagnostic.decision === "correct");
  recommendationPin.querySelector("span").textContent = diagnostic.decision === "correct" ? "保持路线" : `+${diagnostic.suggestedGold - diagnostic.actualGold}g`;

  const team = hero.team;
  const activeWards = WARD_RECORDS.filter((ward) => ward.team === team && wardIsActive(ward, state.currentTime));
  const wardEvidence = activeWards.map((ward) => {
    const meta = wardTypeMeta(ward.type);
    const size = wardRangeDiameter(ward);
    return `<span class="farm-ward-range ${ward.team} ${ward.type}" style="left:${ward.x}%;top:${ward.y}%;width:${size}%;height:${size}%"><img src="${itemImage(meta.item)}" alt="${meta.label}" title="${meta.name} · ${ward.region}"></span>`;
  });
  const enemySlots = team === "radiant" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const hasContinuousVisibility = Boolean(state.visibilityByTeam?.[team]);
  const enemyEvidence = enemySlots.map((slot) => {
    const enemy = safeHero(slot);
    const fallbackVisible = !hasContinuousVisibility && (diagnostic.visible || []).includes(slot);
    const visibility = hasContinuousVisibility ? visibilityAtTime(team, slot, state.currentTime)
      : fallbackVisible ? { state: slot % 3 === 0 ? "confirmed" : slot % 3 === 1 ? "probable" : "last_seen", uncertainty: slot % 3 === 2 ? 6 : 0, last_seen_at: state.currentTime - 7 } : null;
    const position = visibility?.x != null && visibility?.y != null
      ? visibility : fallbackVisible ? positionAtTime(state.currentTime, slot) : null;
    if (!position || visibility?.state === "unknown") return "";
    const meta = visibilityStateMeta(visibility?.state || "confirmed");
    const uncertainty = clamp(Number(visibility?.uncertainty || 0), 0, 35);
    return `<span class="farm-enemy-visible ${meta.className}" style="left:${position.x}%;top:${position.y}%;--uncertainty:${(uncertainty * 1.8).toFixed(1)}px" title="${enemy.name} · ${meta.label}${visibility?.last_seen_at != null ? ` · 最后记录 ${formatTime(visibility.last_seen_at)}` : ""}"><img src="${heroImage(enemy.token)}" alt="${enemy.name}"><small>${meta.label}</small></span>`;
  });
  const campEvidence = FARM_CAMP_STATES
    .filter((camp) => Number.isFinite(Number(camp.x)) && Number.isFinite(Number(camp.y)))
    .map((camp) => {
      const campState = campStateAtTime(camp, state.currentTime);
      return `<span class="farm-camp-state ${campState.replaceAll("_", "-")}" style="left:${camp.x}%;top:${camp.y}%" title="${campStateLabel(campState)} · ${regionName(camp.region)}"><i data-lucide="trees"></i></span>`;
    });
  const evidenceLayer = document.querySelector("#farm-evidence-layer");
  evidenceLayer.innerHTML = `${campEvidence.join("")}${wardEvidence.join("")}${enemyEvidence.join("")}`;
  refreshIcons(evidenceLayer);

  const windowLabels = { pre20: "0-20 分钟", m0_5: "0-5 分钟", m5_10: "5-10 分钟", m10_15: "10-15 分钟", m15_20: "15-20 分钟", post20: "20 分钟后" };
  document.querySelector("#farm-map-kicker").textContent = state.farmTimeWindow === "post20"
    ? "20 分钟后核心路线收益" : "前 20 分钟空间收益";
  document.querySelector("#farm-map-heading").textContent = `${hero.name} · ${windowLabels[state.farmTimeWindow]}打钱热区`;
  document.querySelector("#farm-map-region").textContent = currentPosition
    ? (state.currentAnalysis ? regionName(currentPosition.region) : regionForPosition(currentPosition))
    : "位置数据缺失";
  document.querySelector("#farm-map-time").textContent = formatTime(state.currentTime);
}

function renderFarmDiagnosis() {
  const diagnostics = farmDiagnosticsInSelectedWindow();
  const list = document.querySelector("#farm-diagnosis-list");
  document.querySelector("#farm-diagnosis-heading").textContent = state.farmTimeWindow === "post20"
    ? "20 分钟后核心路线审计" : "前 20 分钟决策审计";
  if (!diagnostics.length) {
    list.innerHTML = `<div class="coverage-empty"><i data-lucide="route-off"></i><span>没有识别到可比较的低收益窗口</span></div>`;
    const scope = state.farmTimeWindow === "post20" ? "20 分钟后" : "当前时间段";
    document.querySelector("#farm-diagnosis-inspector").innerHTML = `<p>该英雄${scope}没有形成可稳定比较的低收益窗口，或者路线证据覆盖不足。</p>`;
    document.querySelector("#farm-model-confidence").textContent = "无异常窗口";
    refreshIcons(list);
    return;
  }
  list.innerHTML = diagnostics.map((diagnostic) => {
    const meta = farmDecisionMeta(diagnostic.decision);
    const delta = Math.max(0, diagnostic.suggestedGold - diagnostic.actualGold);
    const gap = diagnostic.decision === "evidence_gap" || diagnostic.recommendation === "insufficient_evidence";
    const verified = diagnostic.matched_best_option === true;
    const contextExempt = diagnostic.strategic_commitment_exempt === true;
    return `
      <button class="farm-diagnosis-row ${state.selectedFarmDiagnosticId === diagnostic.id ? "active" : ""}" type="button" data-farm-diagnostic-id="${diagnostic.id}" data-farm-diagnostic-time="${diagnostic.time}">
        <time>${formatTime(diagnostic.time)}</time>
        <span class="farm-diagnosis-main"><strong>${farmDiagnosticTitle(diagnostic.title)}${diagnostic.post20_core_priority ? `<em class="core-route-priority">核心路线</em>` : ""}</strong><small>${farmOptionName(diagnostic.actual)} → ${farmOptionName(diagnostic.recommendation)}</small></span>
        <span class="farm-diagnosis-delta ${diagnostic.decision}"><strong>${contextExempt ? "目标投入" : gap ? "待补证据" : verified ? "已验证" : delta > 0 ? `+${delta}g` : "需复核"}</strong><small>${contextExempt ? "记录机会成本" : gap ? `置信度 ${diagnostic.confidence}%` : `风险 ${diagnostic.risk}`}</small></span>
        <i data-lucide="${meta.icon}"></i>
      </button>
    `;
  }).join("");
  refreshIcons(list);

  const diagnostic = diagnostics.find((item) => item.id === state.selectedFarmDiagnosticId) || diagnostics[0];
  const meta = farmDecisionMeta(diagnostic.decision);
  const delta = diagnostic.suggestedGold - diagnostic.actualGold;
  const wardNames = (diagnostic.wardIds || []).map((id) => WARD_RECORDS.find((ward) => ward.id === id)).filter(Boolean);
  const candidates = farmCandidates(diagnostic);
  const evidenceGap = diagnostic.decision === "evidence_gap" || diagnostic.recommendation === "insufficient_evidence";
  const verified = diagnostic.matched_best_option === true;
  const contextExempt = diagnostic.strategic_commitment_exempt === true;
  const blocked = diagnostic.blockedCandidates || [];
  const opportunityEvents = (FARM_LANE_OPPORTUNITY.events || [])
    .filter((event) => Number(event.time) >= Number(diagnostic.time || 0) - 5
      && Number(event.time) <= Number(diagnostic.end || diagnostic.time || 0) + 45)
    .slice(0, 6);
  const stackEvent = FARM_STACK_EVENTS.find((event) => Number(event.time) >= Number(diagnostic.time || 0)
    && Number(event.time) <= Number(diagnostic.end || diagnostic.time || 0) + 30);
  const routeState = contextExempt
    ? "战略投入豁免"
    : diagnostic.recommendation_enabled
      ? "门禁通过"
      : routeBlockerName(diagnostic.route_blocker) || "仅保留事实";
  document.querySelector("#farm-model-confidence").textContent = `置信度 ${diagnostic.confidence}%`;
  document.querySelector("#farm-model-confidence").className = `evidence-tag ${diagnostic.confidence >= 85 ? "fact" : "aggregate"}`;
  const inspector = document.querySelector("#farm-diagnosis-inspector");
  inspector.innerHTML = `
    <div class="farm-diagnosis-head"><span><small>${formatTime(diagnostic.time)} · ${meta.label}</small><strong>${farmDiagnosticTitle(diagnostic.title)}</strong></span><span class="farm-diagnosis-grade ${meta.className}"><strong>${contextExempt ? "✓" : evidenceGap ? "?" : verified ? "✓" : delta > 0 ? `+${delta}g` : "!"}</strong><small>${contextExempt ? "不按纯打钱追责" : evidenceGap ? "不生成路线" : verified ? "行为方向已验证" : "同类窗口基准差"}</small></span></div>
    <div class="farm-route-compare">
      <span class="actual"><small>Replay 实际</small><strong>${farmOptionName(diagnostic.actual)}</strong><em>${diagnostic.actualGold}g 已归因收益</em></span>
      <i data-lucide="arrow-right"></i>
      <span class="recommended"><small>${diagnostic.matched_best_option ? "事实匹配" : diagnostic.recommendation_enabled ? "严格门禁通过" : "证据门控"}</small><strong>${farmOptionName(diagnostic.recommendation)}</strong><em>${diagnostic.matched_best_option ? `${diagnostic.actualGold}g 已归因收益` : diagnostic.recommendation_enabled ? `${diagnostic.suggestedGold}g 候选收益` : "等待兵线、营地与视野证据"}</em></span>
    </div>
    <div class="farm-candidate-grid">
      ${candidates.length ? candidates.slice(0, 3).map((candidate) => {
        const candidateBlocked = candidate.hard_gates_passed === false;
        const candidateState = candidateBlocked ? routeBlockerName(candidate.blocker) || "未通过路线门禁" : farmCandidateEvidenceName(candidate.evidence);
        return `<span class="farm-candidate ${candidateBlocked ? "blocked" : candidate.kind === diagnostic.recommendation ? "recommended" : ""}"><small>${candidateState}</small><strong>${farmOptionName(candidate.kind)}</strong><em>${Number(candidate.expectedGold || 0)}g · 风险 ${Number(candidate.risk || 0)} · ${Number(candidate.travelSeconds || 0)}s</em></span>`;
      }).join("") : `<span class="farm-candidate blocked"><small>不可用</small><strong>没有可执行候选</strong><em>刷新时间不等于路线成立</em></span>`}
      ${blocked.slice(0, 1).map((candidate) => `<span class="farm-candidate blocked"><small>已阻止</small><strong>${farmOptionName(candidate.kind)}</strong><em>${escapeHtml(candidate.reason || "关键证据缺失")}</em></span>`).join("")}
    </div>
    <div class="farm-model-metrics">
      <span><small>移动时间</small><strong>${diagnostic.travelSeconds} 秒</strong></span>
      <span><small>实际兵线击杀</small><strong>${Number(diagnostic.laneCreeps || 0)} 个</strong></span>
      <span><small>候选截止</small><strong>${diagnostic.expiresIn} 秒</strong></span>
      <span><small>可见敌人</small><strong>${diagnostic.visible.length} / 5</strong></span>
      <span><small>失踪威胁</small><strong>${diagnostic.missing.length} 人</strong></span>
      <span><small>己方视野</small><strong>${wardNames.length} 个眼位</strong></span>
      <span><small>逐单位资源</small><strong>${Number(diagnostic.route_observed_units || 0)} 个</strong></span>
      <span><small>路线门禁</small><strong>${routeState}</strong></span>
    </div>
    <span class="farm-stack-fact"><i data-lucide="layers-3"></i>${stackEvent ? `确认堆叠 ${Number(stackEvent.camps || 0)} 个营地 / ${Number(stackEvent.creeps || 0)} 个单位${Number(stackEvent.created_gold_estimate || 0) > 0 ? `，创造团队价值约 ${Number(stackEvent.created_gold_estimate)}g` : "，收益样本不足"}` : "此窗口没有检测到堆野计数增长"}</span>
    ${opportunityEvents.length ? `<div class="farm-unit-evidence">${opportunityEvents.map((event) => `<button type="button" data-farm-unit-time="${Number(event.time || 0)}"><time>${formatTime(Number(event.time || 0))}</time><strong>${laneOpportunityName(event.outcome)}</strong><small>${regionName(event.lane)} · ${Number(event.estimated_gold || 0) > 0 ? `约 ${Number(event.estimated_gold)}g` : "金币未知"}</small></button>`).join("")}</div>` : ""}
    <div class="farm-evidence-strip">
      <span class="visible"><small>已看见</small>${(diagnostic.visible || []).map((slot) => `<img src="${heroImage(safeHero(slot).token)}" alt="${safeHero(slot).name}" title="${safeHero(slot).name}">`).join("")}</span>
      <span class="missing"><small>失踪</small>${(diagnostic.missing || []).map((slot) => `<img src="${heroImage(safeHero(slot).token)}" alt="${safeHero(slot).name}" title="${safeHero(slot).name}">`).join("")}</span>
      <span class="ward-evidence"><small>视野证据</small>${wardNames.map((ward) => `<img src="${itemImage(wardTypeMeta(ward.type).item)}" alt="${wardTypeMeta(ward.type).label}" title="${ward.region}">`).join("")}</span>
    </div>
    <p>${diagnostic.reason}</p>
  `;
  refreshIcons(inspector);
}

function renderFarmUnits() {
  const winningTeam = state.currentAnalysis?.match?.radiant_win ? "radiant" : "dire";
  const visible = UNIT_KILL_STATS.filter((row) => {
    const team = Number(row.slot) < 5 ? "radiant" : "dire";
    if (state.farmTeam === "winner") return team === winningTeam;
    if (state.farmTeam === "loser") return team !== winningTeam;
    return true;
  });
  const value = (entry) => entry === 0 ? "—" : entry;
  document.querySelector("#farm-units-body").innerHTML = visible.map((row) => {
    const hero = safeHero(row.slot);
    return `
      <button class="farm-units-row ${state.selectedHeroSlot === row.slot ? "active" : ""}" type="button" data-farm-player-slot="${row.slot}">
        <span class="farm-unit-player"><img src="${heroImage(hero.token)}" alt="${hero.name}"><span><strong>${hero.player}${hero.me ? " · 我" : ""}</strong><small>${hero.name}</small></span></span>
        <span>${value(row.hero)}</span><span>${value(row.lane)}</span><span>${value(row.neutral)}</span><span>${value(row.ancient)}</span><span>${value(row.tower)}</span><span>${value(row.courier)}</span><span>${value(row.roshan)}</span><span>${value(row.observer)}</span><span>${value(row.necro)}</span><span class="farm-other-unit">${row.other}</span>
      </button>
    `;
  }).join("");
}

function renderFarmAnalysis() {
  document.querySelectorAll("#farm-time-filter button").forEach((button) => {
    button.classList.toggle("active", button.dataset.farmWindow === state.farmTimeWindow);
  });
  renderFarmSummary();
  renderFarmResourceClock();
  renderFarmDiagnosis();
  renderFarmUnits();
  renderFarmMap();
}

function syncFarmTime() {
  if (state.detailView !== "farm") return;
  const diagnostics = farmDiagnosticsInSelectedWindow();
  if (!diagnostics.length) {
    renderFarmResourceClock();
    renderFarmMap();
    return;
  }
  const nearest = diagnostics.reduce((best, item) => Math.abs(item.time - state.currentTime) < Math.abs(best.time - state.currentTime) ? item : best, diagnostics[0]);
  if (nearest.id !== state.selectedFarmDiagnosticId) {
    state.selectedFarmDiagnosticId = nearest.id;
    renderFarmDiagnosis();
  }
  renderFarmResourceClock();
  renderFarmMap();
  document.querySelectorAll(".farm-diagnosis-row").forEach((row) => row.classList.toggle("active", row.dataset.farmDiagnosticId === state.selectedFarmDiagnosticId));
}

function selectFarmDiagnostic(diagnosticId) {
  const diagnostic = FARM_DIAGNOSTICS.find((item) => item.id === diagnosticId);
  if (!diagnostic) return;
  state.selectedFarmDiagnosticId = diagnostic.id;
  updateCurrentTime(diagnostic.time, { syncSegment: false });
  renderFarmAnalysis();
}

function updateMap() {
  const hero = safeHero(state.selectedHeroSlot);
  const position = positionAtTime(state.currentTime);
  const points = [];
  for (let time = 0; time <= state.currentTime; time += 20) {
    const point = positionAtTime(time);
    if (point) points.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  if (position) points.push(`${position.x.toFixed(2)},${position.y.toFixed(2)}`);
  document.querySelector("#development-trail").setAttribute("points", points.join(" "));
  document.querySelector("#full-map-trail").setAttribute("points", points.join(" "));
  ["#development-hero-marker", "#full-map-hero-marker"].forEach((selector) => {
    const marker = document.querySelector(selector);
    marker.src = heroImage(hero.token);
    marker.alt = hero.name;
    marker.style.display = position ? "block" : "none";
    if (position) {
      marker.style.left = `${position.x}%`;
      marker.style.top = `${position.y}%`;
    }
  });
  const region = position
    ? (state.currentAnalysis ? regionName(position.region) : regionForPosition(position))
    : "位置数据缺失";
  document.querySelector("#map-region").textContent = region;
  document.querySelector("#map-time-readout").textContent = formatTime(state.currentTime);
  document.querySelector("#full-map-region").textContent = region;
  document.querySelector("#full-map-heading").textContent = `${hero.name} · ${formatTime(state.currentTime)}`;
  const mapStats = state.currentAnalysis?.modules?.map?.player_stats_by_slot?.[String(state.selectedHeroSlot)] || {};
  const distance = document.querySelector("#map-distance-units");
  const jungle = document.querySelector("#map-jungle-time");
  const lane = document.querySelector("#map-lane-time");
  if (distance) distance.textContent = `${compactNumber(Number(mapStats.distance_units) || 0)} 单位`;
  if (jungle) jungle.textContent = formatTime(Number(mapStats.jungle_seconds) || 0);
  if (lane) lane.textContent = formatTime(Number(mapStats.lane_seconds) || 0);
  renderMapEventList();
}

function renderMapEventList() {
  const events = [...WARD_EVENTS, ...combatMapMarkers(), ...OBJECTIVE_EVENTS]
    .sort((a, b) => Math.abs(a.time - state.currentTime) - Math.abs(b.time - state.currentTime))
    .slice(0, 6)
    .sort((a, b) => a.time - b.time);
  const list = document.querySelector("#map-event-list");
  list.innerHTML = events.map((event) => {
    const icon = event.type === "ward" ? "eye" : event.type === "objective" ? "landmark" : "swords";
    const location = state.currentAnalysis ? regionName(event.location || event.region || "unknown") : regionForPosition(event);
    return `<button class="map-event-row" type="button" data-map-time="${event.time}"><time>${formatTime(event.time)}</time><i data-lucide="${icon}"></i><span><strong>${event.title}</strong><small>${location}</small></span><i data-lucide="chevron-right"></i></button>`;
  }).join("");
  refreshIcons(list);
}

function chartOption() {
  const metric = METRICS[state.metric];
  const hero = safeHero(state.selectedHeroSlot);
  const opponentSlot = matchupSlotFor(state.selectedHeroSlot);
  const opponent = safeHero(opponentSlot);
  const primaryData = snapshotsFor(hero.slot).map((point) => [point.second, point[state.metric]]);
  const opponentData = snapshotsFor(opponentSlot).map((point) => [point.second, point[state.metric]]);
  const segment = SEGMENTS.find((item) => item.id === state.selectedSegmentId);
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 48, right: 18, top: 12, bottom: 34 },
    tooltip: {
      trigger: "axis",
      confine: true,
      backgroundColor: "#24292d",
      borderColor: "#495158",
      textStyle: { color: "#f2f0e9", fontSize: 10 },
      axisPointer: { type: "line", lineStyle: { color: "#d8dee2", width: 1 } },
      formatter(params) {
        const lines = [`<strong>${formatTime(params[0].value[0])}</strong>`];
        params.forEach((entry) => lines.push(`${entry.marker}${entry.seriesName}　${Math.round(entry.value[1]).toLocaleString("zh-CN")}`));
        return lines.join("<br>");
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: MATCH_DURATION,
      axisLine: { lineStyle: { color: "#343a3f" } },
      axisTick: { show: false },
      axisLabel: { color: "#737c83", fontSize: 9, formatter: (value) => formatTime(value) },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#737c83", fontSize: 9, formatter: compactNumber },
      splitLine: { lineStyle: { color: "#292e32", type: "dashed" } },
    },
    dataZoom: [
      { type: "inside", filterMode: "none", start: state.chartZoom[0], end: state.chartZoom[1], zoomOnMouseWheel: true, moveOnMouseMove: true },
      { type: "slider", height: 12, bottom: 3, start: state.chartZoom[0], end: state.chartZoom[1], borderColor: "#343a3f", backgroundColor: "#141719", fillerColor: "rgba(94,159,214,.12)", handleStyle: { color: "#5e9fd6" }, textStyle: { color: "transparent" }, showDetail: false },
    ],
    series: [
      {
        id: "primary",
        name: hero.name,
        type: "line",
        data: primaryData,
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { width: 2, color: metric.color },
        areaStyle: { color: metric.color, opacity: 0.08 },
        emphasis: { disabled: true },
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#e7ecef", width: 1 }, data: [{ xAxis: state.currentTime }] },
        markArea: segment ? { silent: true, itemStyle: { color: "rgba(216,164,71,.08)" }, data: [[{ xAxis: segment.start }, { xAxis: segment.end }]] } : undefined,
      },
      {
        id: "opponent",
        name: `${opponent.name}（${positionLabel(opponent.position)}对位）`,
        type: "line",
        data: opponentData,
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { width: 1.25, color: "#8f979e", type: "dashed", opacity: 0.7 },
        emphasis: { disabled: true },
      },
    ],
  };
}

async function ensureChart() {
  const container = document.querySelector("#development-chart");
  if (!container || container.clientWidth < 2 || container.clientHeight < 2) return;
  if (!state.chart) {
    const chartRuntime = await loadChartRuntime();
    if (!container.isConnected || container.clientWidth < 2 || container.clientHeight < 2) return;
    if (!state.chart) {
      state.chart = chartRuntime.init(container, null, { renderer: "canvas" });
      state.chart.on("click", (params) => {
        if (Array.isArray(params.value)) updateCurrentTime(params.value[0]);
      });
      state.chart.on("datazoom", () => {
        const option = state.chart.getOption();
        const zoom = option.dataZoom?.[0];
        if (zoom) state.chartZoom = [zoom.start, zoom.end];
      });
    }
  }
  state.chart.setOption(chartOption(), true);
  window.requestAnimationFrame(() => state.chart?.resize());
}

function updateChartCursor() {
  if (!state.chart) return;
  const segment = SEGMENTS.find((item) => item.id === state.selectedSegmentId);
  state.chart.setOption({ series: [{ id: "primary", markLine: { data: [{ xAxis: state.currentTime }] }, markArea: segment ? { data: [[{ xAxis: segment.start }, { xAxis: segment.end }]] } : { data: [] } }] });
  const current = snapshotAtTime(state.selectedHeroSlot, state.currentTime);
  const opponentSlot = matchupSlotFor(state.selectedHeroSlot);
  const opponent = snapshotAtTime(opponentSlot, state.currentTime);
  if (!current || !opponent) return;
  const value = Number(current[state.metric]) || 0;
  const delta = value - (Number(opponent[state.metric]) || 0);
  document.querySelector("#chart-current-label").textContent = formatTime(state.currentTime);
  document.querySelector("#chart-current-value").textContent = Math.round(value).toLocaleString("zh-CN");
  const deltaElement = document.querySelector("#chart-current-delta");
  const opponentHero = safeHero(opponentSlot);
  deltaElement.textContent = `${delta >= 0 ? "领先" : "落后"}${positionLabel(opponentHero.position)} ${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString("zh-CN")}`;
  deltaElement.className = delta >= 0 ? "positive" : "negative";
}

function inventoryAtTime(time) {
  if (state.currentAnalysis) {
    const history = state.currentAnalysis.modules?.build?.by_slot?.[String(state.selectedHeroSlot)]?.inventory || [];
    let current = history[0]?.items || [];
    for (const snapshot of history) {
      if (eventTimeSeconds(snapshot) > time) break;
      current = snapshot.items || [];
    }
    return current.filter((item) => Number(item.slot) >= 0 && Number(item.slot) < 6).sort((a, b) => Number(a.slot) - Number(b.slot));
  }
  const keys = [];
  ITEM_EVENTS.filter((event) => event.time <= time).forEach((event) => {
    const existing = keys.indexOf(event.key);
    if (existing >= 0) keys.splice(existing, 1);
    if (!["tango"].includes(event.key) || time < 180) keys.push(event.key);
  });
  return keys.slice(-6);
}

function layoutBuildTrack(events, trackWidth) {
  const laneCount = 4;
  const eventGap = 40;
  const lastPositionByLane = Array(laneCount).fill(-Infinity);
  return [...events]
    .sort((a, b) => Number(a.time) - Number(b.time))
    .map((event) => {
      const rawPosition = (clamp(Number(event.time) || 0, 0, MATCH_DURATION) / MATCH_DURATION) * trackWidth;
      const position = clamp(rawPosition, 18, trackWidth - 18);
      let lane = lastPositionByLane.findIndex((lastPosition) => position - lastPosition >= eventGap);
      if (lane < 0) {
        lane = lastPositionByLane.indexOf(Math.min(...lastPositionByLane));
      }
      lastPositionByLane[lane] = position;
      return { event, lane, position };
    });
}

function renderBuild() {
  const inventory = inventoryAtTime(state.currentTime);
  const hero = safeHero(state.selectedHeroSlot);
  document.querySelector("#inventory-time").textContent = `${hero.name} · ${formatTime(state.currentTime)}`;
  const structuredInventory = inventory.some((entry) => typeof entry === "object");
  document.querySelector("#inventory-slots").innerHTML = Array.from({ length: 6 }, (_, index) => {
    const item = structuredInventory ? inventory.find((entry) => Number(entry.slot) === index) : inventory[index];
    const key = typeof item === "string" ? item : item?.key;
    if (!key) return `<span class="inventory-empty" aria-label="空物品栏"></span>`;
    const charges = typeof item === "object" ? Number(item.charges || 0) : 0;
    return `<span class="item-slot" title="${itemName(key)} · ${key}"><img src="${itemImage(key)}" alt="${itemName(key)}">${charges ? `<span>${charges}</span>` : ""}</span>`;
  }).join("");

  const tracks = [
    { label: "购买", events: ITEM_EVENTS },
    { label: "技能升级", events: ABILITY_EVENTS },
  ];
  const trackWidth = Math.max(1040, Math.round(MATCH_DURATION * 0.65));
  const buildTracks = document.querySelector("#build-tracks");
  const previousScrollLeft = buildTracks.scrollLeft;
  const cursorPosition = clamp((state.currentTime / MATCH_DURATION) * trackWidth, 0, trackWidth);
  buildTracks.innerHTML = tracks.map((track) => `
    <div class="build-track" style="--track-width:${trackWidth}px"><span class="build-track-label">${track.label}<small>${track.events.length} 个事件</small></span><div class="track-line"><span class="build-time-cursor" style="left:${cursorPosition}px"></span>${layoutBuildTrack(track.events, trackWidth).map(({ event, lane, position }) => {
      const isItem = "action" in event;
      const image = isItem ? itemImage(event.key) : abilityImage(event.key);
      const name = isItem ? itemName(event.key) : `${event.name || abilityName(event.key)} ${event.level}级`;
      return `<button class="track-event" type="button" data-build-time-ms="${event.timeMs ?? event.time * 1000}" style="left:${position}px;top:${8 + lane * 38}px" title="${formatPreciseTimeMs(event.timeMs ?? event.time * 1000)} · ${name}"><img src="${image}" alt="${name}"><small>${formatTime(event.time)}</small></button>`;
    }).join("")}</div></div>
  `).join("");
  buildTracks.scrollLeft = previousScrollLeft;

  const usageEvents = state.currentAnalysis
    ? (state.currentAnalysis.modules?.build?.by_slot?.[String(state.selectedHeroSlot)]?.usage || []).map((event) => ({
      ...normalizeTimedEvent(event),
      name: event.kind === "item_use" ? itemName(event.key) : abilityName(event.key),
      detail: event.target_slot == null ? "Replay 记录" : `目标：${safeHero(event.target_slot).name}`,
      value: event.kind === "item_use" ? "物品" : "技能",
    }))
    : [];
  const usageList = document.querySelector("#usage-list");
  usageList.innerHTML = usageEvents.length ? usageEvents.map((event) => `<button class="usage-row" type="button" data-build-time-ms="${event.timeMs ?? event.time * 1000}" title="${event.key}"><time>${formatPreciseTimeMs(event.timeMs ?? event.time * 1000)}</time><img src="${event.kind === "item_use" ? itemImage(event.key) : abilityImage(event.key)}" alt="${event.name}"><span><strong>${event.name}</strong><small>${event.detail}</small></span><span>${event.value}</span></button>`).join("") : `<div class="coverage-empty"><i data-lucide="history"></i><span>没有记录到技能或物品使用</span></div>`;
  installImageFallback(document.querySelector("#inventory-slots"), heroImage(hero.token));
  installImageFallback(buildTracks, heroImage(hero.token));
  installImageFallback(usageList, heroImage(hero.token));

  const currentSnapshot = snapshotAtTime(state.selectedHeroSlot, state.currentTime);
  const latestPurchase = [...ITEM_EVENTS].reverse().find((event) => event.time <= state.currentTime);
  const buildCount = document.querySelector("#inventory-item-count");
  const latestItem = document.querySelector("#inventory-latest-item");
  const networth = document.querySelector("#inventory-networth");
  if (buildCount) buildCount.textContent = `${inventory.length} 件`;
  if (latestItem) latestItem.textContent = latestPurchase ? `${itemName(latestPurchase.key)} · ${formatTime(latestPurchase.time)}` : "尚无购买";
  if (networth) networth.textContent = Number(currentSnapshot?.networth || 0).toLocaleString("zh-CN");
  refreshIcons(usageList);
}

function combatEventRows(fight) {
  if (state.currentAnalysis) {
    return (fight.events || []).map((event) => {
      const view = timelineEventView({ ...event, id: `${fight.id}-${event.time}-${event.kind}` });
      const eventSeq = Number(event.event_seq ?? event.eventSeq);
      return {
        time: view.time,
        timeMs: view.timeMs,
        eventSeq: Number.isFinite(eventSeq) ? eventSeq : null,
        icon: view.icon,
        text: `${view.actor} · ${view.text}`,
        value: view.value,
      };
    });
  }
  const base = fight.start;
  return [
    { time: base, icon: "eye", text: "侦查守卫发现虚无之灵", value: "视野" },
    { time: base + 2, icon: "link", text: "束缚击命中虚无之灵", value: "2.4 秒" },
    { time: base + 3, icon: "swords", text: "集中火力开始攻击", value: "目标锁定" },
    { time: base + 7, icon: "zap", text: "漩涡连锁闪电触发", value: "286 伤害" },
    { time: base + 12, icon: "skull", text: "虚无之灵阵亡", value: "+248 金钱" },
    { time: base + 18, icon: "arrow-up-right", text: "天辉转向夜魇中路一塔", value: "推进" },
  ];
}

const COMBAT_ISSUE_NAMES = {
  low_damage_share: "核心伤害占比偏低",
  low_carry_damage_share: "1 号位伤害占比偏低",
  low_mid_combat_output: "2 号位战斗输出偏低",
  late_tempo_arrival: "2 号位节奏到场偏晚",
  low_initiation_or_frontline_value: "3 号位先手或前排价值不足",
  low_roamer_utility_output: "4 号位游走与功能贡献偏低",
  low_save_or_control_output: "5 号位救人与控制贡献偏低",
  no_spell_output: "未记录到技能输出",
  late_or_absent: "进入主战场偏晚或在场率低",
  no_kill_conversion: "对减员目标没有有效伤害",
  no_spell_cast: "未记录到技能施放",
  low_utility_output: "控制、治疗与伤害贡献均偏低",
  no_sentry_setup: "开战前 90 秒附近未记录真眼准备",
};

const RESPONSIBILITY_BLOCKER_NAMES = {
  snapshot_missing: "缺少逐秒英雄状态",
  ability_state_missing: "缺少技能状态",
  dead: "英雄已阵亡",
  stun: "处于眩晕",
  silence: "处于沉默",
  cooldown: "技能冷却中",
  cooldown_unknown: "冷却状态未知",
  mana: "魔法不足",
  mana_unknown: "魔法条件未知",
  range_unknown: "施法距离未知",
  target_or_range: "没有合理范围内目标",
  patch_metadata_missing: "缺少对应版本技能元数据",
  ability_semantics_unknown: "技能目标语义未确认",
};

function responsibilityGateMeta(gate) {
  if (gate?.status === "passed") return { label: "门禁通过", shortLabel: "通过", className: "passed" };
  if (gate?.status === "blocked") return { label: "客观条件阻断", shortLabel: "条件阻断", className: "blocked" };
  return { label: "证据不足", shortLabel: "证据不足", className: "insufficient" };
}

function fightContributions(fight) {
  if (fight.contributions?.length) return fight.contributions.map((row) => ({ ...row, slot: Number(row.slot) }));
  if (state.currentAnalysis) return [];
  const participantSlots = fight.participants?.length
    ? fight.participants.map(Number)
    : state.currentAnalysis
      ? Object.keys(fight.damageBySlot || {}).map(Number)
      : Array.from({ length: 10 }, (_, slot) => slot);
  const rows = participantSlots.map((slot) => {
    const damage = (fight.damageBySlot?.[String(slot)] || []).reduce((sum, row) => sum + Number(row.value || 0), 0)
      || (slot === state.selectedHeroSlot ? Number(fight.damage || 0) : Math.round(Number(fight.damage || 1800) * (0.06 + (slot % 5) * 0.025)));
    const position = slot % 5 + 1;
    const roleGroup = position <= 3 ? "core" : "support";
    const abilityCasts = roleGroup === "core" ? 3 + (slot % 3) : 4 + (slot % 2);
    const controlSeconds = roleGroup === "support" ? 2.4 + (slot % 2) * 1.6 : slot % 2 ? 1.2 : 0;
    const score = clamp(Math.round(55 + damage / Math.max(1, Number(fight.damage || 3000)) * 70 + abilityCasts * 2 + controlSeconds * 2), 32, 94);
    const gateStatus = slot % 4 === 1 ? "blocked" : slot % 4 === 2 ? "insufficient_evidence" : "passed";
    const responsibilityGate = { status: gateStatus, coverage_pct: gateStatus === "insufficient_evidence" ? 42 : 96, opportunity_seconds: gateStatus === "passed" ? 7 : 0, blockers: gateStatus === "blocked" ? { cooldown: 5, stun: 2 } : gateStatus === "insufficient_evidence" ? { range_unknown: 8, ability_state_missing: 3 } : {}, opportunities: [] };
    return { slot, position, role: `position_${position}`, role_group: roleGroup, role_confidence: 78, damage, teamDamageShare: 0, damageTaken: Math.round(damage * 0.7), teamDamageTakenShare: 20, damageToKills: Math.round(damage * 0.62), killConversion: 62, abilityCasts, itemUses: roleGroup === "support" ? 2 : 1, controlSeconds, healing: roleGroup === "support" && slot % 2 ? 420 : 0, kills: 0, deaths: 0, presencePct: 78 - (slot % 3) * 7, arrivalDelay: slot % 4, setupObservers: roleGroup === "support" ? 1 : 0, setupSentries: roleGroup === "support" && slot % 2 ? 1 : 0, responsibilityScore: score, status: score >= 72 ? "ok" : score >= 48 ? "watch" : "issue", confidence: state.currentAnalysis ? 48 : 72, issues: [], responsibility_gate: responsibilityGate };
  });
  ["radiant", "dire"].forEach((team) => {
    const teamRows = rows.filter((row) => (row.slot < 5 ? "radiant" : "dire") === team);
    const total = teamRows.reduce((sum, row) => sum + row.damage, 0);
    teamRows.forEach((row) => { row.teamDamageShare = total ? Math.round(row.damage / total * 1000) / 10 : 0; });
  });
  return rows;
}

function fightPosition(fight, contributions) {
  if (fight.x != null && fight.y != null) return { x: Number(fight.x), y: Number(fight.y) };
  if (state.currentAnalysis) return null;
  const positions = contributions.map((row) => positionAtTime(Math.round((fight.start + fight.end) / 2), row.slot));
  if (!positions.length) return positionAtTime(fight.start, state.selectedHeroSlot);
  return {
    x: positions.reduce((sum, point) => sum + point.x, 0) / positions.length,
    y: positions.reduce((sum, point) => sum + point.y, 0) / positions.length,
  };
}

function fightImportanceMeta(fight) {
  return COMBAT_IMPORTANCE_META[fight.importance?.tier] || COMBAT_IMPORTANCE_META.routine;
}

function selectedFightPhase(fight) {
  const phases = fight.phases || [];
  return phases.find((phase) => phase.kind === state.selectedCombatPhase)
    || phases.find((phase) => state.playheadMs >= Number(phase.start_ms) && state.playheadMs <= Number(phase.end_ms))
    || phases.find((phase) => phase.kind === "clash")
    || phases[0]
    || null;
}

function renderCombatPhaseStrip(fight) {
  const strip = document.querySelector("#combat-phase-strip");
  const phases = fight.phases || [];
  if (!phases.length) {
    strip.innerHTML = "";
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");
  const rangeStart = Math.min(...phases.map((phase) => Number(phase.start_ms || 0)));
  const rangeEnd = Math.max(...phases.map((phase) => Number(phase.end_ms || 0)));
  const span = Math.max(1, rangeEnd - rangeStart);
  strip.innerHTML = phases.map((phase) => {
    const startMs = Number(phase.start_ms || 0);
    const endMs = Number(phase.end_ms || startMs);
    const width = Math.max(7, (endMs - startMs) / span * 100);
    const active = phase.kind === state.selectedCombatPhase
      || (!state.selectedCombatPhase && state.playheadMs >= startMs && state.playheadMs <= endMs);
    return `<button class="${active ? "active" : ""}" type="button" data-combat-phase="${phase.kind}" data-combat-phase-time-ms="${startMs}" style="--phase-width:${width}%" title="${COMBAT_PHASE_NAMES[phase.kind] || phase.kind} · ${formatPreciseTimeMs(startMs)}-${formatPreciseTimeMs(endMs)}">${COMBAT_PHASE_NAMES[phase.kind] || phase.kind}</button>`;
  }).join("");
}

function syncCombatPhasePlayhead() {
  const fight = COMBAT_SEGMENTS.find((item) => item.id === state.selectedCombatId);
  if (!fight?.phases?.length) return;
  const activePhase = [...fight.phases].reverse().find((phase) => state.playheadMs >= Number(phase.start_ms)
    && state.playheadMs <= Number(phase.end_ms));
  const phaseChanged = activePhase && activePhase.kind !== state.selectedCombatPhase;
  if (phaseChanged) state.selectedCombatPhase = activePhase.kind;
  document.querySelectorAll("#combat-phase-strip [data-combat-phase]").forEach((button) => {
    const phase = fight.phases.find((item) => item.kind === button.dataset.combatPhase);
    const active = phase && state.playheadMs >= Number(phase.start_ms) && state.playheadMs <= Number(phase.end_ms);
    button.classList.toggle("active", Boolean(active));
  });
  if (phaseChanged && state.page === "detail" && state.detailView === "combat") {
    renderCombatMap(fight, fightContributions(fight));
  }
}

function resolveCombatMarkerCollisions(container) {
  if (!container) return;
  const markers = [...container.querySelectorAll(".combat-player-marker")];
  const bounds = container.getBoundingClientRect();
  if (markers.length < 2 || bounds.width <= 0 || bounds.height <= 0) return;
  const nodes = markers.map((marker, index) => {
    const anchorX = clamp(Number(marker.dataset.mapX || 0) / 100 * bounds.width, 16, bounds.width - 16);
    const anchorY = clamp(Number(marker.dataset.mapY || 0) / 100 * bounds.height, 16, bounds.height - 16);
    return { marker, index, anchorX, anchorY, x: anchorX, y: anchorY, radius: 16 };
  });
  for (let pass = 0; pass < 72; pass += 1) {
    nodes.forEach((node) => {
      node.x += (node.anchorX - node.x) * 0.018;
      node.y += (node.anchorY - node.y) * 0.018;
    });
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        let dx = right.x - left.x;
        let dy = right.y - left.y;
        let distance = Math.hypot(dx, dy);
        const minimum = left.radius + right.radius + 3;
        if (distance >= minimum) continue;
        if (distance < 0.01) {
          const angle = ((left.index + 1) * 137.5 + right.index * 41) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = (minimum - distance) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;
        left.x -= unitX * push;
        left.y -= unitY * push;
        right.x += unitX * push;
        right.y += unitY * push;
      }
    }
    nodes.forEach((node) => {
      node.x = clamp(node.x, node.radius, bounds.width - node.radius);
      node.y = clamp(node.y, node.radius, bounds.height - node.radius);
    });
  }
  nodes.forEach((node) => {
    node.marker.style.setProperty("--stack-x", `${(node.x - node.anchorX).toFixed(1)}px`);
    node.marker.style.setProperty("--stack-y", `${(node.y - node.anchorY).toFixed(1)}px`);
  });
}

function renderCombatMap(fight, contributions) {
  const phase = selectedFightPhase(fight);
  const midpointMs = phase
    ? (Number(phase.start_ms || 0) + Number(phase.end_ms || phase.start_ms || 0)) / 2
    : Number(fight.peak_start_ms ?? fight.contact_start_ms ?? ((fight.start + fight.end) * 500));
  const midpoint = midpointMs / 1000;
  const center = phase?.x != null && phase?.y != null
    ? { x: Number(phase.x), y: Number(phase.y) }
    : fightPosition(fight, contributions);
  const activeWards = center ? WARD_RECORDS.filter((ward) => ward.placedAt <= fight.end && ward.endedAt >= fight.start
    && Math.hypot(Number(ward.x) - center.x, Number(ward.y) - center.y) <= 18) : [];
  document.querySelector("#combat-map-wards").innerHTML = activeWards.map((ward) => {
    const size = wardRangeDiameter(ward);
    return `<span class="combat-ward-range ${ward.team} ${ward.type}" style="left:${ward.x}%;top:${ward.y}%;width:${size}%;height:${size}%" title="${wardTypeMeta(ward.type).name} · ${ward.region}"></span>`;
  }).join("");
  const playerLayer = document.querySelector("#combat-map-players");
  playerLayer.innerHTML = contributions.map((row) => {
    const hero = safeHero(row.slot);
    const position = observedPositionAtTime(midpoint, row.slot);
    if (!position) return "";
    const fallbackLabel = hero.token === "unknown" ? "?" : String(hero.name || "?").trim().slice(0, 1);
    return `<button class="combat-player-marker ${hero.team} ${state.selectedCombatPlayerSlot === row.slot ? "selected" : ""}" type="button" data-combat-player-slot="${row.slot}" data-map-x="${position.x}" data-map-y="${position.y}" style="left:${position.x}%;top:${position.y}%" title="${escapeHtml(hero.player)} · ${escapeHtml(hero.name)}"><span class="combat-player-fallback" aria-hidden="true">${escapeHtml(fallbackLabel)}</span><img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}"></button>`;
  }).join("");
  resolveCombatMarkerCollisions(playerLayer);
  const towerPoint = fight.tower_context?.tower_position;
  const roshanAttempt = ROSHAN_ATTEMPTS.find((attempt) => attempt.id === fight.objective_context?.attempt_id);
  const contextMarkers = [];
  if (towerPoint?.x != null && towerPoint?.y != null) {
    contextMarkers.push(`<span class="combat-objective-marker tower" style="left:${Number(towerPoint.x)}%;top:${Number(towerPoint.y)}%" title="${TOWER_CONTEXT_NAMES[fight.tower_context.status] || "防御塔上下文"}"><i data-lucide="landmark"></i></span>`);
  }
  if (roshanAttempt?.x != null && roshanAttempt?.y != null) {
    contextMarkers.push(`<span class="combat-objective-marker roshan" style="left:${roshanAttempt.x}%;top:${roshanAttempt.y}%" title="${ROSHAN_CLASS_NAMES[roshanAttempt.classification] || "肉山事件"}"><i data-lucide="shield"></i></span>`);
  }
  const contextLayer = document.querySelector("#combat-map-context");
  contextLayer.innerHTML = contextMarkers.join("");
  refreshIcons(contextLayer);
  const pulse = document.querySelector("#combat-location-pulse");
  pulse.classList.toggle("hidden", !center);
  if (center) {
    const diameter = clamp(Number(fight.scatter_radius_pct || 5) * 2, 7, 34);
    pulse.style.left = `${center.x}%`;
    pulse.style.top = `${center.y}%`;
    pulse.style.width = `${diameter}%`;
    pulse.style.height = `${diameter}%`;
    pulse.title = `战斗峰值中心 · 定位置信度 ${Number(fight.location_confidence || 0)}%`;
  }
  document.querySelector("#combat-map-region").textContent = state.currentAnalysis
    ? (fight.location || "定位证据不足")
    : (center ? regionForPosition(center) : "定位证据不足");
  document.querySelector("#combat-map-time").textContent = formatPreciseTimeMs(midpointMs);
  renderCombatPhaseStrip(fight);
  installImageFallback(playerLayer, heroImage("unknown"));
}

function fightVisionTeam(fight, team, center) {
  const raw = fight.vision?.[team] || {};
  if (Object.keys(raw).length) return raw;
  if (state.currentAnalysis || !center) return null;
  const wards = WARD_RECORDS.filter((ward) => ward.team === team && ward.placedAt <= fight.end && ward.endedAt >= fight.start
    && Math.hypot(Number(ward.x) - center.x, Number(ward.y) - center.y) <= 18);
  return {
    combat_log_visibility_pct: wards.length ? 68 : 32,
    nearby_observers: wards.filter((ward) => ward.type === "observer").length,
    nearby_sentries: wards.filter((ward) => ward.type === "sentry").length,
    setup_observers: wards.filter((ward) => ward.type === "observer" && ward.placedAt >= fight.start - 90).length,
    setup_sentries: wards.filter((ward) => ward.type === "sentry" && ward.placedAt >= fight.start - 90).length,
    observer_coverage: wards.some((ward) => ward.type === "observer"),
    sentry_coverage: wards.some((ward) => ward.type === "sentry"),
  };
}

function renderCombatVision(fight, contributions) {
  const center = fightPosition(fight, contributions);
  const duration = Math.max(0.001, (Number(fight.contact_end_ms ?? (fight.contact_end ?? fight.end) * 1000)
    - Number(fight.contact_start_ms ?? (fight.contact_start ?? fight.start) * 1000)) / 1000);
  const confidence = Number(fight.classification?.confidence || 0);
  const tags = (fight.classification?.context_tags || []).map((tag) => COMBAT_CONTEXT_NAMES[tag] || tag);
  const reason = (fight.classification?.reasons || []).map((item) => COMBAT_REASON_NAMES[item] || item)[0];
  const tpSupports = (fight.support_events || []).filter((event) => event.support).length;
  const importance = fight.importance || {};
  const importanceMeta = fightImportanceMeta(fight);
  const importanceReason = (importance.reasons || []).map((item) => COMBAT_IMPORTANCE_REASON_NAMES[item] || item)[0];
  const stats = [
    ["接触时长", `${duration.toFixed(duration < 10 ? 2 : 1)} 秒`],
    ["实际参与", `${(fight.participants || []).length || contributions.length} 人`],
    ["总英雄伤害", Number(fight.total_damage || fight.damage || 0).toLocaleString("zh-CN")],
    ["强度 / 减员", `${Number(fight.classification?.intensity_score || 0)} · ${Number(fight.radiant_deaths || 0)}:${Number(fight.dire_deaths || 0)}`],
    ["识别依据", confidence ? `自动规则 ${confidence}%` : "固定战斗规则"],
    ["事件上下文", tags.length ? tags.join(" · ") : reason || "基础战斗事件"],
    ["关键程度", `${importanceMeta.label} ${Number(importance.score || 0)} · ${importanceReason || "未评分"}`],
  ];
  document.querySelector("#combat-overview-stats").innerHTML = stats.map(([label, value]) => `<span class="combat-overview-stat"><small>${label}</small><strong>${value}</strong></span>`).join("");
  const teams = [["radiant", "天辉"], ["dire", "夜魇"]];
  document.querySelector("#combat-vision-summary").innerHTML = teams.map(([team, label]) => {
    const vision = fightVisionTeam(fight, team, center);
    if (!vision) {
      return `<article class="combat-vision-team ${team} unavailable">
        <header class="combat-vision-team-head"><strong>${label}</strong><span class="combat-vision-status insufficient">数据不足</span></header>
        <p class="combat-vision-empty">这场战斗缺少可用的视野事件证据</p>
      </article>`;
    }
    const visibility = Number(vision.combat_log_visibility_pct || 0);
    const observer = Number(vision.nearby_observers || 0);
    const sentry = Number(vision.nearby_sentries || 0);
    const status = combatVisionStatus(vision);
    return `<article class="combat-vision-team ${team}">
      <header class="combat-vision-team-head">
        <strong>${label}</strong>
        <span class="combat-vision-status ${vision.observer_coverage ? "covered" : "uncovered"}">${status}</span>
      </header>
      <div class="combat-vision-visibility">
        <span><small>可见伤害事件</small><strong>${visibility}%</strong></span>
        <span class="combat-vision-meter" aria-hidden="true"><span style="width:${clamp(visibility, 0, 100)}%"></span></span>
      </div>
      <dl class="combat-vision-metrics">
        <div><dt>附近假眼</dt><dd>${observer}</dd></div>
        <div><dt>附近真眼</dt><dd>${sentry}</dd></div>
        <div><dt>开战前真眼</dt><dd>${Number(vision.setup_sentries || 0)}</dd></div>
      </dl>
    </article>`;
  }).join("");
}

function renderCombatContext(fight) {
  const rows = [];
  const tower = fight.tower_context;
  if (tower) {
    const confirmed = Boolean(tower.confirmed_dive);
    const before = `${Number(tower.attackers_before || 0)}v${Number(tower.defenders_before || 0)}`;
    const after = `${Number(tower.attackers_after || 0)}v${Number(tower.defenders_after || 0)}`;
    rows.push({
      icon: "landmark",
      tone: confirmed ? "confirmed" : "warning",
      title: TOWER_CONTEXT_NAMES[tower.status] || "防御塔上下文",
      detail: confirmed
        ? `塔攻击 ${Number(tower.tower_hit_events || 0)} 次 / ${Number(tower.tower_damage_to_attackers || 0)} 伤害 · 局部人数 ${before} → ${after}`
        : `距塔 ${Number(tower.center_distance_pct || 0).toFixed(1)}% · 未取得防御塔攻击英雄的硬证据`,
      badge: tower.tower_destroyed_within_20s ? "20 秒内破塔" : "塔未转化",
      timeMs: Number(fight.contact_start_ms || 0),
    });
  }
  (fight.support_events || []).slice().sort((left, right) => Number(left.cast_start_ms || 0) - Number(right.cast_start_ms || 0)).slice(0, 4).forEach((response) => {
    const hero = safeHero(Number(response.actor_slot));
    const interrupted = response.status === "interrupted";
    const local = `${Number(response.local_allies_before || 0)}:${Number(response.local_enemies_before || 0)} → ${Number(response.local_allies_after || 0)}:${Number(response.local_enemies_after || 0)}`;
    const order = Number(response.arrival_group_size || 0) > 1 ? ` · 第 ${Number(response.arrival_order || 0)}/${Number(response.arrival_group_size)} 个到场` : "";
    rows.push({
      icon: interrupted ? "circle-slash" : "send",
      tone: interrupted ? "danger" : response.support ? "confirmed" : "warning",
      title: `${hero.name} · ${TP_STATUS_NAMES[response.status] || response.status}`,
      detail: interrupted
        ? `实际引导 ${Number(response.channel_elapsed_seconds || 0).toFixed(1)} / ${Number(response.channel_expected_seconds || 0).toFixed(1)} 秒`
        : `双方人数 ${local}${order} · ${TP_OUTCOME_NAMES[response.outcome] || "结果未确认"}`,
      badge: response.channel_observed ? "引导事实" : "落点推导",
      timeMs: Number(response.cast_start_ms || 0),
    });
  });
  const objective = fight.objective_context;
  if (objective) {
    const attempt = ROSHAN_ATTEMPTS.find((item) => item.id === objective.attempt_id);
    const aegis = AEGIS_LIFECYCLES.find((item) => item.roshan_attempt_id === objective.attempt_id);
    const classification = attempt ? ROSHAN_CLASS_NAMES[attempt.classification] || attempt.classification : "肉山坑区交战";
    const health = attempt?.health_low_observed == null ? "血量连续性不足" : `最低观测生命 ${Number(attempt.health_low_observed).toLocaleString("zh-CN")}`;
    const shield = aegis ? ` · 守护：${AEGIS_STATE_NAMES[aegis.state] || aegis.state}` : "";
    rows.push({
      icon: "shield",
      tone: attempt?.completed ? "confirmed" : "warning",
      title: classification,
      detail: attempt ? `${health} · ${Number(attempt.participants?.length || 0)} 人攻击肉山${shield}` : "没有检测到同期肉山受击事件",
      badge: attempt?.completed ? "击杀事实" : "坑区上下文",
      timeMs: Number(attempt?.end_ms ?? fight.contact_start_ms ?? 0),
    });
  }
  const target = document.querySelector("#combat-context-summary");
  target.innerHTML = rows.length ? rows.map((row) => `<button class="combat-context-row ${row.tone}" type="button" data-combat-context-time-ms="${row.timeMs}"><span class="combat-context-icon"><i data-lucide="${row.icon}"></i></span><span class="combat-context-copy"><strong>${row.title}</strong><small>${row.detail}</small></span><span class="combat-context-badge">${row.badge}</span></button>`).join("")
    : `<div class="coverage-empty"><span>本片段没有可关联的越塔、TP 或肉山事实链</span></div>`;
}

function selectedCombatFight() {
  return COMBAT_SEGMENTS.find((fight) => fight.id === state.selectedCombatId) || null;
}

function combatContributionTimingFacts() {
  return HEROES.flatMap((hero) => {
    const facts = hero.report?.combat_timing?.fight_facts;
    if (!Array.isArray(facts)) return [];
    return facts.map((fact) => ({
      ...fact,
      player_slot: fact.player_slot == null ? hero.slot : Number(fact.player_slot),
    }));
  });
}

function combatContributionScopeFights() {
  return filterCombatContributionFights(COMBAT_SEGMENTS, state.combatFilter);
}

function combatContributionRows(fight, contributions) {
  if (state.combatContributionScope === "all") {
    return aggregateCombatContributions({
      heroes: HEROES,
      fights: combatContributionScopeFights(),
      timingFacts: combatContributionTimingFacts(),
    });
  }
  return buildCombatContributionRoster({
    heroes: HEROES,
    fight: {
      ...(fight || {}),
      contributions: Array.isArray(contributions) ? contributions : [],
    },
  });
}

async function renderCombatContributionChart(model) {
  const container = document.querySelector("#combat-contribution-chart");
  state.combatContributionChartModel = model;
  if (!container) return;
  const renderToken = ++state.combatContributionRenderToken;
  const chartRuntime = await loadChartRuntime();
  if (renderToken !== state.combatContributionRenderToken) return;
  if (container.clientWidth < 2 || container.clientHeight < 2) return;
  if (!state.combatContributionChart) {
    state.combatContributionChart = chartRuntime.init(container, null, { renderer: "canvas" });
    state.combatContributionChart.on("click", (params) => {
      const slot = Number(params.data?.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot > 9) return;
      state.selectedCombatPlayerSlot = slot;
      state.selectedCombatContributionDimension = state.combatContributionMetric;
      state.combatInspectorView = "audit";
      const fight = selectedCombatFight();
      if (!fight) return;
      const contributions = fightContributions(fight);
      const rows = renderCombatContributionWorkspace(fight, contributions);
      renderCombatMap(fight, contributions);
      renderCombatPlayerAudit(fight, rows);
      setCombatInspectorView("audit");
      if (window.innerWidth < 1280) setCombatCompactView("audit");
    });
  }
  const labelWidth = container.clientWidth < 620 ? 132
    : container.clientWidth < 780 ? 154 : 190;
  container.parentElement?.style.setProperty("--combat-contribution-label-width", `${labelWidth}px`);
  state.combatContributionChart.setOption(combatContributionChartOption({
    ...model,
    labelWidth,
  }), true);
  window.requestAnimationFrame(() => state.combatContributionChart?.resize());
}

function renderCombatContributionWorkspace(fight, contributions) {
  const rows = combatContributionRows(fight, contributions);
  const model = combatContributionChartModel({
    rows,
    metric: state.combatContributionMetric,
  });
  const scopeFights = state.combatContributionScope === "all"
    ? combatContributionScopeFights() : fight ? [fight] : [];
  const sample = document.querySelector("#combat-contribution-sample");
  if (sample) {
    sample.textContent = combatContributionSampleLabel({
      scope: state.combatContributionScope,
      fight,
      filter: state.combatFilter,
      sampleCount: scopeFights.length,
      totalCount: COMBAT_SEGMENTS.length,
    });
  }
  document.querySelectorAll("[data-combat-contribution-scope]").forEach((button) => {
    const active = button.dataset.combatContributionScope === state.combatContributionScope;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-combat-contribution-metric]").forEach((button) => {
    const active = button.dataset.combatContributionMetric === state.combatContributionMetric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const labels = document.querySelector("#combat-contribution-labels");
  if (labels) {
    labels.innerHTML = combatContributionLabelMarkup({
      model,
      selectedSlot: state.selectedCombatPlayerSlot,
      heroImage: (hero) => heroImage(hero.token),
    });
    installImageFallback(labels, heroImage("unknown"));
  }
  const accessible = document.querySelector("#combat-contribution-accessible");
  if (accessible) accessible.innerHTML = combatContributionAccessibleMarkup(model);
  void renderCombatContributionChart(model);
  return rows;
}

function combatEvidenceDescription(event) {
  const kind = String(event.kind || "");
  const key = String(event.key || "");
  const name = kind === "item_use" || kind === "item_uses"
    ? itemName(key)
    : key ? abilityName(key) : "";
  const value = Number(event.value);
  if (kind === "damage") return `${name || "伤害事件"} · ${value.toLocaleString("zh-CN")} 伤害`;
  if (kind === "damage_taken") return `${name || "承伤事件"} · ${value.toLocaleString("zh-CN")} 承伤`;
  if (kind === "control") return `${name || "控制事件"} · ${value.toFixed(1)} 秒`;
  if (kind === "heal" || kind === "healing") return `${name || "治疗事件"} · ${value.toLocaleString("zh-CN")} 治疗`;
  if (kind === "ability_cast" || kind === "ability_casts") return `施放 ${name || "技能"}`;
  if (kind === "item_use" || kind === "item_uses") return `使用 ${name || "物品"}`;
  if (kind === "ward_place" || kind === "vision_setup") return `${name || "眼位"} · 视野准备`;
  if (kind.includes("arrival")) return `进入主战场 · +${value.toFixed(1)} 秒`;
  return [name, kind, Number.isFinite(value) ? value.toLocaleString("zh-CN") : ""].filter(Boolean).join(" · ")
    || "关联事件";
}

function clearCombatResponsibilityDetails(message) {
  state.combatResponsibilityRadarModel = null;
  state.combatResponsibilityRadar?.clear();
  const radar = document.querySelector("#combat-responsibility-radar");
  if (radar) {
    radar.classList.add("empty");
    radar.dataset.emptyMessage = message;
  }
  const components = document.querySelector("#combat-score-components");
  if (components) components.innerHTML = `<div class="coverage-empty"><span>${message}</span></div>`;
  const detail = document.querySelector("#combat-dimension-detail");
  if (detail) detail.innerHTML = "";
}

async function renderCombatResponsibilityRadar(model) {
  const container = document.querySelector("#combat-responsibility-radar");
  state.combatResponsibilityRadarModel = model;
  if (!container) return;
  const renderToken = ++state.combatResponsibilityRadarRenderToken;
  const option = combatResponsibilityRadarOption(model);
  if (!option) {
    state.combatResponsibilityRadar?.clear();
    container.classList.add("empty");
    container.dataset.emptyMessage = model.scoreBreakdownAvailable
      ? "当前门禁下不足 3 个职责维度可评价"
      : "重新解析后生成位置职责雷达";
    return;
  }
  container.classList.remove("empty");
  container.removeAttribute("data-empty-message");
  const chartRuntime = await loadChartRuntime();
  if (renderToken !== state.combatResponsibilityRadarRenderToken) return;
  if (container.clientWidth < 2 || container.clientHeight < 2) return;
  if (!state.combatResponsibilityRadar) {
    state.combatResponsibilityRadar = chartRuntime.init(container, null, { renderer: "canvas" });
    state.combatResponsibilityRadar.on("click", (params) => {
      const axis = state.combatResponsibilityRadarModel?.roleAxes
        ?.find((item) => item.label === params.name && item.applicable);
      if (!axis) return;
      state.selectedCombatContributionDimension = axis.key;
      const fight = selectedCombatFight();
      if (!fight) return;
      renderCombatPlayerAudit(fight, combatContributionRows(fight, fightContributions(fight)));
    });
  }
  state.combatResponsibilityRadar.setOption(option, true);
  window.requestAnimationFrame(() => state.combatResponsibilityRadar?.resize());
}

function combatContributionOpponent(rows, contribution) {
  return rows.find((row) => (
    row.team !== contribution.team
    && Number(row.position) === Number(contribution.position)
  )) || null;
}

function renderCombatResponsibilityDetails(contribution, rows) {
  const opponent = combatContributionOpponent(rows, contribution);
  let dimension = state.selectedCombatContributionDimension || state.combatContributionMetric;
  let model = combatContributionDrilldown({
    row: contribution,
    opponent,
    metric: dimension,
    scope: state.combatContributionScope,
  });
  if (dimension === "responsibility" && model.scoreBreakdownAvailable) {
    const preferred = model.roleAxes.find((axis) => axis.available)
      || model.roleAxes.find((axis) => axis.applicable);
    if (preferred) {
      dimension = preferred.key;
      state.selectedCombatContributionDimension = dimension;
      model = combatContributionDrilldown({
        row: contribution,
        opponent,
        metric: dimension,
        scope: state.combatContributionScope,
      });
    }
  }
  const components = document.querySelector("#combat-score-components");
  if (components) {
    components.innerHTML = combatScoreComponentsMarkup(
      model,
      state.selectedCombatContributionDimension,
    );
  }
  const detail = document.querySelector("#combat-dimension-detail");
  if (detail) {
    detail.innerHTML = combatDimensionDetailMarkup(model, {
      evidenceLabel: combatEvidenceDescription,
    });
  }
  void renderCombatResponsibilityRadar(model);
}

function renderCombatPlayerAudit(fight, contributions) {
  const contribution = contributions.find((row) => row.slot === state.selectedCombatPlayerSlot) || contributions[0];
  if (!contribution) {
    document.querySelector("#combat-player-heading").textContent = "没有可审计的玩家事件";
    document.querySelector("#combat-audit-score").textContent = "--";
    document.querySelector("#combat-player-audit").innerHTML = `<div class="coverage-empty"><span>贡献评分已停用，直到解析器取得真实施法、伤害或控制证据</span></div>`;
    document.querySelector("#damage-breakdown").innerHTML = "";
    clearCombatResponsibilityDetails("没有可审计的玩家事件");
    return;
  }
  state.selectedCombatPlayerSlot = contribution.slot;
  const hero = safeHero(contribution.slot);
  if (contribution.hasContribution === false) {
    const status = contribution.displayStatus === "not_participant"
      ? "未进入主战场"
      : "参战事件不足";
    document.querySelector("#combat-player-heading").textContent = `${hero.name} · ${positionLabel(hero.position)}`;
    document.querySelector("#combat-audit-kicker").textContent = `责任审计 · ${status}`;
    document.querySelector("#combat-audit-score").textContent = "--";
    document.querySelector("#combat-player-audit").innerHTML = `<div class="coverage-empty"><span>${status}，保留该玩家位置但不生成职责评分或负面结论</span></div>`;
    document.querySelector("#damage-breakdown").innerHTML = `<div class="coverage-empty"><span>当前统计范围没有可下钻的贡献事件</span></div>`;
    clearCombatResponsibilityDetails(status);
    return;
  }
  renderCombatResponsibilityDetails(contribution, contributions);
  const gate = contribution.responsibility_gate || null;
  const gateMeta = responsibilityGateMeta(gate);
  document.querySelector("#combat-player-heading").textContent = `${hero.name} · ${positionLabel(hero.position)}`;
  const roleReady = Number(contribution.role_confidence || hero.roleConfidence || 0) >= 65;
  document.querySelector("#combat-audit-kicker").textContent = `责任审计 · ${positionLabel(Number(contribution.position || hero.position))} · ${gate ? gateMeta.label : `置信度 ${Number(contribution.confidence || 0)}%`}`;
  document.querySelector("#combat-audit-score").textContent = gate && gate.status !== "passed" || !roleReady ? "--" : Number(contribution.responsibilityScore || 0);
  const issues = contribution.issues || [];
  const blockers = Object.entries(gate?.blockers || {}).filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 4);
  document.querySelector("#combat-player-audit").innerHTML = `
    <div class="combat-audit-metrics">
      <span><small>伤害 / 占比</small><strong>${Number(contribution.damage || 0).toLocaleString("zh-CN")} · ${Number(contribution.teamDamageShare || 0).toFixed(1)}%</strong></span>
      <span><small>承伤 / 占比</small><strong>${Number(contribution.damageTaken || 0).toLocaleString("zh-CN")} · ${Number(contribution.teamDamageTakenShare || 0).toFixed(1)}%</strong></span>
      <span><small>技能 / 物品</small><strong>${Number(contribution.abilityCasts || 0)} / ${Number(contribution.itemUses || 0)}</strong></span>
      <span><small>控制 / 治疗</small><strong>${Number(contribution.controlSeconds || 0).toFixed(1)}s / ${Number(contribution.healing || 0)}</strong></span>
      <span><small>在场率</small><strong>${Number(contribution.presencePct || 0)}%</strong></span>
      <span><small>进入战斗</small><strong>+${Number(contribution.arrivalDelay || 0)}s</strong></span>
      <span><small>眼 / 真眼准备</small><strong>${Number(contribution.setupObservers || 0)} / ${Number(contribution.setupSentries || 0)}</strong></span>
      <span><small>位置置信度</small><strong>${Number(contribution.role_confidence || hero.roleConfidence || 0)}%</strong></span>
    </div>
    ${gate ? `<div class="combat-gate-summary ${gateMeta.className}"><span><small>职责硬门禁</small><strong>${gateMeta.label}</strong></span><span><small>状态覆盖</small><strong>${Number(gate.coverage_pct || 0)}%</strong></span><span><small>有效机会</small><strong>${Number(gate.opportunity_seconds || 0)} 秒</strong></span><span class="combat-gate-blockers"><small>主要限制</small><strong>${blockers.length ? blockers.map(([key, count]) => `${RESPONSIBILITY_BLOCKER_NAMES[key] || key} ${count}`).join(" · ") : "无"}</strong></span></div>` : ""}
    <div class="combat-audit-issues">${issues.length ? issues.map((issue) => `<span>${COMBAT_ISSUE_NAMES[issue] || issue}</span>`).join("") : !roleReady ? `<span class="clear">位置置信度低于 65%，保留事实但不生成分位置责任结论</span>` : gate && gate.status !== "passed" ? `<span class="clear">硬门禁未通过，本场不生成“没交技能”等责任结论</span>` : `<span class="clear">职责证据未发现明显缺口</span>`}</div>`;
  const damage = (fight.damageBySlot?.[String(contribution.slot)] || []).map((row) => [abilityName(row.key), Number(row.value) || 0, row.key]);
  const largest = Math.max(1, ...damage.map((row) => row[1]));
  document.querySelector("#damage-breakdown").innerHTML = damage.length
    ? damage.slice(0, 5).map(([name, value, rawKey]) => `<div class="damage-row" title="${rawKey}"><div class="damage-copy"><span>${name}</span><strong>${value.toLocaleString("zh-CN")}</strong></div><div class="damage-bar"><span style="width:${value / largest * 100}%"></span></div></div>`).join("")
    : `<div class="coverage-empty"><span>没有可拆解的技能伤害事件</span></div>`;
}

function setCombatInspectorView(view) {
  state.combatInspectorView = view === "events" ? "events" : "audit";
  document.querySelectorAll("#combat-inspector-tabs [data-combat-inspector]").forEach((button) => {
    button.classList.toggle("active", button.dataset.combatInspector === state.combatInspectorView);
  });
  document.querySelector("#combat-audit-pane")?.classList.toggle("active", state.combatInspectorView === "audit");
  document.querySelector("#combat-events-pane")?.classList.toggle("active", state.combatInspectorView === "events");
  document.querySelector("#combat-audit-score")?.classList.toggle("hidden", state.combatInspectorView === "events");
}

function setCombatMapExpanded(expanded) {
  const panel = document.querySelector("#detail-combat");
  const button = document.querySelector("#combat-map-expand");
  if (!panel || !button) return;
  panel.classList.toggle("map-expanded", expanded);
  button.setAttribute("aria-pressed", String(expanded));
  button.setAttribute("aria-label", expanded ? "退出大地图" : "放大战斗地图");
  button.title = expanded ? "退出大地图" : "放大战斗地图";
  button.innerHTML = `<i data-lucide="${expanded ? "minimize-2" : "maximize-2"}"></i>`;
  refreshIcons(button);
  window.requestAnimationFrame(() => resolveCombatMarkerCollisions(document.querySelector("#combat-map-players")));
}

function centerSelectedCombatRow(behavior = "smooth") {
  const list = document.querySelector("#combat-list");
  const row = list?.querySelector(".combat-row.active");
  if (!list || !row || list.scrollHeight <= list.clientHeight) return;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const targetTop = list.scrollTop + rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2;
  list.scrollTo({
    top: clamp(targetTop, 0, Math.max(0, list.scrollHeight - list.clientHeight)),
    behavior,
  });
}

function renderCombat(options = {}) {
  const related = COMBAT_SEGMENTS.filter((fight) => (fight.participants || []).includes(state.selectedHeroSlot));
  const baseFights = related.length ? related : COMBAT_SEGMENTS;
  const fights = baseFights.filter((fight) => {
    if (state.combatFilter === "important") return Boolean(fight.importance?.important);
    if (state.combatFilter === "critical") return fight.importance?.tier === "critical";
    if (state.combatFilter === "teamfight") return fight.kind === "teamfight";
    return true;
  });
  if (fights.length && !fights.some((fight) => fight.id === state.selectedCombatId)) state.selectedCombatId = fights[0].id;
  if (!fights.length) state.selectedCombatId = null;
  const list = document.querySelector("#combat-list");
  list.innerHTML = fights.length ? fights.map((fight) => {
    const contactStart = Number(fight.contact_start ?? fight.start);
    const contactEnd = Number(fight.contact_end ?? fight.end);
    const classifier = Number(fight.classification?.confidence) > 0
      ? ` · 自动 ${Number(fight.classification.confidence)}%`
      : "";
    const reason = (fight.classification?.reasons || []).map((item) => COMBAT_REASON_NAMES[item] || item)[0];
    const importance = fightImportanceMeta(fight);
    const importanceReason = (fight.importance?.reasons || []).map((item) => COMBAT_IMPORTANCE_REASON_NAMES[item] || item)[0];
    const duration = Math.max(0, Number(fight.contact_end_ms ?? contactEnd * 1000) - Number(fight.contact_start_ms ?? contactStart * 1000)) / 1000;
    const compactResult = String(fight.result || "").match(/\d+\s*:\s*\d+/)?.[0] || fight.result;
    return `<button class="combat-row ${state.selectedCombatId === fight.id ? "active" : ""}" type="button" data-combat-id="${fight.id}" title="${escapeHtml(fight.title)}"><time>${formatTime(contactStart)}<i>–</i>${formatTime(contactEnd)}</time><span class="combat-row-copy"><strong><span class="combat-row-title">${fight.title}</span><i class="combat-importance-badge ${importance.className}">${importance.label} ${Number(fight.importance?.score || 0)}</i></strong><small>${importanceReason || reason || fight.location} · 接触 ${duration.toFixed(duration < 10 ? 1 : 0)} 秒${classifier}</small></span><span class="result-pill ${fight.tone}" title="${escapeHtml(fight.result)}">${compactResult}</span></button>`;
  }).join("") : `<div class="coverage-empty"><i data-lucide="shield-off"></i><span>没有识别到战斗片段</span></div>`;
  document.querySelector("#combat-count").textContent = state.combatFilter === "all" ? `${fights.length} 场` : `${fights.length}/${baseFights.length}`;
  renderSelectedCombat();
  if (options.centerSelection) {
    window.requestAnimationFrame(() => centerSelectedCombatRow(options.scrollBehavior));
  }
}

function renderSelectedCombat() {
  const fight = selectedCombatFight()
    || (state.combatFilter === "all" ? COMBAT_SEGMENTS[0] : null);
  if (!fight) {
    document.querySelector("#combat-heading").textContent = "没有战斗片段";
    document.querySelector("#combat-event-stream").innerHTML = "";
    document.querySelector("#damage-breakdown").innerHTML = "";
    document.querySelector("#combat-contribution-labels").innerHTML = "";
    document.querySelector("#combat-contribution-accessible").innerHTML = "";
    state.combatContributionChartModel = null;
    state.combatContributionChart?.clear();
    clearCombatResponsibilityDetails("没有可审计的战斗片段");
    document.querySelector("#combat-overview-stats").innerHTML = "";
    document.querySelector("#combat-context-summary").innerHTML = "";
    document.querySelector("#combat-vision-summary").innerHTML = "";
    document.querySelector("#combat-map-context").innerHTML = "";
    document.querySelector("#combat-phase-strip").innerHTML = "";
    document.querySelector("#combat-phase-strip").classList.add("hidden");
    return;
  }
  document.querySelector("#combat-heading").textContent = fight.title;
  const ownDeaths = state.selectedHeroSlot < 5 ? fight.radiant_deaths : fight.dire_deaths;
  const enemyDeaths = state.selectedHeroSlot < 5 ? fight.dire_deaths : fight.radiant_deaths;
  const tone = enemyDeaths > ownDeaths ? "positive" : enemyDeaths < ownDeaths ? "negative" : "info";
  const period = document.querySelector("#combat-period");
  const result = document.querySelector("#combat-result");
  if (period) period.textContent = `${formatTime(fight.start)} - ${formatTime(fight.end)} · 含接触前复盘`;
  if (result) {
    const importance = fightImportanceMeta(fight);
    result.textContent = `${importance.label} ${Number(fight.importance?.score || 0)} · ${fight.result}`;
    result.className = `result-pill ${tone}`;
  }
  const contributions = fightContributions(fight);
  if (!HEROES.some((hero) => hero.slot === state.selectedCombatPlayerSlot)) {
    state.selectedCombatPlayerSlot = state.selectedHeroSlot;
  }
  renderCombatMap(fight, contributions);
  renderCombatVision(fight, contributions);
  renderCombatContext(fight);
  const contributionRows = renderCombatContributionWorkspace(fight, contributions);
  renderCombatPlayerAudit(fight, contributionRows);
  const eventStream = document.querySelector("#combat-event-stream");
  eventStream.innerHTML = combatEventRows(fight).map((event) => `<button class="combat-event-row" type="button" data-combat-time-ms="${event.timeMs ?? event.time * 1000}" data-event-seq="${event.eventSeq ?? ""}"><time>${formatPreciseTimeMs(event.timeMs ?? event.time * 1000)}</time><span class="event-symbol"><i data-lucide="${event.icon}"></i></span><strong>${event.text}</strong><small>${event.value}</small></button>`).join("");
  setCombatInspectorView(state.combatInspectorView);
  refreshIcons(document.querySelector("#detail-combat"));
}

function eventRowHtml(event, top) {
  return `<button class="event-row" type="button" data-event-time-ms="${event.timeMs ?? event.time * 1000}" style="top:${top}px"><time>${formatPreciseTimeMs(event.timeMs ?? event.time * 1000)}</time><span class="event-type-icon"><i data-lucide="${event.icon}"></i>${event.type}</span><span>${event.actor}</span><span>${event.text}</span><span class="event-value">${event.value}</span><span>${event.location}</span><span class="evidence-tag ${event.evidence === "事实" ? "fact" : "derived"}">${event.evidence}</span></button>`;
}

function filterTimelineEvents() {
  const search = document.querySelector("#event-search").value.trim().toLowerCase();
  state.filteredEvents = TIMELINE_EVENTS.filter((event) => {
    const categoryMatches = state.eventFilter === "all" || event.category === state.eventFilter;
    const haystack = `${event.actor} ${event.type} ${event.text} ${event.location}`.toLowerCase();
    return categoryMatches && (!search || haystack.includes(search));
  });
  const table = document.querySelector("#event-table");
  table.scrollTop = 0;
  renderVirtualEvents();
  document.querySelector("#event-count").textContent = `${state.filteredEvents.length.toLocaleString("zh-CN")} 条事件`;
}

function renderVirtualEvents() {
  const table = document.querySelector("#event-table");
  const rowHeight = 36;
  const start = Math.max(0, Math.floor(table.scrollTop / rowHeight) - 5);
  const visibleCount = Math.ceil((table.clientHeight || 420) / rowHeight) + 10;
  const end = Math.min(state.filteredEvents.length, start + visibleCount);
  const rows = state.filteredEvents.slice(start, end).map((event, index) => eventRowHtml(event, (start + index) * rowHeight)).join("");
  table.innerHTML = `<div class="event-virtual-space" style="height:${state.filteredEvents.length * rowHeight}px">${rows}</div>`;
  refreshIcons(table);
}

function renderScoreboard() {
  const body = document.querySelector("#scoreboard-body");
  const value = (number) => number == null || !Number.isFinite(Number(number)) ? "--" : Number(number).toLocaleString("zh-CN");
  const pair = (left, right) => `${value(left)} / ${value(right)}`;
  body.innerHTML = HEROES.map((hero) => {
    const label = `${hero.name}，${hero.player}，${hero.kills}/${hero.deaths}/${hero.assists}`;
    const report = hero.report;
    const score = Number(report?.overall_score);
    const scoreLabel = Number.isFinite(score)
      ? `<span class="player-score-cell grade-${String(report.grade || "c").toLowerCase()}"><strong>${Math.round(score)}</strong><small>${escapeHtml(report.grade || "-")}</small></span>`
      : `<span class="player-score-cell unavailable"><strong>--</strong><small>待解析</small></span>`;
    return `<button class="scoreboard-row ${hero.me ? "me" : ""} ${hero.slot === 5 ? "dire-start" : ""} ${hero.slot === state.selectedHeroSlot ? "active" : ""}" type="button" role="row" data-player-slot="${hero.slot}" data-team="${hero.team}" aria-label="${escapeHtml(label)}">
      <span class="player-cell" role="cell"><img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}"><span><strong title="${escapeHtml(hero.name)}">${escapeHtml(hero.name)}${hero.me ? " · 我" : ""}</strong><small title="${escapeHtml(hero.player)}">${escapeHtml(hero.player)}</small></span></span>
      <span class="scoreboard-stat" role="cell">${pair(hero.kills, hero.deaths)} / ${value(hero.assists)}</span>
      <span class="scoreboard-stat" role="cell">${pair(hero.lh, hero.denies)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.networth)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.gpm)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.xpm)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.damage)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.taken)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.healing)}</span>
      <span class="scoreboard-stat" role="cell">${value(hero.vision)}</span>
      ${scoreLabel}
    </button>`;
  }).join("");
  const score = state.currentAnalysis?.match;
  if (score) document.querySelector(".scoreboard-header .panel-kicker").textContent = `${score.radiant_score ?? "--"} : ${score.dire_score ?? "--"}`;
  installImageFallback(body, heroImage("unknown"));
  renderPlayerReport();
}

function formatPlayerReportValue(value, unit = "count") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (unit === "percent") return `${Math.round(number)}%`;
  if (unit === "seconds") return `${number.toFixed(number % 1 ? 1 : 0)} 秒`;
  if (unit === "gold") return `${Math.round(number).toLocaleString("zh-CN")} 金`;
  if (unit === "damage") return Math.round(number).toLocaleString("zh-CN");
  if (unit === "per_minute") return `${Math.round(number)}/分`;
  if (unit === "score" || unit === "model_points") return `${Math.round(number)} 分`;
  return Math.round(number).toLocaleString("zh-CN");
}

function playerEvidenceText(evidence) {
  if (!evidence) return "证据不足";
  const [label, fallbackUnit] = PLAYER_EVIDENCE_META[evidence.key] || [evidence.key || "指标", evidence.unit || "count"];
  const unit = evidence.unit || fallbackUnit;
  const value = formatPlayerReportValue(evidence.value, unit);
  const noCounterpart = new Set([
    "lane_confidence", "resource_review_windows", "resource_missed_windows",
    "resource_estimated_loss", "lane_jungle_cycles", "fight_damage_share",
    "kill_conversion", "fight_presence", "reviewable_fights", "passed_duty_fights",
    "observer_wards", "sentry_wards", "dewards", "vision_score", "ward_detections",
    "stack_team_value_estimate",
  ]);
  const counterpart = Number(evidence.counterpart);
  const comparison = !noCounterpart.has(evidence.key) && Number.isFinite(counterpart)
    ? ` · 对位 ${formatPlayerReportValue(counterpart, unit)}` : "";
  return `${label} ${value}${comparison}`;
}

function playerDimensionName(key) {
  return PLAYER_DIMENSION_META[key]?.[0] || String(key || "综合表现").replaceAll("_", " ");
}

function reportMetric(icon, label, value, detail = "") {
  return `<span class="player-report-metric"><i data-lucide="${icon}"></i><span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<em>${escapeHtml(detail)}</em>` : ""}</span></span>`;
}

function renderPlayerReport() {
  const root = document.querySelector("#player-report-body");
  if (!root) return;
  const hero = safeHero(state.selectedHeroSlot);
  const facts = hero.facts || {};
  const report = hero.report;
  if (!report) {
    const canReparse = Boolean(state.currentMatch);
    root.innerHTML = `<div class="player-report-empty">
      <span class="empty-state-icon warning"><i data-lucide="scan-search"></i></span>
      <span><strong>${state.currentAnalysis ? "这份分析还没有玩家履职报告" : "等待完整 Replay 分析"}</strong><small>${state.currentAnalysis ? "当前摘要来自旧版模型，原始 Replay 缓存可直接用于升级。" : "完成逐帧解析后生成按位置区分的同场相对评分。"}</small></span>
      ${canReparse ? `<button class="command-button secondary" type="button" data-player-report-reparse><i data-lucide="rotate-cw"></i><span>升级分析</span></button>` : ""}
    </div>`;
    refreshIcons(root);
    return;
  }

  const position = Number(report.position || hero.position) || 0;
  const role = PLAYER_ROLE_META[position] || { label: positionLabel(position), brief: "职责证据待补全" };
  const overall = Math.round(Number(report.overall_score) || 0);
  const confidence = Math.round(Number(report.confidence) || 0);
  const dimensions = Array.isArray(report.dimensions) ? report.dimensions : [];
  const phases = Array.isArray(report.phase_scores) ? report.phase_scores : [];
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const strengths = (report.strengths || []).map((key) => dimensionByKey.get(key)).filter(Boolean);
  const improvements = (report.improvements || []).map((key) => dimensionByKey.get(key)).filter(Boolean);
  const gradeTone = `grade-${String(report.grade || "c").toLowerCase()}`;
  const dimensionHtml = dimensions.map((dimension) => {
    const [name, brief] = PLAYER_DIMENSION_META[dimension.key] || [playerDimensionName(dimension.key), "位置职责指标"];
    const rawScore = playerScoreNumber(dimension.score);
    const available = dimension.available !== false && rawScore != null;
    const score = available ? Math.round(rawScore) : null;
    const evidence = (dimension.evidence || []).slice(0, 2).map(playerEvidenceText).join(" · ");
    return `<div class="player-report-dimension ${escapeHtml(available ? dimension.status || "stable" : "missing")}">
      <span class="dimension-label"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(brief)} · 权重 ${Number(dimension.weight) || 0}%</small></span>
      <span class="dimension-meter"><i style="width:${available ? clamp(score, 0, 100) : 0}%"></i><small title="${escapeHtml(evidence)}">${escapeHtml(evidence || "当前 Replay 证据不足，本维度不计入总分")}</small></span>
      <b>${available ? score : "待补"}</b>
    </div>`;
  }).join("");
  const phaseHtml = phases.map((phase) => {
    const score = Math.round(Number(phase.score) || 0);
    const kda = `${Number(phase.kills) || 0}/${Number(phase.deaths) || 0}/${Number(phase.assists) || 0}`;
    return `<div class="player-phase-row">
      <span><strong>${PLAYER_PHASE_META[phase.phase] || escapeHtml(phase.phase || "阶段")}</strong><small>${kda} · ${Number(phase.last_hits) || 0} 补刀</small></span>
      <span><small>经济增长</small><strong>${Number(phase.networth_gain || 0).toLocaleString("zh-CN")}</strong></span>
      <span><small>英雄伤害</small><strong>${Number(phase.damage_dealt || 0).toLocaleString("zh-CN")}</strong></span>
      <b class="${score >= 75 ? "positive" : score < 55 ? "negative" : ""}">${score}</b>
    </div>`;
  }).join("") || `<div class="player-phase-empty">阶段快照不足</div>`;
  const insightHtml = (items, type) => items.map((dimension) => `<span class="player-report-insight ${type}"><i data-lucide="${type === "strength" ? "circle-check" : "circle-alert"}"></i><span><strong>${escapeHtml(playerDimensionName(dimension.key))}</strong><small>${type === "strength" ? "本场稳定优势" : "优先复核"} · ${Math.round(Number(dimension.score) || 0)} 分</small></span></span>`).join("");
  const observerWards = Number(facts.aggregate_observer_wards ?? facts.observer_wards) || 0;
  const sentryWards = Number(facts.aggregate_sentry_wards ?? facts.sentry_wards) || 0;
  const laneGold = Number(facts.lane_gold) || 0;
  const neutralGold = Number(facts.neutral_gold) || 0;

  root.innerHTML = `<header class="player-report-header">
    <span class="player-report-identity"><img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}"><span><small>${escapeHtml(role.label)} · 置信度 ${confidence}%</small><strong>${escapeHtml(hero.name)} · ${escapeHtml(hero.player)}</strong><em>${escapeHtml(role.brief)}</em></span></span>
    <span class="player-report-model"><i data-lucide="braces"></i>单场 Replay · 位置模型 v1</span>
    <span class="player-overall-score ${gradeTone}"><small>本场履职分</small><strong>${overall}</strong><b>${escapeHtml(report.grade || "-")}</b></span>
  </header>
  <nav class="player-report-tabs compact-panel-tabs" aria-label="玩家报告模块">
    <button type="button" data-player-report-view="facts" role="tab"><i data-lucide="activity"></i><span>基础数据</span></button>
    <button type="button" data-player-report-view="dimensions" role="tab"><i data-lucide="radar"></i><span>位置评分</span></button>
    <button type="button" data-player-report-view="phases" role="tab"><i data-lucide="chart-no-axes-column-increasing"></i><span>阶段表现</span></button>
    <button type="button" data-player-report-view="insights" role="tab"><i data-lucide="list-checks"></i><span>优缺点</span></button>
  </nav>
  <div class="player-report-grid">
    <section class="player-report-section player-report-facts">
      <header><span>操作与产出</span><small>Replay 事实</small></header>
      <div class="player-report-metrics">
        ${reportMetric("mouse-pointer-2", "APM", formatPlayerReportValue(facts.actions_per_min, "per_minute"), `${Number(facts.ability_casts) || 0} 次技能`)}
        ${reportMetric("package-open", "物品使用", formatPlayerReportValue(facts.item_uses), `${Number(facts.teleport_uses) || 0} 次 TP`)}
        ${reportMetric("swords", "控制时长", formatPlayerReportValue(facts.control_seconds, "seconds"), `${Number(facts.fight_summary?.fights) || 0} 场战斗`)}
        ${reportMetric("timer-off", "死亡时间", formatPlayerReportValue(facts.dead_seconds, "seconds"), `${hero.deaths || 0} 次阵亡`)}
        ${reportMetric("eye", "真假眼 / 排眼", `${observerWards} / ${sentryWards} / ${Number(facts.dewards) || 0}`)}
        ${reportMetric("milestone", "神符 / 叠野", `${Number(facts.aggregate_rune_pickups) || 0} / ${Number(facts.aggregate_camps_stacked) || 0}`)}
        ${reportMetric("coins", "线上 / 野区金钱", `${laneGold.toLocaleString("zh-CN")} / ${neutralGold.toLocaleString("zh-CN")}`)}
        ${reportMetric("shield", "承伤 / 治疗", `${Number(hero.taken || 0).toLocaleString("zh-CN")} / ${Number(hero.healing || 0).toLocaleString("zh-CN")}`)}
      </div>
    </section>
    <section class="player-report-section player-report-dimensions">
      <header><span>位置职责评分</span><small>权重合计 100%</small></header>
      <div class="player-report-dimension-list">${dimensionHtml}</div>
    </section>
    <section class="player-report-section player-report-phases">
      <header><span class="player-report-phase-title">分阶段表现</span><span class="player-report-insights-title">优缺点</span><small>同位置对位基准</small></header>
      <div class="player-phase-list">${phaseHtml}</div>
      <div class="player-report-insights">
        <div><small>优势证据</small>${insightHtml(strengths, "strength")}</div>
        <div><small>优先复核</small>${insightHtml(improvements, "improve")}</div>
      </div>
    </section>
  </div>
  <footer class="player-report-caveat"><i data-lucide="info"></i><span>分数是本场同位置相对履职评估，不代表段位百分位；英雄专属任务与施法机会仍需结合战斗时间轴复核。</span></footer>`;
  setPlayerReportView(state.playerReportView);
  installImageFallback(root, heroImage("unknown"));
  refreshIcons(root);
}

function playerScoreNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonicalPlayerScoreDimensionKey(key) {
  const normalized = String(key || "");
  return Object.keys(PLAYER_SCORE_DIMENSION_ALIASES)
    .find((candidate) => PLAYER_SCORE_DIMENSION_ALIASES[candidate].includes(normalized)) || null;
}

function playerScoreEvidenceLevel(level) {
  const values = {
    full: { label: "证据完整", className: "fact" },
    available: { label: "证据完整", className: "fact" },
    derived: { label: "程序推导", className: "aggregate" },
    partial: { label: "部分证据", className: "aggregate" },
    gated: { label: "门禁评分", className: "derived" },
    missing: { label: "证据不足", className: "insufficient" },
    invalid: { label: "证据无效", className: "insufficient" },
  };
  return values[level] || values.partial;
}

function playerScoreAdviceModule(advice) {
  const explicit = advice?.jump_target?.module;
  if (explicit) return explicit;
  const category = String(advice?.category || advice?.id || "");
  if (category.includes("lane")) return "development";
  if (category.includes("farm") || category.includes("route") || category.includes("timing")) return "farm";
  if (category.includes("vision") || category.includes("ward")) return "vision";
  if (category.includes("combat") || category.includes("death") || category.includes("buyback")) return "combat";
  if (category.includes("objective") || category.includes("tempo")) return "map";
  return "timeline";
}

function playerScoreImpactText(impact) {
  if (!impact) return "影响范围尚未量化";
  if (typeof impact === "string") return impact;
  const parts = [];
  const gold = impact.gold_range || impact.goldRange;
  const delay = impact.item_delay_seconds_range || impact.itemDelaySecondsRange;
  if (Array.isArray(gold) && gold.length >= 2) parts.push(`约 ${Number(gold[0]) || 0}-${Number(gold[1]) || 0} 金`);
  if (Array.isArray(delay) && delay.length >= 2) parts.push(`装备延后 ${Number(delay[0]) || 0}-${Number(delay[1]) || 0} 秒`);
  if (impact.target) parts.push(String(impact.target));
  return parts.join(" · ") || "影响范围尚未量化";
}

function playerScoreMetricReference(model, reference) {
  const reportMetrics = Array.isArray(model.report?.metrics) ? model.report.metrics : [];
  const source = typeof reference === "object" && reference
    ? reference
    : model.evidenceIndex?.[reference] || reportMetrics.find((metric) => String(metric.id) === String(reference));
  if (!source) return null;
  const key = source.key || source.metric || source.id || "";
  const label = source.label || source.title || PLAYER_EVIDENCE_META[key]?.[0] || "关键指标";
  if (source.display_value != null) return { label, value: String(source.display_value) };
  if (source.text != null) return { label, value: String(source.text) };
  if (source.value == null) return null;
  return {
    label,
    value: typeof source.value === "string"
      ? source.value
      : formatPlayerReportValue(source.value, source.unit || PLAYER_EVIDENCE_META[key]?.[1] || "count"),
  };
}

function playerScoreModel(hero = safeHero(state.selectedHeroSlot), { buildBrief = true } = {}) {
  const report = hero.report || null;
  const upgradeState = playerReportUpgradeState(report);
  const scoreCard = report?.score_card || report || {};
  const scoreAudit = recomputePlayerReportScoreAudit(report || {});
  const scoreAuditByKey = new Map(scoreAudit.rows.map((row) => [row.key, row]));
  const position = clamp(Number(report?.position || hero.position) || 0, 0, 5);
  const weights = PLAYER_SCORE_ROLE_WEIGHTS[position] || PLAYER_SCORE_ROLE_WEIGHTS[3];
  const rawDimensions = Array.isArray(scoreCard.dimensions)
    ? scoreCard.dimensions : Array.isArray(report?.dimensions) ? report.dimensions : [];
  const rawByKey = new Map(rawDimensions.map((dimension) => [String(dimension.key || ""), dimension]));
  const confidence = playerScoreNumber(scoreCard.confidence ?? report?.confidence);
  const overallScore = playerScoreNumber(
    scoreCard.final_score ?? scoreCard.overall_score ?? report?.final_score ?? report?.overall_score,
  );
  const baseOverallScore = playerScoreNumber(scoreCard.base_score ?? report?.base_score);
  const behaviorModifier = playerScoreNumber(
    scoreCard.behavior_modifier ?? report?.behavior_modifier,
  );
  const roleConfidence = playerScoreNumber(report?.role_confidence ?? hero.roleConfidence ?? hero.facts?.role_confidence);
  const canShowOverall = overallScore != null && confidence != null && confidence >= 65 && roleConfidence != null && roleConfidence >= 65;
  const evidenceLevel = scoreCard.evidence_level || report?.evidence_level || (report ? "partial" : "missing");
  const dimensions = Object.entries(PLAYER_SCORE_DIMENSION_META).map(([key, meta]) => {
    const sourceKey = PLAYER_SCORE_DIMENSION_ALIASES[key].find((candidate) => rawByKey.has(candidate));
    const source = sourceKey ? rawByKey.get(sourceKey) : null;
    const baseScore = playerScoreNumber(source?.base_score ?? source?.score);
    const behaviorModifier = playerScoreNumber(source?.behavior_modifier) ?? 0;
    const finalScore = playerScoreNumber(source?.final_score ?? source?.score);
    const score = finalScore;
    return {
      key,
      ...meta,
      sourceKey,
      source,
      score,
      baseScore,
      behaviorModifier,
      finalScore,
      weight: Number(source?.weight ?? weights[key]) || 0,
      roleWeight: Number(weights[key]) || 0,
      effectiveWeight: playerScoreNumber(source?.effective_weight),
      confidence: playerScoreNumber(source?.confidence) ?? (score == null ? null : confidence),
      status: score == null ? "missing" : source?.status || (score >= 75 ? "strength" : score < 55 ? "improve" : "stable"),
      available: source?.available !== false && score != null,
      evidenceLevel: source?.evidence_level || (score == null ? "missing" : evidenceLevel),
      missing: Array.isArray(source?.missing) ? source.missing : [],
      evidence: Array.isArray(source?.evidence) ? source.evidence : [],
      metricRefs: source?.metric_refs || [],
      positiveRefs: source?.positive_refs || [],
      negativeRefs: source?.negative_refs || [],
      behaviorComponents: Array.isArray(source?.behavior_components) ? source.behavior_components : [],
      scoringComponents: Array.isArray(source?.scoring_components) ? source.scoring_components : [],
      baseComponents: Array.isArray(source?.base_components) ? source.base_components : [],
      comparison: source?.comparison || null,
      recomputation: source?.recomputation || null,
      scoreAudit: scoreAuditByKey.get(key) || null,
      scoreImpact: playerScoreNumber(source?.score_impact),
    };
  });
  const dimensionForRawKey = (rawKey) => {
    const canonical = canonicalPlayerScoreDimensionKey(rawKey);
    return dimensions.find((dimension) => dimension.key === canonical) || null;
  };
  const rawStrengths = Array.isArray(report?.strengths) ? report.strengths : [];
  const strengths = rawStrengths.map((strength, index) => {
    if (typeof strength === "object" && strength) {
      const dimension = dimensionForRawKey(strength.key || strength.dimension_key);
      return {
        id: strength.id || `strength-${index}`,
        title: strength.title || dimension?.label || "稳定优势",
        evidenceRefs: strength.evidence_refs || [],
        dimensionKey: dimension?.key || null,
        score: dimension?.score ?? null,
      };
    }
    const dimension = dimensionForRawKey(strength);
    return dimension ? { id: `strength-${dimension.key}`, title: dimension.label, evidenceRefs: dimension.metricRefs, dimensionKey: dimension.key, score: dimension.score } : null;
  }).filter(Boolean).slice(0, 2);
  if (!strengths.length) {
    dimensions.filter((dimension) => dimension.score != null).sort((left, right) => right.score - left.score).slice(0, 2)
      .forEach((dimension) => strengths.push({ id: `strength-${dimension.key}`, title: dimension.label, evidenceRefs: dimension.metricRefs, dimensionKey: dimension.key, score: dimension.score }));
  }
  const rawInsights = Array.isArray(report?.insights) ? report.insights : [];
  const rootCauses = Array.isArray(report?.root_causes) ? report.root_causes : [];
  const rootCauseById = new Map(rootCauses.map((rootCause) => [String(rootCause.id || ""), rootCause]));
  const rawAdvice = Array.isArray(report?.advice)
    ? report.advice
    : rawInsights.filter((item) => ["improvement", "problem", "priority"].includes(String(item?.kind || "")));
  const advice = rawAdvice.map((item, index) => ({
    ...item,
    id: item.id || `advice-${index}`,
    title: item.title || "复核本场决策",
    severity: item.severity || "review",
    confidence: playerScoreNumber(item.confidence),
    timeStart: playerScoreNumber(item.time_start ?? item.timeStart ?? item.jump_target?.time),
    timeEnd: playerScoreNumber(item.time_end ?? item.timeEnd),
    module: playerScoreAdviceModule(item),
    impactText: playerScoreImpactText(item.impact),
    rootCauseId: item.root_cause_id || null,
    rootCause: rootCauseById.get(String(item.root_cause_id || "")) || null,
  })).slice(0, 3);
  const phases = (Array.isArray(report?.phase_reviews) ? report.phase_reviews : report?.phase_scores || []).map((phase, index) => ({
    ...phase,
    id: phase.id || `${phase.phase || "phase"}-${index}`,
    start: playerScoreNumber(phase.start) ?? ({ laning: 0, mid_game: 600, late_game: 1200 }[phase.phase] ?? 0),
    end: playerScoreNumber(phase.end) ?? ({ laning: 600, mid_game: 1200, late_game: MATCH_DURATION }[phase.phase] ?? MATCH_DURATION),
    score: playerScoreNumber(phase.score),
    confidence: playerScoreNumber(phase.confidence) ?? confidence,
  }));
  const availableDimensions = dimensions.filter((dimension) => dimension.score != null);
  const strongest = [...availableDimensions].sort((left, right) => right.score - left.score)[0];
  const weakest = [...availableDimensions].sort((left, right) => left.score - right.score)[0];
  const summary = {
    headline: report?.brief?.verdict || report?.summary?.headline || (strongest && weakest
      ? `${strongest.label}是本场当前最高项，${weakest.label}需要结合时间证据优先复核。`
      : "当前分析包尚未形成完整的十维玩家评分。"),
    nextMatchFocus: report?.brief?.next_match_focus || report?.summary?.next_match_focus || "",
  };
  const combatTimingSource = report?.combat_timing && typeof report.combat_timing === "object"
    ? report.combat_timing
    : {};
  const combatTiming = {
    model: String(combatTimingSource.model || ""),
    coverage: combatTimingSource.coverage && typeof combatTimingSource.coverage === "object"
      ? combatTimingSource.coverage
      : {},
    facts: (Array.isArray(combatTimingSource.fight_facts)
      ? combatTimingSource.fight_facts
      : []
    ).filter((fact) => (
      fact?.player_slot == null
      || Number(fact.player_slot) === Number(hero.slot)
    )).map((fact) => ({
      ...fact,
      jumpTarget: normalizePlayerReportJumpTarget(fact.jump_target),
    })),
    patterns: Array.isArray(combatTimingSource.patterns)
      ? combatTimingSource.patterns
      : [],
  };
  const model = {
    hero,
    report,
    hasReport: upgradeState.hasReport,
    legacy: upgradeState.legacy,
    missingCombatTiming: upgradeState.missingCombatTiming,
    missingScoringAudit: upgradeState.missingScoringAudit,
    needsUpgrade: upgradeState.needsUpgrade,
    model: report?.model || "player-report/1.1",
    position,
    role: PLAYER_ROLE_META[position] || { label: positionLabel(position), brief: "职责证据待补全" },
    roleConfidence,
    counterpartSlot: Number(report?.counterpart_slot ?? matchupSlotFor(hero.slot)),
    confidence,
    canShowOverall,
    evidenceLevel,
    overallScore,
    baseOverallScore,
    behaviorModifier,
    scoreAudit,
    grade: canShowOverall ? scoreCard.grade || report?.grade || "-" : null,
    dimensions,
    strengths,
    advice,
    phases,
    summary,
    rawInsights,
    combatTiming,
    rootCauses,
    rootCauseById,
    rootCauseSummary: scoreCard.root_cause_summary || null,
    storyNodes: Array.isArray(report?.story_nodes) ? report.story_nodes : [],
    trainingPlan: Array.isArray(report?.training_plan) ? report.training_plan : [],
    evidenceIndex: report?.evidence_index && typeof report.evidence_index === "object" ? report.evidence_index : {},
    caveats: report?.caveats || [],
  };
  if (buildBrief) {
    model.brief = playerScoreBriefModel(model);
    if (!model.summary.nextMatchFocus) model.summary.nextMatchFocus = model.brief.focus;
    if (!report?.brief?.verdict && model.brief.verdict) model.summary.headline = model.brief.verdict;
  }
  return model;
}

function playerScoreFallbackDimensionFacts(model, key) {
  const hero = model.hero;
  const facts = hero.facts || {};
  const review = laneReviewForSlot(hero.slot);
  const observerWards = Number(facts.aggregate_observer_wards ?? facts.observer_wards) || 0;
  const sentryWards = Number(facts.aggregate_sentry_wards ?? facts.sentry_wards) || 0;
  const values = {
    lane_execution: [["补刀 / 反补", `${hero.lh ?? "--"} / ${hero.denies ?? "--"}`], ["对线模型", review ? `${signedValue(review.score)} · ${Number(review.confidence || 0)}%` : "待生成"]],
    farm_efficiency: [["GPM / 净值", `${hero.gpm ?? "--"} / ${Number(hero.networth || 0).toLocaleString("zh-CN")}`], ["线上 / 野区金钱", `${Number(facts.lane_gold || 0).toLocaleString("zh-CN")} / ${Number(facts.neutral_gold || 0).toLocaleString("zh-CN")}`]],
    resource_decision: [["路线复核窗口", `${farmDiagnosticsForHero(hero.slot).length} 个`], ["可复核漏刀", `${Number(facts.lane_opportunity_summary?.reviewable_misses || 0)} 个`]],
    map_tempo: [["TP 使用", `${Number(facts.teleport_uses || 0)} 次`], ["神符拾取", `${Number(facts.aggregate_rune_pickups || facts.rune_pickups || 0)} 次`]],
    combat_output: [["英雄伤害", Number(hero.damage || facts.hero_damage || 0).toLocaleString("zh-CN")], ["战斗参与率", formatPlayerReportValue(facts.teamfight_participation, "percent")]],
    combat_duty: [["控制时长", formatPlayerReportValue(facts.control_seconds, "seconds")], ["参与战斗", `${playerScoreFightsForSlot(hero.slot).length} 场`]],
    survival_risk: [["阵亡 / 死亡时间", `${hero.deaths ?? "--"} / ${formatPlayerReportValue(facts.dead_seconds, "seconds")}`], ["买活", `${Number(facts.buyback_count || 0)} 次`]],
    objective_conversion: [["建筑伤害", Number(facts.tower_damage || 0).toLocaleString("zh-CN")], ["塔 / 肉山击杀", `${Number(facts.tower_kills || 0)} / ${Number(facts.roshan_kills || 0)}`]],
    vision_team: [["假眼 / 真眼", `${observerWards} / ${sentryWards}`], ["排眼", `${Number(facts.dewards || 0)} 次`]],
    observable_execution: [["APM", formatPlayerReportValue(facts.actions_per_min, "per_minute")], ["技能 / 物品使用", `${Number(facts.ability_casts || 0)} / ${Number(facts.item_uses || 0)}`], ["TP 使用", `${Number(facts.teleport_uses || 0)} 次`]],
  };
  return (values[key] || []).filter(([, value]) => value !== "--" && !String(value).startsWith("-- /"));
}

function playerScoreBriefStatus(score, fallback = "missing") {
  if (score == null || !Number.isFinite(Number(score))) return fallback;
  if (Number(score) >= 68) return "stable";
  if (Number(score) < 52) return "issue";
  return "even";
}

function playerScoreBriefDomains(model) {
  const v3Domains = Array.isArray(model.report?.brief?.domain_scores) ? model.report.brief.domain_scores : [];
  if (v3Domains.length) {
    return Object.entries(PLAYER_SCORE_DOMAIN_META).map(([key, meta]) => {
      const source = v3Domains.find((domain) => String(domain.key) === key) || {};
      return {
        key,
        ...meta,
        score: playerScoreNumber(source.score),
        confidence: playerScoreNumber(source.confidence),
      };
    });
  }
  return Object.entries(PLAYER_SCORE_DOMAIN_META).map(([key, meta]) => {
    const dimensions = meta.keys.map((dimensionKey) => model.dimensions.find((dimension) => dimension.key === dimensionKey))
      .filter((dimension) => dimension?.score != null);
    const weight = dimensions.reduce((sum, dimension) => sum + Math.max(1, Number(dimension.roleWeight || 0)), 0);
    const score = weight ? dimensions.reduce((sum, dimension) => sum + Number(dimension.score) * Math.max(1, Number(dimension.roleWeight || 0)), 0) / weight : null;
    const confidences = dimensions.map((dimension) => playerScoreNumber(dimension.confidence)).filter((value) => value != null);
    return {
      key,
      ...meta,
      score,
      confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    };
  });
}

function playerScoreBriefV3Stories(model) {
  const refs = Array.isArray(model.report?.brief?.story) ? model.report.brief.story : [];
  const nodes = refs.length
    ? refs.map((ref) => model.storyNodes.find((node) => String(node.id) === String(ref))).filter(Boolean)
    : model.storyNodes.slice(0, 3);
  return nodes.slice(0, 3).map((node, index) => {
    const phase = String(node.phase || "");
    const module = phase === "laning" ? "development"
      : phase.includes("farm") || phase.includes("resource") ? "farm"
        : phase.includes("vision") ? "vision" : phase.includes("fight") ? "combat" : "timeline";
    const laneVerdict = phase === "laning" ? laneReviewForSlot(model.hero.slot)?.verdict : null;
    const verdict = normalizePlayerStoryVerdict(laneVerdict || node.verdict, playerScoreBriefStatus(node.score));
    const metricSources = Array.isArray(node.metrics) && node.metrics.length
      ? node.metrics : Array.isArray(node.key_metrics) ? node.key_metrics : [];
    const metrics = metricSources.map((metric) => playerScoreMetricReference(model, metric)).filter(Boolean).slice(0, 2);
    return {
      id: node.id || `story-v3-${index}`,
      phase: node.phase || `phase-${index}`,
      start: playerScoreNumber(node.start) ?? 0,
      end: playerScoreNumber(node.end) ?? MATCH_DURATION,
      range: `${formatTime(node.start || 0)}-${formatTime(node.end || MATCH_DURATION)}`,
      title: node.title || PLAYER_SCORE_PHASE_META[node.phase] || "比赛阶段",
      verdict,
      summary: node.summary || "该阶段已有结构化结论，打开证据栏查看来源。",
      metrics,
      time: playerScoreNumber(node.highlight_time ?? node.start) ?? 0,
      confidence: playerScoreNumber(node.confidence) ?? model.confidence,
      module: node.jump_target?.module || module,
      evidenceType: "brief-story",
      evidenceId: node.id || `story-v3-${index}`,
      evidenceRefs: node.evidence_refs || [],
    };
  });
}

function playerScoreBriefLegacyStories(model) {
  const review = laneReviewForSlot(model.hero.slot);
  const position = Number(model.position);
  const supportRole = position >= 4;
  const checkpoints = (review?.checkpoints || []).slice().sort((left, right) => Number(left.time || 0) - Number(right.time || 0));
  const lanePoint = checkpoints.find((point) => Number(point.time) >= 595) || checkpoints.at(-1);
  const laneVerdict = normalizePlayerStoryVerdict(review?.verdict, review ? "even" : "missing");
  const supportRoute = review?.support_route || {};
  const supportOutcome = playerScoreSupportRouteOutcome(supportRoute);
  const laneMetrics = lanePoint ? supportRole ? [
    { label: "辅助经验差", value: signedValue(lanePoint.support_xp_diff) },
    { label: "离线 / 核心阵亡", value: `${formatTime(supportRoute.away_seconds || 0)} / ${Number(supportRoute.core_deaths_away || 0)}` },
  ] : [
    { label: "核心补刀差", value: signedValue(lanePoint.last_hits_diff) },
    { label: "核心等级差", value: lanePoint.level_diff == null ? "--" : signedValue(lanePoint.level_diff, " 级") },
  ] : [
    { label: "补刀 / 反补", value: `${model.hero.lh ?? "--"} / ${model.hero.denies ?? "--"}` },
    { label: "对线置信度", value: review ? `${Number(review.confidence || 0)}%` : "--" },
  ];
  const laneSummary = lanePoint
    ? supportRole
      ? `10 分钟本路核心经验差 ${signedValue(lanePoint.core_xp_diff ?? lanePoint.xp_diff)}；你离线 ${formatTime(supportRoute.away_seconds || 0)}，期间核心阵亡 ${Number(supportRoute.core_deaths_away || 0)} 次，离线收益为${supportOutcome.summary}。`
      : `10 分钟核心补刀差 ${signedValue(lanePoint.last_hits_diff)}，等级差 ${lanePoint.level_diff == null ? "--" : signedValue(lanePoint.level_diff, " 级")}，经验差 ${signedValue(lanePoint.core_xp_diff ?? lanePoint.xp_diff)}。`
    : "当前 Replay 缺少 3 / 5 / 7 / 10 分钟对线检查点，因此不判断线优线劣。";

  const fights = playerScoreFightsForSlot(model.hero.slot).slice().sort((left, right) => Number(left.contact_start ?? left.start) - Number(right.contact_start ?? right.start));
  const midFights = fights.filter((fight) => {
    const time = Number(fight.contact_start ?? fight.start);
    return time >= 600 && time < 1200;
  });
  const midContributions = midFights.map((fight) => ({
    fight,
    contribution: fightContributions(fight).find((row) => Number(row.slot) === Number(model.hero.slot)),
  })).filter((entry) => entry.contribution);
  const midDamage = midContributions.reduce((sum, entry) => sum + Number(entry.contribution.damage || 0), 0);
  const midPresence = midContributions.length
    ? midContributions.reduce((sum, entry) => sum + Number(entry.contribution.presencePct || 0), 0) / midContributions.length : null;
  const midPhase = model.phases.find((phase) => phase.phase === "mid_game")
    || model.phases.find((phase) => Number(phase.start) >= 600 && Number(phase.start) < 1200);
  const midVerdict = midPresence != null && midPresence >= 70 && midFights.length >= 2
    ? "stable" : playerScoreBriefStatus(midPhase?.score);
  const midSummary = midFights.length
    ? `10-20 分钟参与 ${midFights.length} 场有效冲突，已归属伤害 ${midDamage.toLocaleString("zh-CN")}，平均战场存在率 ${midPresence == null ? "--" : `${midPresence.toFixed(0)}%`}。`
    : "10-20 分钟没有足够的个人战斗归属，当前只展示阶段聚合事实。";

  const latePhase = model.phases.find((phase) => phase.phase === "late_game")
    || model.phases.find((phase) => Number(phase.start) >= 1200);
  const post20Diagnostics = supportRole ? [] : farmDiagnosticsForHero(model.hero.slot).filter((diagnostic) => Number(diagnostic.time || 0) >= 1200);
  const reviewableRoutes = post20Diagnostics.filter((diagnostic) => diagnostic.recommendation_enabled && Number(diagnostic.confidence || 0) >= 70);
  const lateFights = fights.filter((fight) => Number(fight.contact_start ?? fight.start) >= 1200);
  const lateWards = supportRole
    ? WARD_RECORDS.filter((ward) => Number(ward.playerSlot) === Number(model.hero.slot) && Number(ward.placedAt || 0) >= 1200)
    : [];
  const lateVerdict = reviewableRoutes.length ? "issue" : playerScoreBriefStatus(latePhase?.score);
  const lateFacts = [];
  if (latePhase?.kills != null || latePhase?.deaths != null || latePhase?.assists != null) {
    lateFacts.push(`阶段 K/D/A ${latePhase.kills ?? "--"}/${latePhase.deaths ?? "--"}/${latePhase.assists ?? "--"}`);
  }
  lateFacts.push(`参与战斗 ${lateFights.length} 场`);
  lateFacts.push(supportRole ? `布置眼位 ${lateWards.length} 个` : `路线复核 ${reviewableRoutes.length} 个`);
  const lateSummary = supportRole
    ? `20 分钟后${lateFacts.join("，")}。辅助位置按战斗职责、目标前视野和团队功能复核，不把核心打钱路线作为主责。`
    : `20 分钟后${lateFacts.join("，")}。${reviewableRoutes.length ? "存在通过视野与路线门禁的替代资源选择。" : "当前没有达到高置信度门槛的路线问题。"}`;

  const firstMidFight = midFights[0];
  const firstLateEvidence = supportRole ? lateFights[0] || lateWards[0] : reviewableRoutes[0] || lateFights[0];
  return [
    {
      id: "story:legacy-lane",
      phase: "laning",
      start: 0,
      end: 600,
      range: "00:00-10:00",
      title: "对线期",
      verdict: laneVerdict,
      summary: laneSummary,
      metrics: laneMetrics,
      time: Number(lanePoint?.time || 600),
      confidence: playerScoreNumber(review?.confidence),
      module: "development",
      evidenceType: lanePoint ? "lane" : "phase",
      evidenceId: lanePoint ? String(lanePoint.time) : model.phases.find((phase) => phase.phase === "laning")?.id,
      evidenceRefs: [],
    },
    {
      id: "story:legacy-mid",
      phase: "mid_game",
      start: 600,
      end: 1200,
      range: "10:00-20:00",
      title: "转线与节奏",
      verdict: midVerdict,
      summary: midSummary,
      metrics: [
        { label: "有效冲突", value: `${midFights.length} 场` },
        { label: "平均在场", value: midPresence == null ? "--" : `${midPresence.toFixed(0)}%` },
      ],
      time: Number(firstMidFight?.contact_start ?? firstMidFight?.start ?? midPhase?.start ?? 600),
      confidence: playerScoreNumber(midPhase?.confidence) ?? model.confidence,
      module: firstMidFight ? "combat" : "timeline",
      evidenceType: firstMidFight ? "combat" : "phase",
      evidenceId: firstMidFight?.id || midPhase?.id,
      evidenceRefs: [],
    },
    {
      id: "story:legacy-late",
      phase: "late_game",
      start: 1200,
      end: MATCH_DURATION,
      range: `20:00-${formatTime(MATCH_DURATION)}`,
      title: "中后期",
      verdict: lateVerdict,
      summary: lateSummary,
      metrics: [
        { label: "战斗片段", value: `${lateFights.length} 场` },
        { label: supportRole ? "20+ 眼位" : "路线复核", value: `${supportRole ? lateWards.length : reviewableRoutes.length} 个` },
      ],
      time: Number(firstLateEvidence?.time ?? firstLateEvidence?.placedAt ?? firstLateEvidence?.contact_start ?? firstLateEvidence?.start ?? latePhase?.start ?? 1200),
      confidence: playerScoreNumber(firstLateEvidence?.confidence) ?? playerScoreNumber(latePhase?.confidence) ?? model.confidence,
      module: supportRole ? lateFights[0] ? "combat" : lateWards[0] ? "vision" : "timeline" : reviewableRoutes[0] ? "farm" : lateFights[0] ? "combat" : "timeline",
      evidenceType: supportRole ? lateFights[0] ? "combat" : lateWards[0] ? "vision" : "phase" : reviewableRoutes[0] ? "farm" : lateFights[0] ? "combat" : "phase",
      evidenceId: reviewableRoutes[0]?.id || lateFights[0]?.id || latePhase?.id,
      evidenceRefs: [],
    },
  ];
}

function playerScoreBriefV3Insights(model, kind) {
  const briefRefs = kind === "strength"
    ? model.report?.brief?.strengths || []
    : model.report?.brief?.priorities || [];
  const allowedKinds = kind === "strength" ? new Set(["strength", "positive"]) : new Set(["improvement", "problem", "priority"]);
  const sources = briefRefs.length
    ? briefRefs.map((ref) => model.rawInsights.find((insight) => String(insight.id) === String(ref))).filter(Boolean)
    : model.rawInsights.filter((insight) => allowedKinds.has(String(insight.kind || "")));
  return sources.filter((insight) => kind === "strength"
    ? Number(insight.confidence || 0) >= 70
    : Number(insight.confidence || 0) >= 55 && (insight.evidence_refs || []).length && insight.time_start != null
  ).slice(0, kind === "strength" ? 2 : 3).map((insight, index) => {
    const jumpTarget = normalizePlayerReportJumpTarget(insight.jump_target);
    return {
      id: insight.id || `${kind}-v3-${index}`,
      kind,
      category: insight.category || "timeline",
      title: insight.title || (kind === "strength" ? "稳定行为" : "优先问题"),
      time: playerScoreNumber(insight.time_start),
      timeEnd: playerScoreNumber(insight.time_end),
      location: insight.location || "",
      fact: insight.fact || "",
      judgment: insight.judgment || "",
      impact: playerScoreImpactText(insight.impact),
      action: insight.action || "",
      confidence: playerScoreNumber(insight.confidence),
      module: jumpTarget.module || playerScoreAdviceModule(insight),
      jumpTarget,
      ordinaryEligible: insight.ordinary_eligible === true,
      localizationLevel: jumpTarget.locationLevel,
      occurrences: normalizePlayerReportInsightOccurrences(insight.occurrences),
      evidenceRefs: insight.evidence_refs || [],
      gateStatus: insight.gate_status || "passed",
      rootCauseId: insight.root_cause_id || null,
      rootCause: model.rootCauseById?.get(String(insight.root_cause_id || "")) || null,
    };
  });
}

function playerScoreBriefLegacyStrengths(model) {
  const strengths = [];
  const review = laneReviewForSlot(model.hero.slot);
  const points = (review?.checkpoints || []).slice().sort((left, right) => Number(left.time || 0) - Number(right.time || 0));
  const first = points[0];
  const best = points.reduce((current, point) => !current || Number(point.score) > Number(current.score) ? point : current, null);
  if (Number(model.position) <= 3 && first && best && Number(best.time) > Number(first.time) && Number(best.score) - Number(first.score) >= 15 && Number(review.confidence || 0) >= 70) {
    strengths.push({
      id: "strength:lane-recovery",
      kind: "strength",
      category: "lane",
      title: "对线中段追回差距",
      time: Number(best.time),
      fact: `${formatTime(first.time)} 到 ${formatTime(best.time)}，线况分从 ${signedValue(first.score)} 回升到 ${signedValue(best.score)}，补刀差变为 ${signedValue(best.last_hits_diff)}。`,
      judgment: "前几分钟的劣势没有继续线性扩大。",
      impact: "为十分钟前保留了继续对线和转线的空间。",
      action: "保持被压制后先稳住经验和补刀，再寻找换血窗口。",
      confidence: Number(review.confidence || 0),
      module: "development",
      evidenceRefs: [],
    });
  }
  const supportRouteStrength = playerScoreSupportLaneStrength(model, review);
  if (supportRouteStrength) strengths.push(supportRouteStrength);
  const midFights = playerScoreFightsForSlot(model.hero.slot).filter((fight) => {
    const time = Number(fight.contact_start ?? fight.start);
    return time >= 600 && time < 1200;
  });
  const contributions = midFights.map((fight) => ({
    fight,
    row: fightContributions(fight).find((item) => Number(item.slot) === Number(model.hero.slot)),
  })).filter((entry) => entry.row);
  const averagePresence = contributions.length
    ? contributions.reduce((sum, entry) => sum + Number(entry.row.presencePct || 0), 0) / contributions.length : 0;
  if (contributions.length >= 2 && averagePresence >= 70) {
    const damage = contributions.reduce((sum, entry) => sum + Number(entry.row.damage || 0), 0);
    strengths.push({
      id: "strength:mid-fight-presence",
      kind: "strength",
      category: "combat",
      title: "中期保持战场参与",
      time: Number(contributions[0].fight.contact_start ?? contributions[0].fight.start),
      fact: `10-20 分钟参与 ${contributions.length} 场有效冲突，平均战场存在率 ${averagePresence.toFixed(0)}%，归属伤害 ${damage.toLocaleString("zh-CN")}。`,
      judgment: "关键转线阶段没有长期脱离队伍行动。",
      impact: "队伍在中期冲突中能够持续获得你的职责贡献。",
      action: "继续保持关键装备完成后及时同步队伍位置。",
      confidence: Math.min(90, Number(model.confidence || 70)),
      module: "combat",
      evidenceRefs: [],
    });
  }
  const wards = WARD_RECORDS.filter((ward) => Number(ward.playerSlot) === Number(model.hero.slot));
  const scored = wards.map((ward) => playerScoreNumber(ward.score)).filter((score) => score != null);
  const wardAverage = scored.length ? scored.reduce((sum, score) => sum + score, 0) / scored.length : null;
  if (wards.length >= 2 && wardAverage != null && wardAverage >= 60 && strengths.length < 2) {
    strengths.push({
      id: "strength:vision-lifecycle",
      kind: "strength",
      category: "vision",
      title: "眼位生命周期有效",
      time: Number(wards[0].placedAt || 0),
      fact: `本场放置 ${wards.length} 个眼位，平均评分 ${wardAverage.toFixed(0)}，累计发现敌方 ${wards.reduce((sum, ward) => sum + Number(ward.detections || 0), 0)} 次。`,
      judgment: "视野投入产生了可确认的信息收益。",
      impact: "为队伍进入区域和判断敌方动向提供信息。",
      action: "继续在目标刷新前布置可长期存活的入口视野。",
      confidence: 75,
      module: "vision",
      evidenceRefs: [],
    });
  }
  return strengths.slice(0, 2);
}

function playerScoreRoleTraining(position) {
  return {
    1: { id: "training:role-carry", trigger: "20 分钟后准备处理越河兵线时", action: "先确认两名敌方核心的位置和最近消失时间", successCheck: "没有信息时改收己方半区资源" },
    2: { id: "training:role-mid", trigger: "清完中路兵线且下一波神符小于 45 秒时", action: "保留移动和技能资源向一侧符点靠近", successCheck: "神符刷新时已经占据一侧河道" },
    3: { id: "training:role-offlane", trigger: "跳刀或首件先手装完成后", action: "先与一名能跟伤害的队友同步位置再开战", successCheck: "先手后 3 秒内至少一名队友进入战场" },
    4: { id: "training:role-roamer", trigger: "离开线上超过 20 秒时", action: "确保路线至少创造控符、叠野、视野或有效支援其中一项", successCheck: "离线收益可以在时间线中确认" },
    5: { id: "training:role-support", trigger: "关键目标刷新前 60 秒", action: "先布置观察守卫并携带反隐", successCheck: "开战前团队能够确认至少一个入口" },
  }[Number(position)] || { id: "training:role-review", trigger: "进入下一段比赛阶段前", action: "先确认当前职责和队友位置", successCheck: "行动与当前职责保持一致" };
}

function playerScoreSupportRouteOutcome(route = {}) {
  const rows = [
    ["控符", Number(route.runes || 0)],
    ["叠野", Number(route.stacks || 0)],
    ["视野", Number(route.wards || 0)],
    ["离线助攻", Number(route.away_assists || 0)],
    ["离线击杀", Number(route.away_kills || 0)],
  ];
  const visible = rows.filter(([, value]) => value > 0);
  return {
    count: visible.reduce((sum, [, value]) => sum + value, 0),
    summary: visible.length ? visible.map(([label, value]) => `${label} ${value}`).join("、") : "未记录控符、叠野、视野或离线击杀助攻",
  };
}

function playerScoreSupportLaneStrength(model, review) {
  const position = Number(model.position);
  if (position < 4 || !review || Number(review.confidence || 0) < 70) return null;
  const route = review.support_route || {};
  const awaySeconds = Number(route.away_seconds || 0);
  const coreDeathsAway = Number(route.core_deaths_away || 0);
  const outcome = playerScoreSupportRouteOutcome(route);
  if (awaySeconds < 30 || coreDeathsAway > 0 || outcome.count < 2) return null;
  const corePosition = position === 4 ? 3 : 1;
  return {
    id: `strength:support-route-${model.hero.slot}`,
    kind: "strength",
    category: "lane_support_route",
    title: position === 4 ? "游走创造有效收益" : "离线同时保住核心",
    time: 600,
    fact: `前 10 分钟离线 ${formatTime(awaySeconds)}，完成${outcome.summary}；${corePosition}号位在你离线期间没有阵亡。`,
    judgment: "这段离线同时满足了可确认收益和核心安全两项条件。",
    impact: "队伍获得了额外地图收益，且没有用核心发育作为代价。",
    action: position === 4 ? "保持每次长离线都有控符、叠野、视野或有效支援目标。" : "保持离线前确认兵线、补给和核心退路。",
    confidence: Number(review.confidence || 0),
    module: "development",
    evidenceRefs: [],
  };
}

function playerScoreLanePriority(model, review, point) {
  if (!review || review.verdict !== "disadvantage" || Number(review.confidence || 0) < 70 || !point) return null;
  const position = Number(model.position);
  const route = review.support_route || {};
  const location = review.lane ? regionName(review.lane) : "";

  if (position >= 4) {
    const awaySeconds = Number(route.away_seconds || 0);
    const coreDeathsAway = Number(route.core_deaths_away || 0);
    const outcome = playerScoreSupportRouteOutcome(route);
    if (coreDeathsAway <= 0 && !(awaySeconds >= 60 && outcome.count === 0)) return null;
    const corePosition = position === 4 ? 3 : 1;
    return {
      id: `priority:lane-support-route-${model.hero.slot}`,
      kind: "improvement",
      category: "lane_support_route",
      title: coreDeathsAway > 0 ? "离线收益未覆盖线上代价" : "离线缺少可确认收益",
      time: Number(point.time || 600),
      location,
      fact: `前 10 分钟离线 ${formatTime(awaySeconds)}，期间${corePosition}号位阵亡 ${coreDeathsAway} 次；离线收益为${outcome.summary}。`,
      judgment: coreDeathsAway > 0
        ? "离线本身不是问题，但这次离线的地图收益没有覆盖核心被双人施压和阵亡的代价。"
        : "长时间离线没有形成可确认收益，线路职责和游走目标没有完成交换。",
      impact: `${corePosition}号位 10 分钟经验差 ${signedValue(point.core_xp_diff ?? point.xp_diff)}，队伍进入转线期时的核心等级窗口受到影响。`,
      action: position === 4
        ? "离开3号位前确认他能在塔前安全接线；敌方双人仍在线时，游走必须有控符、击杀或TP支援目标，否则缩短离线。"
        : "离开1号位拉野或做视野前确认兵线、补给和退路；敌方双人持续压线时，完成动作后立即回线保护。",
      confidence: Number(review.confidence || 0),
      module: "development",
      evidenceRefs: [],
      gateStatus: "passed",
    };
  }

  const supportCost = Number(route.core_deaths_away || 0);
  const coreLabel = position === 2 ? "中路" : position === 1 ? "1号位" : "3号位";
  const action = position === 2
    ? "中路等级落后时先保经验并控稳兵线，等技能等级或神符窗口再主动换血。"
    : position === 1
      ? "5号位离线时减少越线换血，先保经验区和塔下兵；敌方双人压线就提前请求回线。"
      : "4号位离线时优先保持血量和经验，敌方双人越线才退到塔前并提前沟通回线。";
  return {
    id: `priority:lane-core-experience-${model.hero.slot}`,
    kind: "improvement",
    category: "lane_core",
    title: position === 2 ? "中路等级窗口开始落后" : "辅助离线时先稳住兵线",
    time: Number(point.time || 600),
    location,
    fact: `10 分钟${coreLabel}补刀差 ${signedValue(point.last_hits_diff)}，等级差 ${point.level_diff == null ? "--" : signedValue(point.level_diff, " 级")}、经验差 ${signedValue(point.core_xp_diff ?? point.xp_diff)}${supportCost ? `；辅助离线期间阵亡 ${supportCost} 次` : ""}。`,
    judgment: position === 2
      ? "中路等级与经验窗口落后时，继续强换血会进一步压缩第一轮神符和支援节奏。"
      : "辅助离线期间仍然越线争夺，会把可控的经验劣势放大为血量或阵亡损失。",
    impact: "进入第一轮转线和战斗时，技能等级与属性窗口会被压缩。",
    action,
    confidence: Number(review.confidence || 0),
    module: "development",
    evidenceRefs: [],
    gateStatus: "passed",
  };
}

function playerScoreCombatDutyAction(position) {
  return {
    1: "进入战场前确认 BKB、主要输出技能和安全输出目标，先保证持续输出时间。",
    2: "进场前先确定第一目标和撤离方向，把爆发技能集中到可完成减员的目标。",
    3: "先手前确认至少一名队友能在 3 秒内跟进，再交关键控制和承伤资源。",
    4: "根据阵容明确先手或反手职责，保留第一轮控制给关键核心或救援窗口。",
    5: "站在核心可支援范围内，优先完成救人、反手控制和关键功能物品释放。",
  }[Number(position)] || "进入战斗前确认自己的主要职责和技能目标。";
}

function playerScoreCombatDutySuccess(position) {
  return Number(position) <= 2 ? "有效接触中完成主要输出窗口且关键技能有明确目标"
    : Number(position) === 3 ? "先手后 3 秒内有队友跟进并形成有效控制或减员"
      : Number(position) === 4 ? "首轮控制或救援命中关键目标"
        : "核心受到先手时完成至少一次可确认的救援或反手";
}

function playerScoreTrainingFromPriority(model, priority, index) {
  const category = String(priority.category || "");
  const position = Number(model.position);
  if (category.includes("lane_support")) {
    const corePosition = position === 4 ? 3 : 1;
    return {
      id: `training:${priority.id || index}`,
      trigger: position === 4 ? "准备离开3号位超过20秒时" : "准备离开1号位拉野、插眼或支援时",
      action: priority.action,
      successCheck: `离线期间${corePosition}号位 0 次阵亡，且每次长离线至少产生一项可确认收益`,
    };
  }
  if (category.includes("lane")) {
    return {
      id: `training:${priority.id || index}`,
      trigger: position === 2 ? "中路等级或经验差开始扩大时" : "辅助离线且敌方双人仍在线时",
      action: priority.action,
      successCheck: position === 2 ? "下一检查点等级差或经验差不再扩大" : "下一检查点核心经验差不再扩大，且辅助离线期间不再阵亡",
    };
  }
  if (category.includes("farm")) {
    return {
      id: `training:${priority.id || index}`,
      trigger: "进入下一轮资源循环前",
      action: priority.action,
      successCheck: "实际路线通过视野、敌方威胁和队友资源三项门禁",
    };
  }
  if (category.includes("combat")) {
    return {
      id: `training:${priority.id || index}`,
      trigger: "进入下一场有效战斗前",
      action: priority.action,
      successCheck: playerScoreCombatDutySuccess(position),
    };
  }
  return {
    id: `training:${priority.id || index}`,
    trigger: "相同场景再次出现时",
    action: priority.action,
    successCheck: "对应证据可以在时间线中确认",
  };
}

function playerScoreBriefLegacyPriorities(model) {
  const priorities = [];
  const review = laneReviewForSlot(model.hero.slot);
  const point = (review?.checkpoints || []).slice().sort((left, right) => Number(right.time || 0) - Number(left.time || 0))[0];
  const lanePriority = playerScoreLanePriority(model, review, point);
  if (lanePriority) priorities.push(lanePriority);
  const diagnostic = Number(model.position) <= 3
    ? farmDiagnosticsForHero(model.hero.slot)
      .filter((item) => item.recommendation_enabled && Number(item.confidence || 0) >= 70)
      .sort((left, right) => Number(right.time || 0) - Number(left.time || 0))[0]
    : null;
  if (diagnostic) {
    const actualGold = Number(diagnostic.actualGold || 0);
    const suggestedGold = Number(diagnostic.suggestedGold || 0);
    priorities.push({
      id: `priority:${diagnostic.id}`,
      kind: "improvement",
      category: "farm_route",
      title: "资源循环存在更优选择",
      time: Number(diagnostic.time || 0),
      location: diagnostic.region ? regionName(diagnostic.region) : "",
      fact: `${formatTime(diagnostic.time)} 实际选择${farmOptionName(diagnostic.actual)}，收益 ${actualGold} 金；通过门禁的候选是${farmOptionName(diagnostic.recommendation)}，约 ${suggestedGold} 金。`,
      judgment: diagnostic.reason || "当时存在收益更高且风险门禁通过的资源路线。",
      impact: suggestedGold > actualGold ? `该窗口预计少转化约 ${suggestedGold - actualGold} 金。` : "该窗口的移动和资源衔接值得复核。",
      action: `在相同视野与队友资源条件下，优先衔接${farmOptionName(diagnostic.recommendation)}。`,
      confidence: Number(diagnostic.confidence || 0),
      module: "farm",
      evidenceRefs: [],
      gateStatus: "passed",
    });
  }
  const combatIssue = playerScoreFightsForSlot(model.hero.slot).map((fight) => ({
    fight,
    row: fightContributions(fight).find((item) => Number(item.slot) === Number(model.hero.slot)),
  })).find((entry) => entry.row?.responsibility_gate?.status === "passed" && Number(entry.row.responsibilityScore || 0) < 55);
  if (combatIssue) {
    const time = Number(combatIssue.fight.contact_start ?? combatIssue.fight.start);
    priorities.push({
      id: `priority:${combatIssue.fight.id}`,
      kind: "improvement",
      category: "combat_duty",
      title: "有效战斗中的职责完成不足",
      time,
      location: combatIssue.fight.location || "",
      fact: `${formatTime(time)} 的${combatIssue.fight.title}中，在场率 ${Number(combatIssue.row.presencePct || 0)}%，伤害 ${Number(combatIssue.row.damage || 0).toLocaleString("zh-CN")}，控制 ${Number(combatIssue.row.controlSeconds || 0).toFixed(1)} 秒。`,
      judgment: "该片段已通过技能、距离和战场机会门禁，个人职责结果仍低于本场目标区间。",
      impact: "队伍在这次有效接触中没有获得完整的角色职责产出。",
      action: playerScoreCombatDutyAction(model.position),
      confidence: Number(combatIssue.row.confidence || model.confidence || 70),
      module: "combat",
      evidenceRefs: [],
      gateStatus: "passed",
    });
  }
  return priorities.slice(0, 3);
}

function playerScoreBriefTraining(model, priorities, strengths) {
  const refs = Array.isArray(model.report?.brief?.training_plan) ? model.report.brief.training_plan : [];
  const v3 = refs.length
    ? refs.map((ref) => model.trainingPlan.find((item) => String(item.id) === String(ref))).filter(Boolean).slice(0, 3)
    : Array.isArray(model.trainingPlan) ? model.trainingPlan.filter(Boolean).slice(0, 3) : [];
  if (v3.length) return v3.map((item, index) => ({
    id: item.id || `training-v3-${index}`,
    trigger: item.trigger || "触发条件待补",
    action: item.action || "",
    successCheck: item.success_check || item.successCheck || "",
    sourceInsights: Array.isArray(item.source_insights) ? item.source_insights : [],
  }));
  const plans = priorities.map((priority, index) => playerScoreTrainingFromPriority(model, priority, index))
    .filter((plan) => plan.action);
  if (plans.length < 3) plans.push(playerScoreRoleTraining(model.position));
  if (strengths[0] && plans.length < 3) {
    plans.push({
      id: `training:keep-${strengths[0].id}`,
      trigger: "相同优势窗口再次出现时",
      action: strengths[0].action,
      successCheck: "继续产生同类可确认的正向证据",
    });
  }
  return [...new Map(plans.map((plan) => [plan.action, plan])).values()].slice(0, 3);
}

function playerScoreBriefVerdict(model, stories) {
  if (model.report?.brief?.verdict) return String(model.report.brief.verdict);
  const phrase = (story) => {
    const meta = PLAYER_SCORE_BRIEF_VERDICT_META[story?.verdict] || PLAYER_SCORE_BRIEF_VERDICT_META.missing;
    return `${story?.title || "阶段"}${meta.label}`;
  };
  const text = `${phrase(stories[0])}，${phrase(stories[1])}；${phrase(stories[2])}。`;
  return text.length <= 90 ? text : `${text.slice(0, 89).replace(/[，；。]+$/u, "")}。`;
}

function playerScoreBriefStoryImpact(story) {
  return {
    advantage: "这段为后续转线、发育或接战创造了领先窗口。",
    stable: "这段基本完成了该位置在当前阶段的主要任务。",
    even: "这段没有明显拉开差距，也没有形成可以确认的劣势。",
    disadvantage: "这段压缩了后续发育或接战空间，值得优先复盘。",
    issue: "这段出现了可以确认的改进点，是本场优先复盘阶段。",
    missing: "数据不完整，本段只展示已经记录的事实，不判断对错。",
  }[story.verdict] || "这段的影响需要结合对应时间点继续复盘。";
}

function playerScoreBriefStoryAction(model, story) {
  const position = Number(model.position);
  const actions = {
    laning: {
      1: "先稳住经验区和能安全补到的兵，再用血量换补刀。",
      2: "优先保证等级与神符窗口，再决定换血或支援。",
      3: "4号位离线时先保血量和经验，队友回线后再主动施压。",
      4: "离线前确认3号位能安全接线，并设定控符、叠野或支援目标。",
      5: "离开1号位前确认兵线、补给和退路，动作完成后及时回线。",
    },
    mid_game: {
      1: "清完安全兵线再衔接野区，关键战斗前提前靠近队伍。",
      2: "清线后围绕神符、边塔和第一件节奏装安排下一步。",
      3: "先手装完成后先同步一名能跟伤害的队友再开战。",
      4: "围绕节奏核心移动，把视野、先手和支援连成一次行动。",
      5: "目标前先布入口视野并保留救人技能，避免无效露头。",
    },
    late_game: {
      1: "每轮刷钱前确认敌方核心位置、下一目标和退路，再选路线。",
      2: "在带线与参战之间预留TP或位移，不让队伍先少人接战。",
      3: "用危险线和先手压力换空间，开战前确认后排能够跟上。",
      4: "先确认开团与救人职责，把关键技能留给最有价值的目标。",
      5: "目标刷新前先布眼、带反隐，并和队友一起占住入口。",
    },
  };
  return actions[story.phase]?.[position] || playerScoreRoleTraining(position).action;
}

function playerScoreBriefStoryNarratives(model, stories, strengths, priorities) {
  return stories.map((story) => {
    const start = Number(story.start || 0);
    const end = Number(story.end ?? MATCH_DURATION);
    const inStory = (item) => item?.time != null && Number(item.time) >= start && Number(item.time) <= end;
    const priority = priorities.find(inStory);
    const strength = strengths.find(inStory);
    const issue = story.verdict === "issue" || story.verdict === "disadvantage";
    const insight = issue ? priority || strength : strength || priority;
    return {
      ...story,
      title: simplifyPlayerReportText(story.title)
        .replace(/^(?:10-20分钟|20分钟后)\s*·\s*/u, ""),
      summary: simplifyPlayerReportText(story.summary),
      impact: simplifyPlayerReportText(insight?.impact || insight?.judgment || playerScoreBriefStoryImpact(story)),
      nextAction: simplifyPlayerReportText(insight?.action || playerScoreBriefStoryAction(model, story)),
    };
  });
}

function playerScoreBriefModel(model) {
  const nativeReport = model.model === "player-report/4.0"
    || model.model === "player-report/3.0";
  const stories = playerScoreBriefV3Stories(model);
  const resolvedStories = nativeReport ? stories : stories.length ? stories : playerScoreBriefLegacyStories(model);
  const v3Strengths = playerScoreBriefV3Insights(model, "strength");
  const strengths = nativeReport ? v3Strengths : v3Strengths.length ? v3Strengths : playerScoreBriefLegacyStrengths(model);
  const v3Priorities = playerScoreBriefV3Insights(model, "improvement");
  const priorities = nativeReport ? v3Priorities : v3Priorities.length ? v3Priorities : playerScoreBriefLegacyPriorities(model);
  const training = playerScoreBriefTraining(model, priorities, strengths);
  const focus = model.report?.brief?.next_match_focus || training[0]?.action || playerScoreRoleTraining(model.position).action;
  const narratedStories = playerScoreBriefStoryNarratives(model, resolvedStories, strengths, priorities);
  return {
    verdict: playerScoreBriefVerdict(model, resolvedStories),
    focus,
    domains: playerScoreBriefDomains(model),
    stories: narratedStories,
    strengths,
    priorities,
    training,
    source: model.model === "player-report/4.0" ? "v4" : nativeReport ? "v3" : "compat",
    localizationStrict: model.report?.localization_model === "player-report-localization/1.0",
  };
}

function renderPlayerScoreHeader(model) {
  const root = document.querySelector("#player-score-header");
  const hero = model.hero;
  const opponent = safeHero(model.counterpartSlot);
  const match = state.currentAnalysis?.match || {};
  const briefMode = state.playerScoreMode !== "deep";
  const briefPriority = model.brief.priorities[0] || null;
  const evidence = playerScoreEvidenceLevel(model.evidenceLevel);
  const confidence = model.confidence == null ? "--" : `${Math.round(model.confidence)}%`;
  const score = model.canShowOverall ? Math.round(model.overallScore) : "--";
  const grade = model.grade || (model.hasReport ? "证据不足" : "待生成");
  const resultKnown = typeof match.radiant_win === "boolean";
  const won = resultKnown ? (hero.team === "radiant") === match.radiant_win : null;
  root.innerHTML = `
    <div class="player-score-identity">
      <img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}">
      <span><small>${hero.team === "radiant" ? "天辉" : "夜魇"}${won == null ? "" : won ? " · 胜利" : " · 失败"}${hero.me ? " · 我" : ""}</small><strong>${escapeHtml(hero.name)} · ${escapeHtml(hero.player)}</strong><em>${escapeHtml(model.role.label)}${briefMode ? "" : ` · 角色置信度 ${model.roleConfidence == null ? "--" : `${Math.round(model.roleConfidence)}%`}`}</em></span>
    </div>
    <button class="player-score-counterpart" type="button" data-player-score-slot="${opponent.slot}" title="切换到对位玩家">
      <span><small>主要对位</small><strong>${escapeHtml(opponent.name)}</strong><em>${positionLabel(opponent.position)}</em></span><img src="${heroImage(opponent.token)}" alt="${escapeHtml(opponent.name)}"><i data-lucide="arrow-left-right"></i>
    </button>
    <div class="player-score-headline"><small>${briefMode ? "本场一句话" : model.legacy ? "兼容旧报告 · 只输出有证据的行为结论" : "player-report/4.0 · 本场结论"}</small><strong>${escapeHtml(briefMode ? simplifyPlayerReportText(model.brief.verdict) : model.brief.verdict)}</strong><em>${briefMode ? briefPriority ? "优先改进" : "下局重点" : "下一局"}：${escapeHtml(briefMode ? simplifyPlayerReportText(briefPriority?.title || model.brief.focus) : model.brief.focus)}</em></div>
    <div class="player-score-summary">
      <button class="player-score-overall" type="button" data-player-score-evidence-type="score-audit" data-player-score-evidence-id="overall" title="查看综合分可重算审计"><small>综合分</small><strong>${score}</strong><b>${escapeHtml(grade)}</b><i data-lucide="chevron-right"></i></button>
      <span><small>${briefMode ? "报告可信度" : "置信度"}</small><strong>${confidence}</strong></span>
      <span><small>${briefMode ? "数据基础" : "证据"}</small><strong class="${evidence.className}">${evidence.label}</strong></span>
    </div>`;
  installImageFallback(root, heroImage("unknown"));
  refreshIcons(root);
}

function renderPlayerScoreRoster() {
  const filter = state.playerScoreRosterFilter;
  let heroes = HEROES.filter((hero) => filter === "all"
    || filter === "me" && hero.me
    || filter === "core" && Number(hero.position) <= 3
    || filter === "support" && Number(hero.position) >= 4);
  if (!heroes.some((hero) => hero.slot === state.selectedHeroSlot)) heroes = [safeHero(state.selectedHeroSlot), ...heroes];
  document.querySelector("#player-score-roster-count").textContent = `${heroes.length} 人`;
  document.querySelectorAll("#player-score-roster-filter [data-player-score-roster-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerScoreRosterFilter === filter);
  });
  const root = document.querySelector("#player-score-roster");
  root.innerHTML = heroes.map((hero) => {
    const model = playerScoreModel(hero, { buildBrief: false });
    const score = model.canShowOverall ? Math.round(model.overallScore) : "--";
    const grade = model.grade || "-";
    return `<button class="player-score-roster-row ${hero.slot === state.selectedHeroSlot ? "active" : ""} ${hero.me ? "me" : ""}" type="button" data-player-score-slot="${hero.slot}" title="${escapeHtml(hero.player)} · ${escapeHtml(hero.name)} · ${positionLabel(hero.position)}">
      <img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}"><span><strong>${escapeHtml(hero.player)}${hero.me ? " · 我" : ""}</strong><small>${escapeHtml(hero.name)} · ${positionLabel(hero.position)}</small><em>${hero.kills}/${hero.deaths}/${hero.assists} · ${hero.lh}/${hero.denies}</em></span><b>${score}<small>${escapeHtml(grade)}</small></b>
    </button>`;
  }).join("") || `<div class="player-score-data-gap"><i data-lucide="users"></i><strong>该筛选没有玩家</strong></div>`;
  installImageFallback(root, heroImage("unknown"));
  refreshIcons(root);
}

function playerScoreDimensionHtml(dimension) {
  const active = state.selectedPlayerScoreEvidence?.type === "dimension" && state.selectedPlayerScoreEvidence.id === dimension.key;
  const score = dimension.score == null ? "--" : Math.round(dimension.score);
  const confidence = dimension.confidence == null ? "待补证据" : `置信度 ${Math.round(dimension.confidence)}%`;
  const scoreTrail = dimension.baseScore == null
    ? confidence
    : `基础 ${Math.round(dimension.baseScore)} · 修正 ${signedValue(dimension.behaviorModifier || 0)} · ${confidence}`;
  return `<button class="player-score-dimension ${dimension.status} ${active ? "active" : ""}" type="button" data-player-score-evidence-type="dimension" data-player-score-evidence-id="${dimension.key}">
    <span class="player-score-dimension-name"><i data-lucide="${dimension.icon}"></i><span><strong>${dimension.label}</strong><small>位置权重 ${dimension.roleWeight}% · ${scoreTrail}</small></span></span>
    <span class="player-score-dimension-meter ${dimension.score == null ? "missing" : ""}"><i style="width:${dimension.score == null ? 0 : clamp(dimension.score, 0, 100)}%"></i></span>
    <b>${score}</b>
  </button>`;
}

function renderPlayerScoreOverview(model) {
  const phaseHtml = model.phases.length ? model.phases.map((phase) => {
    const score = phase.score == null ? "--" : Math.round(phase.score);
    const range = `${Math.floor(Number(phase.start || 0) / 60)}-${Math.ceil(Number(phase.end || 0) / 60)}分`;
    return `<button class="player-score-phase" type="button" data-player-score-evidence-type="phase" data-player-score-evidence-id="${escapeHtml(phase.id)}" data-player-score-time="${phase.start}"><span><small>${range}</small><strong>${PLAYER_SCORE_PHASE_SHORT_META[phase.phase] || escapeHtml(phase.phase || "阶段")}</strong></span><b>${score}</b></button>`;
  }).join("") : `<div class="player-score-data-gap compact"><span>阶段评分尚未生成</span></div>`;
  const strengths = model.brief.strengths.length ? model.brief.strengths.map((strength) => `<button class="player-score-strength" type="button" data-player-score-evidence-type="brief-insight" data-player-score-evidence-id="${escapeHtml(strength.id)}" data-player-score-time="${Number(strength.time || 0)}"><i data-lucide="circle-check"></i><span><strong>${escapeHtml(strength.title)}</strong><small>${strength.time == null ? "Replay 正向证据" : `${formatTime(strength.time)} · 置信度 ${Math.round(Number(strength.confidence || 0))}%`}</small></span></button>`).join("")
    : `<div class="player-score-data-gap compact"><span>稳定优势需要更多证据</span></div>`;
  const advice = model.brief.priorities.length ? model.brief.priorities.map((item, index) => {
    const time = item.time == null ? "时间待补" : item.timeEnd == null ? formatTime(item.time) : `${formatTime(item.time)}-${formatTime(item.timeEnd)}`;
    const active = state.selectedPlayerScoreEvidence?.type === "brief-insight" && state.selectedPlayerScoreEvidence.id === item.id;
    return `<button class="player-score-advice ${item.severity || "review"} ${active ? "active" : ""}" type="button" data-player-score-evidence-type="brief-insight" data-player-score-evidence-id="${escapeHtml(item.id)}" data-player-score-time="${Number(item.time || 0)}"><span class="player-score-advice-index">${index + 1}</span><span><small>${time} · ${item.confidence == null ? "置信度待补" : `${Math.round(item.confidence)}%`}</small><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.action || item.judgment)}</em></span><i data-lucide="chevron-right"></i></button>`;
  }).join("") : `<div class="player-score-data-gap compact"><span>本场没有达到高置信度门槛的行为问题</span></div>`;
  return `<div class="player-score-overview">
    <section class="player-score-dimension-board"><header><span><small>十项公共维度</small><strong>${escapeHtml(model.role.label)}权重</strong></span><em>缺失指标不按 0 分</em></header><div class="player-score-dimension-grid">${model.dimensions.map(playerScoreDimensionHtml).join("")}</div></section>
    <section class="player-score-priority-board"><header><span><small>下一局训练重点</small><strong>稳定项与优先复核</strong></span><em>最多三条建议</em></header><div class="player-score-strength-list">${strengths}</div><div class="player-score-advice-list">${advice}</div></section>
    <section class="player-score-phase-board"><header><span><small>固定检查点 + 动态阶段</small><strong>分阶段表现</strong></span></header><div>${phaseHtml}</div></section>
  </div>`;
}

function renderPlayerScoreBrief(model) {
  const brief = model.brief;
  const ordinary = selectOrdinaryPlayerReportContent(brief);
  const training = ordinary.training || playerScoreRoleTraining(model.position);
  const domainHtml = brief.domains.map((domain) => {
    const score = domain.score == null ? "--" : Math.round(domain.score);
    const tone = domain.score == null ? "missing" : domain.score >= 68 ? "positive" : domain.score < 52 ? "negative" : "stable";
    const summary = domain.score == null ? "暂无结论" : domain.score >= 68 ? "本场强项" : domain.score < 52 ? "需要关注" : "基本稳定";
    return `<button class="player-score-brief-domain ${tone}" type="button" data-player-score-open-dimension="${escapeHtml(domain.keys[0])}" title="在深度分析中查看${escapeHtml(domain.label)}"><span><i data-lucide="${domain.icon}"></i>${escapeHtml(domain.label)}</span><strong>${score}</strong><small>${summary}</small></button>`;
  }).join("");
  const storyHtml = ordinary.stories.map((story, index) => {
    const meta = PLAYER_SCORE_BRIEF_VERDICT_META[story.verdict] || PLAYER_SCORE_BRIEF_VERDICT_META.missing;
    const metrics = (story.metrics || []).slice(0, 2).map((metric) => `<span><small>${escapeHtml(simplifyPlayerReportText(metric.label || "关键指标"))}</small><strong>${escapeHtml(metric.value ?? "--")}</strong></span>`).join("");
    return `<article class="player-score-story-row ${meta.className}">
      <button class="player-score-story-main" type="button" data-player-score-evidence-type="brief-story" data-player-score-evidence-id="${escapeHtml(story.id)}" data-player-score-time="${Number(story.time || 0)}">
        <span class="player-score-story-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="player-score-story-copy">
          <small>${escapeHtml(story.range)} · <b>${meta.label}</b></small>
          <strong>${escapeHtml(story.title)}</strong>
          <em title="${escapeHtml(story.summary)}"><b>发生了什么</b>${escapeHtml(story.summary)}</em>
          <span class="player-score-story-takeaways">
            <span class="player-score-story-takeaway"><b>影响</b><span title="${escapeHtml(story.impact)}">${escapeHtml(story.impact)}</span></span>
            <span class="player-score-story-takeaway action"><b>下次关注</b><span title="${escapeHtml(story.nextAction)}">${escapeHtml(story.nextAction)}</span></span>
          </span>
        </span>
        <span class="player-score-story-metrics">${metrics}</span>
      </button>
      <button class="icon-button quiet player-score-story-jump" type="button" data-player-score-jump="${escapeHtml(story.module)}" data-player-score-time="${Number(story.time || 0)}" title="查看对应片段"><i data-lucide="arrow-up-right"></i></button>
    </article>`;
  }).join("");
  const reviewMeta = (insight) => {
    const target = insight.jumpTarget || normalizePlayerReportJumpTarget({});
    const range = target.rangeStart == null
      ? insight.time == null ? "时间待补" : formatTime(insight.time)
      : target.rangeEnd != null && target.rangeEnd !== target.rangeStart
        ? `${formatTime(target.rangeStart)}-${formatTime(target.rangeEnd)}`
        : formatTime(target.rangeStart);
    const location = insight.location
      || (target.mapFocus?.region ? regionName(target.mapFocus.region) : "");
    return location ? `${range} · ${location}` : range;
  };
  const occurrenceHtml = (insight) => {
    const occurrences = (insight.occurrences || []).slice(0, 3);
    if (!occurrences.length) return "";
    const buttons = occurrences.map((occurrence, index) => {
      const delta = occurrence.arrivalDeltaSeconds == null
        ? ""
        : `${occurrence.arrivalDeltaSeconds >= 0 ? "+" : ""}${occurrence.arrivalDeltaSeconds}秒`;
      const label = occurrence.label || [
        occurrence.time == null ? "" : formatTime(occurrence.time),
        occurrence.region ? regionName(occurrence.region) : "",
        delta,
      ].filter(Boolean).join(" ");
      return `<button type="button" data-player-score-review-occurrence="${escapeHtml(insight.id)}" data-player-score-occurrence-index="${index}" title="复盘 ${escapeHtml(label)}"><i data-lucide="map-pin"></i><span>${escapeHtml(label || `发生点 ${index + 1}`)}</span></button>`;
    }).join("");
    return `<div class="player-score-insight-occurrences"><small>具体发生点</small><div>${buttons}</div></div>`;
  };
  const strengthHtml = ordinary.strength ? `<article class="player-score-brief-insight strength">
    <button class="player-score-insight-review" type="button" data-player-score-review="${escapeHtml(ordinary.strength.id)}"><i data-lucide="circle-check"></i><span><small>${escapeHtml(reviewMeta(ordinary.strength))}</small><strong>${escapeHtml(simplifyPlayerReportText(ordinary.strength.title))}</strong><em>${escapeHtml(simplifyPlayerReportText(ordinary.strength.fact))}</em><b>带来的结果：${escapeHtml(simplifyPlayerReportText(ordinary.strength.impact || ordinary.strength.judgment))}</b></span><span class="player-score-review-command">查看这一波<i data-lucide="arrow-up-right"></i></span></button>
    <button class="text-command" type="button" data-player-score-evidence-type="brief-insight" data-player-score-evidence-id="${escapeHtml(ordinary.strength.id)}" data-player-score-time="${Number(ordinary.strength.time || 0)}">查看评分依据</button>
    ${occurrenceHtml(ordinary.strength)}
  </article>` : `<div class="player-score-brief-empty"><i data-lucide="circle-dashed"></i><span><strong>这场还没有足够明确的个人优点</strong><small>不会只按比赛胜负或最高分自动补写优点。</small></span></div>`;
  const priorityHtml = ordinary.priority ? `<article class="player-score-brief-insight priority">
    <button class="player-score-insight-review" type="button" data-player-score-review="${escapeHtml(ordinary.priority.id)}"><span class="player-score-priority-number">1</span><span><small>${escapeHtml(reviewMeta(ordinary.priority))}</small><strong>${escapeHtml(simplifyPlayerReportText(ordinary.priority.title))}</strong><em>${escapeHtml(simplifyPlayerReportText(ordinary.priority.fact))}</em><b>造成的影响：${escapeHtml(simplifyPlayerReportText(ordinary.priority.impact || ordinary.priority.judgment))}</b><b>怎么改：${escapeHtml(simplifyPlayerReportText(ordinary.priority.action))}</b></span><span class="player-score-review-command">查看这一波<i data-lucide="arrow-up-right"></i></span></button>
    <button class="text-command" type="button" data-player-score-evidence-type="brief-insight" data-player-score-evidence-id="${escapeHtml(ordinary.priority.id)}" data-player-score-time="${Number(ordinary.priority.time || 0)}">查看评分依据</button>
    ${occurrenceHtml(ordinary.priority)}
  </article>` : `<div class="player-score-brief-empty"><i data-lucide="shield-check"></i><span><strong>没有可以确定归责的主要问题</strong><small>分数较低不等于出现了明确失误。</small></span></div>`;
  return `<div class="player-score-brief">
    <header class="player-score-brief-lead">
      <div class="player-score-brief-verdict"><span><i data-lucide="target"></i>下一局只练一件事</span><h2>${escapeHtml(simplifyPlayerReportText(training.action || brief.focus))}</h2><p><b>完成标准</b>${escapeHtml(simplifyPlayerReportText(training.successCheck || "下一局可以在相同场景中复核"))}</p></div>
      <div class="player-score-brief-domains">${domainHtml}</div>
    </header>
    <div class="player-score-brief-columns">
      <section class="player-score-story-board">
        <header><span><small>按时间看清关键变化</small><strong>三个关键时刻</strong></span><em>${ordinary.stories.length} 个阶段</em></header>
        <div>${storyHtml}</div>
      </section>
      <div class="player-score-brief-review">
        <section class="player-score-brief-section strengths"><header><span><small>本场最值得保留</small><strong>做得好</strong></span></header><div>${strengthHtml}</div></section>
        <section class="player-score-brief-section priorities"><header><span><small>本场优先改一件</small><strong>主要问题</strong></span></header><div>${priorityHtml}</div></section>
      </div>
    </div>
  </div>`;
}

function renderPlayerScoreLane(model) {
  const review = laneReviewForSlot(model.hero.slot);
  if (!review) return `<div class="player-score-data-gap"><i data-lucide="git-compare-arrows"></i><strong>缺少对线检查点</strong><span>需要重新解析以生成 3 / 5 / 7 / 10 分钟补刀、经验、等级与净值差。</span></div>`;
  const opponent = safeHero(model.counterpartSlot);
  const verdict = LANE_VERDICT_META[review.verdict] || LANE_VERDICT_META.even;
  const points = [180, 300, 420, 600].map((time) => (review.checkpoints || []).find((point) => Math.abs(Number(point.time) - time) <= 5) || { time, missing: true });
  const checkpointHtml = points.map((point) => {
    const meta = point.missing ? { label: "待补数据", tone: "missing" } : LANE_VERDICT_META[point.verdict] || LANE_VERDICT_META.even;
    const score = point.missing ? "--" : signedValue(point.score);
    return `<button class="player-score-lane-checkpoint ${meta.tone}" type="button" data-player-score-evidence-type="lane" data-player-score-evidence-id="${Number(point.time)}" data-player-score-time="${Number(point.time)}"><time>${formatTime(point.time)}</time><span><strong>${meta.label}</strong><small>补刀差 ${point.missing ? "--" : signedValue(point.last_hits_diff)} · 等级差 ${point.level_diff == null ? "--" : signedValue(point.level_diff)}</small><em>经验 ${point.xp_diff == null ? "--" : signedValue(point.xp_diff)} · 净值 ${point.networth_diff == null ? "--" : signedValue(point.networth_diff)}</em></span><b>${score}</b></button>`;
  }).join("");
  const route = review.support_route || {};
  const support = review.own_support_slot == null ? null : safeHero(review.own_support_slot);
  return `<div class="player-score-lane-view">
    <header class="player-score-matchup"><span><img src="${heroImage(model.hero.token)}" alt="${escapeHtml(model.hero.name)}"><strong>${escapeHtml(model.hero.name)}</strong><small>${positionLabel(model.hero.position)}</small></span><b>VS</b><span><img src="${heroImage(opponent.token)}" alt="${escapeHtml(opponent.name)}"><strong>${escapeHtml(opponent.name)}</strong><small>${positionLabel(opponent.position)}</small></span><em class="${verdict.tone}">${verdict.label} ${signedValue(review.score)}</em></header>
    <div class="player-score-lane-metrics"><span><small>核心补 / 反补差</small><strong>${signedValue(review.core?.last_hits_diff)} / ${signedValue(review.core?.denies_diff)}</strong></span><span><small>核心等级 / 经验差</small><strong>${signedValue(review.core?.level_diff, " 级")} / ${signedValue(review.core?.xp_diff)}</strong></span><span><small>双人总经验差</small><strong>${signedValue(review.lane_pair?.xp_diff)}</strong></span><span><small>双人净值差</small><strong>${signedValue(review.lane_pair?.networth_diff)}</strong></span></div>
    <section class="player-score-lane-checkpoints"><header><strong>3 / 5 / 7 / 10 分钟检查点</strong><small>点击时间点查看证据</small></header><div>${checkpointHtml}</div></section>
    <section class="player-score-support-review"><header><strong>${support ? `${positionLabel(support.position)} ${escapeHtml(support.name)} · 离线价值` : "单人线职责"}</strong><small>置信度 ${Number(review.confidence || 0)}%</small></header>${support ? `<div><span><small>在路</small><strong>${Number(route.lane_presence_pct || 0).toFixed(1)}%</strong></span><span><small>离线</small><strong>${formatTime(route.away_seconds || 0)}</strong></span><span><small>核心单吃经验</small><strong>${formatTime(route.core_solo_xp_seconds || 0)}</strong></span><span><small>离线收益</small><strong>叠野 ${Number(route.stacks || 0)} · 控符 ${Number(route.runes || 0)} · 助攻 ${Number(route.away_assists || 0)}</strong></span></div><p>${escapeHtml(route.interpretation || "辅助路线影响仍需复核")}</p>` : `<p>中路按补刀、反补、等级节点、经验与线上阵亡评估，不套用边路经验分摊模型。</p>`}</section>
  </div>`;
}

function renderPlayerScoreFarm(model) {
  const cells = farmCellsForHero(model.hero.slot);
  const diagnostics = farmDiagnosticsForHero(model.hero.slot).slice().sort((left, right) => Number(left.time || 0) - Number(right.time || 0));
  if (!cells.length && !diagnostics.length) return `<div class="player-score-data-gap"><i data-lucide="route-off"></i><strong>缺少逐单位资源与路线数据</strong><span>不会在没有兵线、营地状态和连续可见性时生成最优路线建议。</span></div>`;
  const total = cells.reduce((sum, cell) => sum + Number(cell.gold || 0), 0);
  const lane = cells.filter((cell) => farmCellGroup(cell) === "lane").reduce((sum, cell) => sum + Number(cell.gold || 0), 0);
  const neutral = cells.filter((cell) => farmCellGroup(cell) === "neutral").reduce((sum, cell) => sum + Number(cell.gold || 0), 0);
  const maxGold = Math.max(1, ...cells.map((cell) => Number(cell.gold || 0)));
  const heat = cells.filter((cell) => cell.coordinate_valid !== false && Number.isFinite(Number(cell.x)) && Number.isFinite(Number(cell.y))).slice(0, 120)
    .map((cell) => `<span class="player-score-farm-heat ${farmCellGroup(cell)}" style="left:${Number(cell.x)}%;top:${Number(cell.y)}%;--heat:${clamp(Number(cell.gold || 0) / maxGold, 0.18, 1)}" title="${escapeHtml(cell.region || "未知区域")} · ${Number(cell.gold || 0)} 金"></span>`).join("");
  const snapshots = snapshotsFor(model.hero.slot);
  const sampleStep = Math.max(1, Math.ceil(snapshots.length / 160));
  const route = snapshots.filter((point, index) => index % sampleStep === 0 && point.coordinate_valid !== false && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
    .map((point) => `${Number(point.x).toFixed(2)},${Number(point.y).toFixed(2)}`).join(" ");
  const currentPosition = positionAtTime(state.currentTime, model.hero.slot);
  const currentMarker = currentPosition ? `<img class="player-score-current-hero" src="${heroImage(model.hero.token)}" alt="${escapeHtml(model.hero.name)}" style="left:${currentPosition.x}%;top:${currentPosition.y}%">` : "";
  const diagnosticHtml = diagnostics.slice(0, 7).map((diagnostic) => {
    const meta = farmDecisionMeta(diagnostic.decision);
    const delta = Math.max(0, Number(diagnostic.suggestedGold || 0) - Number(diagnostic.actualGold || 0));
    return `<button class="player-score-farm-row ${diagnostic.decision || "review"}" type="button" data-player-score-evidence-type="farm" data-player-score-evidence-id="${escapeHtml(diagnostic.id)}" data-player-score-time="${Number(diagnostic.time || 0)}"><time>${formatTime(diagnostic.time)}</time><span><strong>${escapeHtml(farmDiagnosticTitle(diagnostic.title))}</strong><small>${escapeHtml(farmOptionName(diagnostic.actual))} → ${escapeHtml(farmOptionName(diagnostic.recommendation))}</small><em>${escapeHtml(diagnostic.reason || "打开证据栏查看路线门禁")}</em></span><b>${diagnostic.recommendation_enabled && delta > 0 ? `+${delta}g` : meta.label}</b></button>`;
  }).join("") || `<div class="player-score-data-gap compact"><span>没有满足路线审计条件的窗口</span></div>`;
  return `<div class="player-score-farm-view">
    <section class="player-score-farm-map"><header><span><small>真实 Dota 地图</small><strong>空间收益与移动路线</strong></span><button class="text-command" type="button" data-player-score-jump="farm">打开完整打钱分析</button></header><div class="player-score-map-canvas"><img src="/assets/dota-map-740.webp" alt="Dota 2 打钱地图"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${route}"></polyline></svg>${heat}${currentMarker}</div></section>
    <section class="player-score-farm-summary"><header><span><small>收入来源</small><strong>本场资源构成</strong></span></header><div><span><small>已归因总收益</small><strong>${total.toLocaleString("zh-CN")}</strong></span><span><small>兵线</small><strong>${lane.toLocaleString("zh-CN")} · ${total ? Math.round(lane / total * 100) : 0}%</strong></span><span><small>野区</small><strong>${neutral.toLocaleString("zh-CN")} · ${total ? Math.round(neutral / total * 100) : 0}%</strong></span><span><small>路线复核窗口</small><strong>${diagnostics.length}</strong></span></div></section>
    <section class="player-score-farm-diagnostics"><header><span><small>事实与候选分开</small><strong>路线复核</strong></span><em>${diagnostics.filter((item) => item.recommendation_enabled).length} 条通过门禁</em></header><div>${diagnosticHtml}</div></section>
  </div>`;
}

function renderPlayerScoreTempo(model) {
  const facts = model.hero.facts || {};
  const fights = playerScoreFightsForSlot(model.hero.slot);
  const events = playerScoreEventsForHero(model.hero).filter((event) => {
    const text = `${event.type || ""} ${event.text || ""}`;
    return /TP|传送|神符|防御塔|肉山|高地|支援|目标/u.test(text);
  }).slice(0, 80);
  const storyRows = model.brief.stories.map((story) => {
    const meta = PLAYER_SCORE_BRIEF_VERDICT_META[story.verdict] || PLAYER_SCORE_BRIEF_VERDICT_META.missing;
    return `<button class="player-score-domain-story ${meta.className}" type="button" data-player-score-evidence-type="brief-story" data-player-score-evidence-id="${escapeHtml(story.id)}" data-player-score-time="${Number(story.time || 0)}"><time>${escapeHtml(story.range)}</time><span><small>${meta.label}</small><strong>${escapeHtml(story.title)}</strong><em>${escapeHtml(story.summary)}</em></span><i data-lucide="chevron-right"></i></button>`;
  }).join("");
  const eventRows = events.map((event) => `<button class="player-score-domain-event" type="button" data-player-score-evidence-type="timeline" data-player-score-evidence-id="${escapeHtml(event.scoreId)}" data-player-score-time="${Number(event.time || 0)}"><time>${formatTime(event.time)}</time><span><strong>${escapeHtml(event.text || event.type || "地图事件")}</strong><small>${escapeHtml(event.location || "未知区域")} · ${escapeHtml(event.evidence || "事实")}</small></span><b>${escapeHtml(event.value || "")}</b></button>`).join("")
    || `<div class="player-score-data-gap compact"><span>没有可归属到该玩家的目标或移动事件</span></div>`;
  return `<div class="player-score-domain-view">
    <section class="player-score-domain-summary">
      <span><small>TP 使用</small><strong>${Number(facts.teleport_uses || 0)} 次</strong></span>
      <span><small>神符拾取</small><strong>${Number(facts.aggregate_rune_pickups || facts.rune_pickups || 0)} 次</strong></span>
      <span><small>参与战斗</small><strong>${fights.length} 场</strong></span>
      <span><small>建筑伤害</small><strong>${Number(model.hero.tower_damage || facts.tower_damage || 0).toLocaleString("zh-CN")}</strong></span>
      <button class="text-command" type="button" data-player-score-jump="map">打开地图轨迹</button>
    </section>
    <section class="player-score-domain-stories"><header><span><small>固定区间 + 动态阶段</small><strong>地图节奏过程</strong></span><em>事实不等同于好坏</em></header><div>${storyRows}</div></section>
    <section class="player-score-domain-events"><header><span><small>TP、神符与目标</small><strong>可归属事件</strong></span><em>${events.length} 条</em></header><div>${eventRows}</div></section>
  </div>`;
}

function playerScoreFightsForSlot(slot) {
  return COMBAT_SEGMENTS.filter((fight) => (fight.participants || []).map(Number).includes(Number(slot))
    || (fight.contributions || []).some((row) => Number(row.slot) === Number(slot)));
}

function renderPlayerScoreCombat(model) {
  const fights = playerScoreFightsForSlot(model.hero.slot);
  const timingFacts = model.combatTiming?.facts || [];
  if (!fights.length && !timingFacts.length) return `<div class="player-score-data-gap"><i data-lucide="shield-off"></i><strong>没有可归属的战斗片段</strong><span>参与者证据不足时不评价到场、技能职责或战场存在率。</span></div>`;
  const rows = fights.map((fight) => {
    const contribution = fightContributions(fight).find((row) => Number(row.slot) === Number(model.hero.slot));
    const gate = contribution?.responsibility_gate;
    const gateMeta = responsibilityGateMeta(gate);
    const contactStart = Number(fight.contact_start ?? fight.start);
    const contactEnd = Number(fight.contact_end ?? fight.end);
    const score = contribution && (!gate || gate.status === "passed") && Number(model.roleConfidence || 0) >= 65
      ? Math.round(Number(contribution.responsibilityScore || 0)) : "--";
    return `<button class="player-score-combat-row" type="button" data-player-score-evidence-type="combat" data-player-score-evidence-id="${escapeHtml(fight.id)}" data-player-score-time="${contactStart}">
      <time>${formatTime(contactStart)}<small>${Math.max(0, contactEnd - contactStart).toFixed(1)} 秒</small></time><span><strong>${escapeHtml(fight.title)}</strong><small>${escapeHtml(fight.result || "战斗结果待确认")}</small><em>${contribution ? `伤害 ${Number(contribution.damage || 0).toLocaleString("zh-CN")} · 在场 ${Number(contribution.presencePct || 0)}% · 到场 +${Number(contribution.arrivalDelay || 0)}s` : "缺少个人贡献归属"}</em></span><span class="player-score-combat-gate ${gate ? gateMeta.className : "insufficient"}"><small>${gate ? gateMeta.label : "职责证据不足"}</small><strong>${score}</strong></span><i data-lucide="chevron-right"></i>
    </button>`;
  }).join("") || `<div class="player-score-data-gap compact"><span>没有可归属的逐场职责数据</span></div>`;
  const contributions = fights.map((fight) => fightContributions(fight).find((row) => Number(row.slot) === Number(model.hero.slot))).filter(Boolean);
  const totalDamage = contributions.reduce((sum, row) => sum + Number(row.damage || 0), 0);
  const averagePresence = contributions.length ? contributions.reduce((sum, row) => sum + Number(row.presencePct || 0), 0) / contributions.length : null;
  const passedGates = contributions.filter((row) => row.responsibility_gate?.status === "passed").length;
  const teamfights = fights.filter((fight) => fight.kind === "teamfight").length;
  const suppressionLabels = {
    role_confidence_low: "位置置信度不足",
    invalid_coordinates: "战场坐标缺失",
    snapshot_coverage_low: "位置采样不足",
    player_dead: "开战时已阵亡",
    arrival_unreachable: "首轮交战前不可达",
  };
  const feasibilityMeta = {
    reachable: { label: "确认可到场", tone: "reachable" },
    unreachable: { label: "距离不足", tone: "suppressed" },
    dead: { label: "已阵亡", tone: "suppressed" },
    insufficient_evidence: { label: "证据不足", tone: "suppressed" },
  };
  const timingRows = timingFacts.map((fact) => {
    const fightId = String(fact.fight_id || "");
    const fight = COMBAT_SEGMENTS.find((item) => String(item.id) === fightId);
    const engageTime = playerScoreNumber(fact.team_engage_time ?? fact.time);
    const arrivalTime = playerScoreNumber(fact.player_spatial_arrival_time);
    const delta = playerScoreNumber(fact.arrival_delta_seconds);
    const firstActionTime = playerScoreNumber(
      fact.first_meaningful_action_time ?? fact.first_combat_action_time,
    );
    const firstRotationEnd = playerScoreNumber(fact.first_rotation_end);
    const suppressedReasons = Array.isArray(fact.suppressed_reasons)
      ? fact.suppressed_reasons.map((reason) => suppressionLabels[reason] || reason)
      : [];
    const feasibility = feasibilityMeta[fact.join_feasibility]
      || { label: "待确认", tone: "suppressed" };
    const rotationDelay = arrivalTime == null || firstRotationEnd == null
      ? null
      : Math.max(0, arrivalTime - firstRotationEnd);
    const rotationText = arrivalTime == null || firstRotationEnd == null
      ? "待确认"
      : fact.missed_first_rotation === true
        ? `错过 ${rotationDelay} 秒`
        : "赶上首轮";
    const resultText = fact.adverse_consequence === true
      ? "首次有效行动前本方出现减员"
      : fact.positive_consequence === true
        ? "及时行动后形成有利交换"
        : "未观察到确定的直接后果";
    const tone = suppressedReasons.length
      ? "suppressed"
      : fact.negative_eligible === true || fact.initiation_negative_eligible === true
        ? "negative"
        : fact.positive_consequence === true ? "positive" : "neutral";
    const region = fact.region ? regionName(fact.region) : fight?.location || "区域待确认";
    return `<button class="player-score-combat-timing-row ${tone}" type="button" data-player-score-combat-timing-fight="${escapeHtml(fightId)}" data-player-score-time="${Number(fact.review_start ?? engageTime ?? 0)}">
      <span class="player-score-combat-timing-identity"><time>${engageTime == null ? "--:--" : formatTime(engageTime)}</time><strong>${escapeHtml(fight?.title || region)}</strong><small>${escapeHtml(region)} · 置信度 ${Math.round(Number(fact.confidence || 0))}%</small></span>
      <span><small>队伍接触</small><strong>${engageTime == null ? "--:--" : formatTime(engageTime)}</strong></span>
      <span><small>你的到场</small><strong>${arrivalTime == null ? "--:--" : formatTime(arrivalTime)}</strong><em>${delta == null ? "空间到场待确认" : `晚于队伍 ${delta} 秒`}</em></span>
      <span><small>首次行动</small><strong>${firstActionTime == null ? "--:--" : formatTime(firstActionTime)}</strong><em>首次可归属有效行动</em></span>
      <span><small>首轮交战</small><strong>${rotationText}</strong><em>${firstRotationEnd == null ? "窗口待确认" : `窗口至 ${formatTime(firstRotationEnd)}`}</em></span>
      <span class="player-score-combat-timing-feasibility ${feasibility.tone}"><small>到场条件</small><strong>${escapeHtml(feasibility.label)}</strong><em>${escapeHtml(suppressedReasons.join(" · ") || resultText)}</em></span>
      <i data-lucide="arrow-up-right"></i>
    </button>`;
  }).join("") || `<div class="player-score-data-gap compact"><span>当前报告没有逐秒位置与首轮交战事实；不会用伤害事件代替空间到场。</span></div>`;
  const timingCoverage = model.combatTiming?.coverage || {};
  return `<div class="player-score-combat-view">
    <section class="player-score-combat-summary"><span><small>有效参与片段</small><strong>${fights.length}</strong></span><span><small>团战 / 小规模</small><strong>${teamfights} / ${fights.length - teamfights}</strong></span><span><small>已归属英雄伤害</small><strong>${totalDamage.toLocaleString("zh-CN")}</strong></span><span><small>平均战场存在率</small><strong>${averagePresence == null ? "--" : `${averagePresence.toFixed(1)}%`}</strong></span><span><small>职责门禁通过</small><strong>${passedGates} / ${contributions.length}</strong></span><button class="text-command" type="button" data-player-score-jump="combat">打开战斗团战</button></section>
    <section class="player-score-combat-timing"><header><span><small>空间到场、行动与首轮窗口</small><strong>战斗时机</strong></span><em>${timingFacts.length} 场 · 空间覆盖 ${Math.round(Number(timingCoverage.spatial_fact_pct || 0))}%</em></header><div>${timingRows}</div></section>
    <section class="player-score-combat-list"><header><span><small>战前 10 秒至收尾</small><strong>逐场职责审计</strong></span><em>点击查看硬门禁与个人贡献</em></header><div>${rows}</div></section>
  </div>`;
}

function renderPlayerScoreVision(model) {
  const wards = WARD_RECORDS.filter((ward) => Number(ward.playerSlot) === Number(model.hero.slot))
    .slice().sort((left, right) => Number(left.placedAt || 0) - Number(right.placedAt || 0));
  const validWards = wards.filter((ward) => ward.coordinate_valid !== false && Number.isFinite(Number(ward.x)) && Number.isFinite(Number(ward.y)));
  const observers = wards.filter((ward) => ward.type === "observer").length;
  const sentries = wards.filter((ward) => ward.type === "sentry").length;
  const totalLife = wards.reduce((sum, ward) => sum + Math.max(0, Number(ward.endedAt || 0) - Number(ward.placedAt || 0)), 0);
  const detections = wards.reduce((sum, ward) => sum + Number(ward.detections || ward.detectionEvents?.length || 0), 0);
  const scoredWards = wards.map((ward) => playerScoreNumber(ward.score)).filter((score) => score != null);
  const averageScore = scoredWards.length ? scoredWards.reduce((sum, score) => sum + score, 0) / scoredWards.length : null;
  const selectedId = state.selectedPlayerScoreEvidence?.type === "ward"
    ? String(state.selectedPlayerScoreEvidence.id) : String(state.selectedWardId || "");
  const selectedWard = wards.find((ward) => String(ward.id) === selectedId) || null;
  const activeCount = validWards.filter((ward) => wardIsActive(ward)).length;
  const ranges = validWards.map((ward) => {
    const size = wardRangeDiameter(ward);
    const timeState = wardIsActive(ward) ? "active" : state.currentTime < Number(ward.placedAt || 0) ? "future" : "expired";
    const selected = String(ward.id) === selectedId;
    return `<span class="ward-vision-circle player-score-ward-range ${ward.team} ${ward.type} ${timeState} ${selected ? "selected" : ""}" data-player-score-ward-range-id="${escapeHtml(ward.id)}" style="left:${Number(ward.x)}%;top:${Number(ward.y)}%;width:${size}%;height:${size}%"></span>`;
  }).join("");
  const markers = validWards.map((ward) => {
    const type = wardTypeMeta(ward.type);
    const owner = safeHero(ward.playerSlot);
    const timeState = wardIsActive(ward) ? "active" : state.currentTime < Number(ward.placedAt || 0) ? "future" : "expired";
    const selected = String(ward.id) === selectedId;
    return `<button class="ward-map-pin player-score-ward-pin ${ward.team} ${ward.type} ${timeState} ${selected ? "selected" : ""}" type="button" data-player-score-ward-id="${escapeHtml(ward.id)}" data-player-score-evidence-type="ward" data-player-score-evidence-id="${escapeHtml(ward.id)}" data-player-score-time="${Number(ward.placedAt || 0)}" style="left:${Number(ward.x)}%;top:${Number(ward.y)}%" title="${formatTime(ward.placedAt)} · ${escapeHtml(type.name)} · ${escapeHtml(ward.region || "未知区域")}"><img src="${itemImage(type.item)}" alt="${escapeHtml(type.name)}"><img class="ward-owner-avatar" src="${heroImage(owner.token)}" alt="${escapeHtml(owner.name)}"></button>`;
  }).join("");
  const detectionMarkers = (selectedWard?.detectionEvents || []).map((detection) => {
    const position = positionAtTime(detection.time, detection.heroSlot);
    if (!position) return "";
    const enemy = safeHero(detection.heroSlot);
    const timeState = Math.abs(state.currentTime - Number(detection.time || 0)) <= 12 ? "current" : Number(detection.time || 0) <= state.currentTime ? "seen" : "future";
    return `<button class="ward-detection-pin player-score-ward-detection ${timeState}" type="button" data-player-score-ward-detection-time="${Number(detection.time || 0)}" data-player-score-evidence-type="ward" data-player-score-evidence-id="${escapeHtml(selectedWard.id)}" data-player-score-time="${Number(detection.time || 0)}" style="left:${Number(position.x)}%;top:${Number(position.y)}%" title="${formatTime(detection.time)} · 发现 ${escapeHtml(enemy.name)}"><img src="${heroImage(enemy.token)}" alt="${escapeHtml(enemy.name)}"></button>`;
  }).join("");
  const rows = wards.map((ward) => {
    const type = wardTypeMeta(ward.type);
    const life = Math.max(0, Number(ward.endedAt || 0) - Number(ward.placedAt || 0));
    const purpose = ward.purpose === "offense" ? "进攻眼" : ward.purpose === "defense" ? "防守眼" : "用途待判定";
    return `<button class="player-score-ward-row ${String(ward.id) === selectedId ? "active" : ""}" type="button" data-player-score-evidence-type="ward" data-player-score-evidence-id="${escapeHtml(ward.id)}" data-player-score-time="${Number(ward.placedAt || 0)}"><time>${formatTime(ward.placedAt)}</time><span><strong>${escapeHtml(type.name)} · ${escapeHtml(ward.region || "未知区域")}</strong><small>${purpose} · 存活 ${formatTime(life)}</small><em>发现 ${Number(ward.detections || ward.detectionEvents?.length || 0)} 次 · ${escapeHtml(ward.endReason || "结束原因待确认")}</em></span><b>${ward.score == null ? "--" : Math.round(Number(ward.score))}</b></button>`;
  }).join("") || `<div class="player-score-data-gap compact"><span>该玩家没有可归属的眼位生命周期</span></div>`;
  return `<div class="player-score-vision-view">
    <section class="player-score-vision-map"><header><span><small>个人视野网络</small><strong>${escapeHtml(model.hero.name)} · 眼位位置</strong></span><button class="text-command" type="button" data-player-score-jump="vision">打开完整视野分析</button></header><div class="ward-map-shell player-score-map-shell"><div id="player-score-vision-map-canvas" class="map-canvas ward-map-canvas player-score-map-canvas player-score-ward-map-canvas"><img src="/assets/dota-map-740.webp" alt="Dota 2 眼位地图"><div class="ward-range-layer player-score-ward-range-layer">${ranges}</div><div class="ward-map-markers player-score-ward-marker-layer">${markers}${detectionMarkers}</div><span class="player-score-vision-map-status"><strong id="player-score-vision-time">${formatTime(state.currentTime)}</strong><small id="player-score-vision-active">当前存活 ${activeCount} · 可定位 ${validWards.length}/${wards.length}</small></span></div></div></section>
    <section class="player-score-vision-summary"><span><small>假眼 / 真眼</small><strong>${observers} / ${sentries}</strong></span><span><small>累计存活</small><strong>${formatTime(totalLife)}</strong></span><span><small>发现敌方</small><strong>${detections} 次</strong></span><span><small>眼位均分</small><strong>${averageScore == null ? "--" : averageScore.toFixed(1)}</strong></span></section>
    <section class="player-score-ward-list"><header><span><small>位置、生命周期与发现</small><strong>个人眼位清单</strong></span><em>${wards.length} 个</em></header><div>${rows}</div></section>
  </div>`;
}

function renderPlayerScoreExecution(model) {
  const facts = model.hero.facts || {};
  const fights = playerScoreFightsForSlot(model.hero.slot);
  const contributions = fights.map((fight) => ({
    fight,
    row: fightContributions(fight).find((item) => Number(item.slot) === Number(model.hero.slot)),
  })).filter((entry) => entry.row);
  const averageArrival = contributions.length
    ? contributions.reduce((sum, entry) => sum + Number(entry.row.arrivalDelay || 0), 0) / contributions.length : null;
  const gated = contributions.filter((entry) => entry.row.responsibility_gate?.status === "passed");
  const events = playerScoreEventsForHero(model.hero).filter((event) => ["item", "combat"].includes(event.category)).slice(0, 100);
  const rows = events.map((event) => `<button class="player-score-domain-event" type="button" data-player-score-evidence-type="timeline" data-player-score-evidence-id="${escapeHtml(event.scoreId)}" data-player-score-time="${Number(event.time || 0)}"><time>${formatTime(event.time)}</time><span><strong>${escapeHtml(event.text || event.type || "操作事件")}</strong><small>${escapeHtml(event.location || "未知区域")} · ${escapeHtml(event.evidence || "事实")}</small></span><b>${escapeHtml(event.value || "")}</b></button>`).join("")
    || `<div class="player-score-data-gap compact"><span>没有可归属的技能或物品事件</span></div>`;
  return `<div class="player-score-execution-view">
    <section class="player-score-execution-summary">
      <span><i data-lucide="mouse-pointer-2"></i><small>APM 事实</small><strong>${formatPlayerReportValue(facts.actions_per_min, "per_minute")}</strong><em>不直接代表操作好坏</em></span>
      <span><i data-lucide="sparkles"></i><small>技能使用</small><strong>${Number(facts.ability_casts || 0)} 次</strong><em>需结合合理目标和机会</em></span>
      <span><i data-lucide="package-open"></i><small>物品使用</small><strong>${Number(facts.item_uses || 0)} 次</strong><em>含 ${Number(facts.teleport_uses || 0)} 次 TP</em></span>
      <span><i data-lucide="timer"></i><small>平均到场</small><strong>${averageArrival == null ? "--" : `+${averageArrival.toFixed(1)}s`}</strong><em>${contributions.length} 场可归属战斗</em></span>
      <span><i data-lucide="shield-check"></i><small>职责门禁</small><strong>${gated.length} / ${contributions.length}</strong><em>通过后才评价技能职责</em></span>
      <span><i data-lucide="activity"></i><small>控制时长</small><strong>${formatPlayerReportValue(facts.control_seconds, "seconds")}</strong><em>仅展示 Replay 可观测事实</em></span>
    </section>
    <section class="player-score-execution-events"><header><span><small>技能、物品与响应</small><strong>可观测执行事件</strong></span><em>${events.length} 条</em></header><div>${rows}</div></section>
    <footer class="player-score-execution-caveat"><i data-lucide="info"></i><span>Replay 无法可靠观察鼠标精度、镜头移动、语音沟通和心理状态；本页不会用高 APM 直接得出“操作好”的结论。</span><button class="text-command" type="button" data-player-score-jump="timeline">打开完整时间轴</button></footer>
  </div>`;
}

function playerScoreReportDimensionFacts(model, dimension) {
  const evidenceFacts = (dimension?.evidence || []).slice(0, 3).map((evidence) => ({
    label: PLAYER_EVIDENCE_META[evidence.key]?.[0] || evidence.key || "指标",
    value: playerEvidenceText(evidence),
  })).filter((fact) => fact.value != null && fact.value !== "");
  if (evidenceFacts.length) return evidenceFacts;
  return playerScoreFallbackDimensionFacts(model, dimension?.key).slice(0, 3).map(([label, value]) => ({ label, value }));
}

function playerScoreReportFactLine(model, dimension) {
  const facts = playerScoreReportDimensionFacts(model, dimension);
  return facts.length ? facts.map((fact) => `${fact.label} ${fact.value}`).join("；") : "当前回放没有足够的个人行为证据";
}

function playerScoreReportStrengths(model) {
  const dimensions = [];
  model.strengths.forEach((strength) => {
    const dimension = model.dimensions.find((item) => item.key === strength.dimensionKey);
    if (dimension?.score != null && !dimensions.some((item) => item.key === dimension.key)) dimensions.push(dimension);
  });
  const ranked = model.dimensions.filter((dimension) => dimension.score != null).sort((left, right) => right.score - left.score);
  ranked.filter((dimension) => Number(dimension.score) >= 65).forEach((dimension) => {
    if (dimensions.length < 3 && !dimensions.some((item) => item.key === dimension.key)) dimensions.push(dimension);
  });
  if (!dimensions.length && Number(ranked[0]?.score) >= 60) dimensions.push(ranked[0]);
  return dimensions.slice(0, 3);
}

function playerScoreReportImprovements(model) {
  if (model.advice.length) return model.advice.slice(0, 3).map((advice) => ({
    id: advice.id,
    evidenceType: "advice",
    title: advice.title,
    score: null,
    fact: advice.fact || "当前结论来自本场评分模型，行为级事实仍需在右侧证据栏复核。",
    judgment: advice.judgment || "这是本场优先级较高的改进项。",
    action: advice.action || "打开对应模块，回看发生前后的时间窗口。",
    confidence: advice.confidence,
    legacy: advice.legacy,
  }));
  return model.dimensions.filter((dimension) => dimension.score != null && Number(dimension.score) < 75).sort((left, right) => left.score - right.score).slice(0, 3).map((dimension) => ({
    id: dimension.key,
    evidenceType: "dimension",
    title: dimension.label,
    score: dimension.score,
    fact: playerScoreReportFactLine(model, dimension),
    judgment: `${dimension.label}是当前有效评分中相对较低的一项，需要结合具体时间窗口判断原因。`,
    action: `前往${dimension.label}对应模块，优先复核可改变结果的决策。`,
    confidence: dimension.confidence,
    legacy: false,
  }));
}

function playerScoreReportActions(model, improvements) {
  const actions = [model.summary.nextMatchFocus, ...improvements.map((item) => item.action)].filter(Boolean);
  const roleReview = {
    1: "按每波兵线记录线野衔接、危险线豁免与关键装备前的死亡成本。",
    2: "复核清线后第一移动、神符窗口和边路支援是否转化为目标。",
    3: "复核先手时机、危险线处理和替核心占据高风险区域的收益。",
    4: "复核离线路线是否同时创造视野、符点、叠野或有效支援价值。",
    5: "复核保人距离、关键技能留取和目标区域的视野准备是否到位。",
  }[Number(model.position)] || "按时间轴复核本场最低评分维度的关键决策。";
  actions.push(roleReview);
  return [...new Set(actions.map((action) => String(action).trim()).filter(Boolean))].slice(0, 3);
}

function renderPlayerScoreTextReport(model) {
  const hero = model.hero;
  const available = model.dimensions.filter((dimension) => dimension.score != null);
  const missing = model.dimensions.filter((dimension) => dimension.score == null);
  const strengths = playerScoreReportStrengths(model);
  const improvements = playerScoreReportImprovements(model);
  const actions = playerScoreReportActions(model, improvements);
  const overall = model.canShowOverall ? `${Math.round(model.overallScore)} 分 · ${model.grade || "已评分"}` : "综合分暂不展示";
  const reportLead = `${escapeHtml(hero.name)}本场承担${escapeHtml(model.role.label)}。${escapeHtml(model.summary.headline)} 当前有 ${available.length}/10 个维度具备评分证据，${missing.length ? `${missing.length} 个维度因字段或门禁不足未参与综合分。` : "十个维度均有可用证据。"}`;
  const factStrip = [
    ["K / D / A", `${hero.kills ?? "--"} / ${hero.deaths ?? "--"} / ${hero.assists ?? "--"}`],
    ["补刀 / 反补", `${hero.lh ?? "--"} / ${hero.denies ?? "--"}`],
    ["GPM / XPM", `${hero.gpm ?? "--"} / ${hero.xpm ?? "--"}`],
    ["英雄伤害", playerScoreNumber(hero.damage ?? hero.facts?.hero_damage) == null ? "--" : Number(hero.damage ?? hero.facts?.hero_damage).toLocaleString("zh-CN")],
  ].map(([label, value]) => `<span><small>${label}</small><strong>${value}</strong></span>`).join("");
  const strengthHtml = strengths.length ? strengths.map((dimension, index) => {
    const facts = playerScoreReportDimensionFacts(model, dimension);
    const scoreText = dimension.score == null ? "--" : Math.round(dimension.score);
    const assessment = Number(dimension.score) >= 75
      ? `这是本场相对明确的优势项，${dimension.brief}的整体结果较稳定。`
      : `这是当前可用维度中相对更稳定的一项，但仍不应脱离具体时间窗口解读。`;
    return `<button class="player-score-report-row strength" type="button" data-player-score-evidence-type="dimension" data-player-score-evidence-id="${escapeHtml(dimension.key)}"><span class="player-score-report-index">${String(index + 1).padStart(2, "0")}</span><span><small>程序推导 · ${escapeHtml(dimension.label)}</small><strong>${escapeHtml(assessment)}</strong><em><b>回放事实</b>${facts.length ? facts.map((fact) => `${escapeHtml(fact.label)} ${escapeHtml(fact.value)}`).join("；") : "证据不足，暂不作强结论"}</em></span><span class="player-score-report-score"><small>维度分</small><strong>${scoreText}</strong></span><i data-lucide="chevron-right"></i></button>`;
  }).join("") : `<div class="player-score-report-empty">当前没有达到证据门槛的优势项，报告不会凭比赛胜负补写优点。</div>`;
  const improvementHtml = improvements.length ? improvements.map((item, index) => {
    const evidenceLabel = item.legacy || Number(item.confidence || 0) < 70 ? "待复核" : "程序推导";
    return `<button class="player-score-report-row improve" type="button" data-player-score-evidence-type="${escapeHtml(item.evidenceType)}" data-player-score-evidence-id="${escapeHtml(item.id)}"><span class="player-score-report-index">${String(index + 1).padStart(2, "0")}</span><span><small>${evidenceLabel} · ${escapeHtml(item.title)}</small><strong>${escapeHtml(item.judgment)}</strong><em><b>本场事实</b>${escapeHtml(item.fact)}</em><em><b>下一步</b>${escapeHtml(item.action)}</em></span><span class="player-score-report-score"><small>${item.confidence == null ? "评分" : "置信度"}</small><strong>${item.score == null ? item.confidence == null ? "--" : `${Math.round(item.confidence)}%` : Math.round(item.score)}</strong></span><i data-lucide="chevron-right"></i></button>`;
  }).join("") : `<div class="player-score-report-empty">当前没有通过证据门槛的明确缺点；建议先补齐行为级解析字段。</div>`;
  const phaseHtml = model.phases.length ? model.phases.map((phase) => {
    const label = PLAYER_SCORE_PHASE_META[phase.phase] || phase.phase || "比赛阶段";
    const score = phase.score == null ? "--" : Math.round(phase.score);
    const phaseFacts = [];
    if (phase.kills != null || phase.deaths != null || phase.assists != null) phaseFacts.push(`K/D/A ${phase.kills ?? "--"}/${phase.deaths ?? "--"}/${phase.assists ?? "--"}`);
    if (phase.last_hits != null) phaseFacts.push(`补刀 ${Number(phase.last_hits).toLocaleString("zh-CN")}`);
    if (phase.networth_gain != null) phaseFacts.push(`经济增长 ${Number(phase.networth_gain).toLocaleString("zh-CN")}`);
    if (phase.damage_dealt != null) phaseFacts.push(`英雄伤害 ${Number(phase.damage_dealt).toLocaleString("zh-CN")}`);
    const details = phaseFacts.join(" · ") || "阶段事实字段不足，暂不作行为判断";
    return `<button class="player-score-report-phase" type="button" data-player-score-evidence-type="phase" data-player-score-evidence-id="${escapeHtml(phase.id)}" data-player-score-time="${Number(phase.start || 0)}"><time>${formatTime(phase.start)}-${formatTime(phase.end)}</time><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(details)}</small></span><b>${score}</b><i data-lucide="chevron-right"></i></button>`;
  }).join("") : `<div class="player-score-report-empty">当前分析包没有分阶段个人归因，无法判断优势或问题发生在哪个阶段。</div>`;
  const rawCaveats = Array.isArray(model.caveats) ? model.caveats : model.caveats ? [model.caveats] : [];
  const caveats = [
    ...rawCaveats.map((caveat) => typeof caveat === "string" ? caveat : caveat?.message || caveat?.label).filter(Boolean),
    ...(missing.length ? [`未评分维度：${missing.map((dimension) => dimension.label).join("、")}`] : []),
    "评分只比较本场位置职责与可观测行为，不直接按胜负、英雄难度或段位加减分。",
  ];
  return `<article class="player-score-text-report">
    <header class="player-score-report-lead"><span><small>本场文字结论</small><strong>${overall}</strong></span><p>${reportLead}</p><em>评分置信度 ${model.confidence == null ? "--" : `${Math.round(model.confidence)}%`} · 角色置信度 ${model.roleConfidence == null ? "--" : `${Math.round(model.roleConfidence)}%`}</em></header>
    <div class="player-score-report-facts">${factStrip}</div>
    <section class="player-score-report-section"><header><span><small>相对稳定项</small><strong>本场优点</strong></span><em>${strengths.length} 项</em></header><div>${strengthHtml}</div></section>
    <section class="player-score-report-section"><header><span><small>优先改变的决策</small><strong>主要不足</strong></span><em>${improvements.length} 项</em></header><div>${improvementHtml}</div></section>
    <section class="player-score-report-section phases"><header><span><small>表现发生在什么时候</small><strong>分阶段复盘</strong></span><em>${model.phases.length} 段</em></header><div>${phaseHtml}</div></section>
    <section class="player-score-report-actions"><header><small>下一局只盯三件事</small><strong>训练重点</strong></header><ol>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol></section>
    <footer class="player-score-report-caveats"><i data-lucide="info"></i><span>${caveats.map((caveat) => escapeHtml(caveat)).join(" · ")}</span></footer>
  </article>`;
}

function playerScoreEventsForHero(hero) {
  return TIMELINE_EVENTS.map((event, index) => ({ ...event, scoreId: event.id || `timeline-${index}` })).filter((event) => {
    const actorSlot = playerScoreNumber(event.raw?.actor_slot);
    const targetSlot = playerScoreNumber(event.raw?.target_slot);
    if (actorSlot != null || targetSlot != null) return actorSlot === hero.slot || targetSlot === hero.slot;
    return event.actor === hero.name || String(event.text || "").includes(hero.name);
  });
}

function renderPlayerScoreTimelineTab(model) {
  const events = playerScoreEventsForHero(model.hero);
  if (!events.length) return `<div class="player-score-data-gap"><i data-lucide="list-x"></i><strong>缺少可归属的个人事件</strong><span>完整时间线保留事实事件，不会用团队事件填充个人行为。</span></div>`;
  const rows = events.slice(0, 500).map((event) => `<button class="player-score-event-row" type="button" data-player-score-evidence-type="timeline" data-player-score-evidence-id="${escapeHtml(event.scoreId)}" data-player-score-time="${Number(event.time || 0)}"><time>${formatTime(event.time)}</time><span class="player-score-event-kind ${escapeHtml(event.category)}"><i data-lucide="${escapeHtml(event.icon || "activity")}"></i>${escapeHtml(event.type || "事件")}</span><span><strong>${escapeHtml(event.text || "Replay 事件")}</strong><small>${escapeHtml(event.location || "未知区域")} · ${escapeHtml(event.evidence || "事实")}</small></span><b>${escapeHtml(event.value || "")}</b></button>`).join("");
  const categoryCounts = events.reduce((counts, event) => ({ ...counts, [event.category]: (counts[event.category] || 0) + 1 }), {});
  return `<div class="player-score-events-view"><header><span><small>个人事件</small><strong>${events.length.toLocaleString("zh-CN")} 条</strong></span><div><em>发育 ${categoryCounts.farm || 0}</em><em>战斗 ${categoryCounts.combat || 0}</em><em>装备 ${categoryCounts.item || 0}</em><em>视野 ${categoryCounts.vision || 0}</em><button class="text-command" type="button" data-player-score-jump="timeline">打开全场时间轴</button></div></header><div class="player-score-event-table"><div class="player-score-event-head"><span>时间</span><span>类型</span><span>事件</span><span>数值</span></div>${rows}</div></div>`;
}

function playerScoreTimelineMarkers(model) {
  const markers = [];
  model.phases.forEach((phase) => markers.push({ id: `phase-${phase.id}`, time: phase.start, type: "lane", label: PLAYER_SCORE_PHASE_META[phase.phase] || phase.phase || "阶段" }));
  playerScoreFightsForSlot(model.hero.slot).forEach((fight) => markers.push({ id: `fight-${fight.id}`, time: Number(fight.contact_start ?? fight.start), type: "combat", label: fight.title }));
  WARD_RECORDS.filter((ward) => Number(ward.playerSlot) === Number(model.hero.slot)).forEach((ward) => markers.push({ id: `ward-${ward.id}`, time: Number(ward.placedAt || 0), type: "vision", label: `${wardTypeMeta(ward.type).name} · ${ward.region}` }));
  ITEM_EVENTS.filter((event) => Number(event.time || 0) >= 0).forEach((event, index) => markers.push({ id: `item-${index}`, time: Number(event.time || 0), type: "item", label: `${event.action || "装备"} ${itemName(event.key)}` }));
  model.advice.filter((item) => item.timeStart != null).forEach((item) => markers.push({ id: `advice-${item.id}`, time: item.timeStart, type: "advice", label: item.title }));
  model.brief.strengths.filter((item) => item.time != null).forEach((item) => markers.push({ id: `brief-strength-${item.id}`, time: item.time, type: "advice", label: item.title }));
  model.brief.priorities.filter((item) => item.time != null).forEach((item) => markers.push({ id: `brief-priority-${item.id}`, time: item.time, type: "advice", label: item.title }));
  const unique = new Map();
  markers.filter((marker) => Number.isFinite(marker.time)).forEach((marker) => {
    const key = `${marker.type}:${Math.round(marker.time)}:${marker.label}`;
    if (!unique.has(key)) unique.set(key, marker);
  });
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

function renderPlayerScoreTimeline(model) {
  const root = document.querySelector("#player-score-timeline");
  if (!root) return;
  const duration = Math.max(1, MATCH_DURATION);
  const phaseBands = model.phases.map((phase, index) => {
    const left = clamp(phase.start / duration * 100, 0, 100);
    const width = clamp((phase.end - phase.start) / duration * 100, 0, 100 - left);
    return `<span class="player-score-phase-band phase-${index % 4}" style="left:${left}%;width:${width}%" title="${escapeHtml(PLAYER_SCORE_PHASE_META[phase.phase] || phase.phase || "阶段")}"></span>`;
  }).join("");
  const markers = playerScoreTimelineMarkers(model).slice(0, 140).map((marker) => `<button class="player-score-timeline-marker ${marker.type}" type="button" data-player-score-time="${marker.time}" style="left:${clamp(marker.time / duration * 100, 0, 100)}%" title="${formatTime(marker.time)} · ${escapeHtml(marker.label)}"></button>`).join("");
  root.innerHTML = `<div class="player-score-timeline-track">${phaseBands}${markers}<span id="player-score-timeline-playhead" class="player-score-timeline-playhead" style="left:${clamp(state.currentTime / duration * 100, 0, 100)}%"></span></div><div class="player-score-timeline-scale"><span>00:00</span><span>10:00</span><span>20:00</span><span>${formatTime(duration)}</span></div>`;
  document.querySelector("#player-score-timeline-current").textContent = formatTime(state.currentTime);
}

function playerScoreEvidenceFact(label, value, tone = "") {
  const displayValue = value == null || value === "" ? "--" : value;
  return `<div class="player-score-evidence-fact ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(displayValue)}</strong></div>`;
}

function playerScoreRootCauseHtml(rootCause) {
  if (!rootCause) return "";
  const scorePathMeta = {
    embedded: { label: "已计入基础分", className: "embedded" },
    modifier: { label: "行为修正", className: "modifier" },
    context_only: { label: "仅作上下文", className: "context" },
  };
  const consequenceMeta = {
    death: { label: "阵亡", icon: "skull" },
    item_delay: { label: "装备延误", icon: "hourglass" },
    objective_loss: { label: "目标损失", icon: "landmark" },
    vision_gap: { label: "视野缺口", icon: "eye-off" },
  };
  const statusMeta = {
    fact: "Replay 事实",
    derived: "程序关联",
    estimated: "区间估算",
    gated: "门禁通过",
    partial: "部分证据",
  };
  const consequences = (rootCause.consequences || []).map((consequence) => {
    const meta = consequenceMeta[consequence.type] || { label: consequence.label || "比赛后果", icon: "circle-dot" };
    const status = statusMeta[consequence.evidence_status] || "程序推导";
    const contextOnly = consequence.personal_penalty_applied === false ? " · 仅作上下文" : "";
    return `<div class="player-score-root-consequence ${escapeHtml(consequence.type || "derived")}">
      <i data-lucide="${meta.icon}"></i>
      <span><small>${escapeHtml(status)}${contextOnly}${consequence.time == null ? "" : ` · ${formatTime(consequence.time)}`}</small><strong>${escapeHtml(consequence.label || meta.label)}</strong><em>${escapeHtml(consequence.fact || "该后果已有结构化证据，但尚无文字摘要。")}</em></span>
    </div>`;
  }).join("");
  const cap = rootCause.scoring_summary || rootCause.impact_cap || {};
  const rawPenalty = playerScoreNumber(
    cap.candidate_negative_overall ?? cap.raw_negative_overall,
  );
  const cappedPenalty = playerScoreNumber(
    cap.applied_negative_overall ?? cap.capped_negative_overall,
  );
  const limit = playerScoreNumber(cap.root_cap ?? cap.overall_penalty_cap) ?? 6;
  const capApplied = cap.root_cap_applied === true || cap.applied === true;
  const capText = rawPenalty == null || cappedPenalty == null
    ? "当前根因没有可计入的负向评分影响"
    : capApplied
      ? `封顶前 -${rawPenalty.toFixed(2)} → 计入 -${cappedPenalty.toFixed(2)}`
      : `实际应用 -${cappedPenalty.toFixed(2)} · 单因上限 -${limit.toFixed(2)}`;
  const dimensions = Object.entries(rootCause.dimension_impacts || {}).filter(([, value]) => Number(value) < 0)
    .map(([key, value]) => `<span>${escapeHtml(PLAYER_SCORE_DIMENSION_META[key]?.label || key)} <b>${signedValue(value)}</b></span>`).join("");
  const scoringImpacts = (rootCause.scoring_impacts || []).map((impact) => {
    const path = scorePathMeta[impact.score_path] || scorePathMeta.context_only;
    const duplicate = impact.dedupe_status === "suppressed_duplicate";
    const stateLabel = duplicate ? "同结果已去重" : path.label;
    const raw = playerScoreNumber(impact.raw_delta) ?? 0;
    const applied = playerScoreNumber(impact.applied_delta) ?? 0;
    const confidenceFactor = Math.round((playerScoreNumber(impact.confidence_factor) ?? 0) * 100);
    const responsibilityFactor = Math.round((playerScoreNumber(impact.responsibility_factor) ?? 0) * 100);
    return `<article class="player-score-root-impact ${path.className} ${duplicate ? "deduped" : ""}">
      <header><span>${escapeHtml(PLAYER_SCORE_DIMENSION_META[impact.dimension]?.label || impact.dimension || "上下文")}</span><b>${escapeHtml(stateLabel)}</b></header>
      <div><span><small>原始影响</small><strong>${signedValue(raw)}</strong></span><span><small>置信系数</small><strong>${confidenceFactor}%</strong></span><span><small>归责系数</small><strong>${responsibilityFactor}%</strong></span><span><small>实际应用</small><strong>${signedValue(applied)}</strong></span></div>
      <p>${escapeHtml(duplicate ? "相同结果已由更强证据根因计入，本项保留审计但不重复加减分。" : impact.overlap_reason || impact.suppression_reason || "独立行为上下文通过计分门槛。")}</p>
    </article>`;
  }).join("");
  return `<section class="player-score-root-cause">
    <header><span><small>同一根因，只扣一次</small><strong>后果链</strong></span><em>${Number(rootCause.consequence_count || 0)} 项</em></header>
    ${consequences ? `<div class="player-score-root-consequences">${consequences}</div>` : `<p>当前根因没有关联到额外后果。</p>`}
    <div class="player-score-root-cap ${capApplied ? "capped" : ""}"><span><small>跨维度归因</small><strong>${escapeHtml(capText)}</strong></span><i data-lucide="${capApplied ? "shield-check" : "shield"}"></i></div>
    ${dimensions ? `<div class="player-score-root-dimensions">${dimensions}</div>` : ""}
    ${scoringImpacts ? `<div class="player-score-root-impacts">${scoringImpacts}</div>` : ""}
  </section>`;
}

function playerScoreSelectedEvidence(model) {
  const selected = state.selectedPlayerScoreEvidence;
  if (selected?.type === "score-audit") {
    return { type: "score-audit", item: model.scoreAudit };
  }
  if (selected?.type === "brief-story") {
    const item = model.brief.stories.find((story) => String(story.id) === String(selected.id));
    if (item) return { type: "brief-story", item };
  }
  if (selected?.type === "brief-insight") {
    const item = [...model.brief.strengths, ...model.brief.priorities].find((insight) => String(insight.id) === String(selected.id));
    if (item) return { type: "brief-insight", item };
  }
  if (selected?.type === "behavior-insight") {
    const source = model.rawInsights.find((insight) => String(insight.id) === String(selected.id));
    if (source) {
      return {
        type: "behavior-insight",
        item: {
          ...source,
          time: playerScoreNumber(source.time_start ?? source.jump_target?.time),
          timeEnd: playerScoreNumber(source.time_end),
          module: source.jump_target?.module || playerScoreAdviceModule(source),
          impact: playerScoreImpactText(source.impact),
          evidenceRefs: source.evidence_refs || [],
          rootCauseId: source.root_cause_id || null,
          rootCause: model.rootCauseById?.get(String(source.root_cause_id || "")) || null,
        },
      };
    }
  }
  if (selected?.type === "root-score") {
    const item = model.rootCauseById?.get(String(selected.id || ""));
    if (item) return { type: "root-score", item };
  }
  if (selected?.type === "dimension") {
    const item = model.dimensions.find((dimension) => dimension.key === selected.id);
    if (item) return { type: "dimension", item };
  }
  if (selected?.type === "advice") {
    const item = model.advice.find((advice) => advice.id === selected.id);
    if (item) return { type: "advice", item };
  }
  if (selected?.type === "phase") {
    const item = model.phases.find((phase) => phase.id === selected.id);
    if (item) return { type: "phase", item };
  }
  if (selected?.type === "lane") {
    const item = (laneReviewForSlot(model.hero.slot)?.checkpoints || []).find((point) => Number(point.time) === Number(selected.id));
    if (item) return { type: "lane", item };
  }
  if (selected?.type === "farm") {
    const item = farmDiagnosticsForHero(model.hero.slot).find((diagnostic) => String(diagnostic.id) === String(selected.id));
    if (item) return { type: "farm", item };
  }
  if (selected?.type === "combat") {
    const item = COMBAT_SEGMENTS.find((fight) => String(fight.id) === String(selected.id));
    if (item) return { type: "combat", item };
  }
  if (selected?.type === "ward") {
    const item = WARD_RECORDS.find((ward) => String(ward.id) === String(selected.id));
    if (item) return { type: "ward", item };
  }
  if (selected?.type === "timeline") {
    const item = playerScoreEventsForHero(model.hero).find((event) => String(event.scoreId) === String(selected.id));
    if (item) return { type: "timeline", item };
  }
  const fallback = state.playerScoreMode === "brief"
    ? model.brief.priorities[0] || model.brief.stories[0] || model.brief.strengths[0]
    : model.advice[0] || [...model.dimensions].filter((dimension) => dimension.score != null).sort((left, right) => left.score - right.score)[0] || model.dimensions[0];
  const type = state.playerScoreMode === "brief"
    ? model.brief.priorities.includes(fallback) || model.brief.strengths.includes(fallback) ? "brief-insight" : "brief-story"
    : fallback?.id && model.advice.includes(fallback) ? "advice" : "dimension";
  state.selectedPlayerScoreEvidence = fallback ? { type, id: fallback.id || fallback.key } : null;
  return fallback ? { type, item: fallback } : null;
}

function renderPlayerScoreEvidence(model) {
  const root = document.querySelector("#player-score-evidence-body");
  const title = document.querySelector("#player-score-evidence-title");
  const stateTag = document.querySelector("#player-score-evidence-state");
  const selected = playerScoreSelectedEvidence(model);
  if (!selected) {
    title.textContent = "评分证据";
    stateTag.textContent = "证据不足";
    stateTag.className = "evidence-tag insufficient";
    root.innerHTML = `<div class="player-score-data-gap compact"><span>选择一项评分或事件查看证据</span></div>`;
    return;
  }
  const { type, item } = selected;
  let status = playerScoreEvidenceLevel("derived");
  let heading = "评分证据";
  let body = "";
  let module = "timeline";
  let time = null;
  if (type === "score-audit") {
    heading = "综合分审计";
    module = "player-score";
    status = playerScoreEvidenceLevel(item.valid ? "full" : "invalid");
    const formatAuditScore = (value) => value == null ? "--" : Number(value).toFixed(2);
    if (!item.supported) {
      status = playerScoreEvidenceLevel("partial");
      body = `<section class="player-score-data-gap compact"><i data-lucide="refresh-cw"></i><span><strong>旧版报告不支持可重算审计</strong><small>当前分数仍可查看；使用最新解析器重新解析后，才会生成基础分、行为修正、最终分和三路计分记录。</small></span></section>`;
    } else {
    const dimensionRows = item.rows.filter((row) => row.available).map((row) => {
      const meta = PLAYER_SCORE_DIMENSION_META[row.key] || { label: row.key || "维度" };
      const modifierTone = Number(row.storedModifier || 0) > 0
        ? "positive"
        : Number(row.storedModifier || 0) < 0 ? "negative" : "neutral";
      return `<button class="player-score-audit-row ${row.valid ? "valid" : "invalid"}" type="button" data-player-score-evidence-type="dimension" data-player-score-evidence-id="${escapeHtml(row.key)}">
        <span><strong>${escapeHtml(meta.label)}</strong><small>有效权重 ${Number(row.effectiveWeight || 0).toFixed(2)}%</small></span>
        <span><small>基础分</small><b>${formatAuditScore(row.baseScore)}</b></span>
        <span class="${modifierTone}"><small>行为修正</small><b>${signedValue(row.storedModifier || 0)}</b></span>
        <span><small>最终分</small><b>${formatAuditScore(row.storedFinalScore)}</b></span>
        <span><small>综合贡献</small><b>${formatAuditScore(row.finalContribution)}</b></span>
        <i data-lucide="chevron-right"></i>
      </button>`;
    }).join("");
    const pathCounts = item.pathCounts || {};
    const auditIssueMeta = {
      overall_base_mismatch: "基础综合分不一致",
      overall_final_mismatch: "最终综合分不一致",
      overall_modifier_mismatch: "综合修正不一致",
      duplicate_applied_dedupe_key: "同一结果被重复应用",
      no_available_dimensions: "没有可评分维度",
      dimension_recomputation_failed: "至少一个维度不一致",
    };
    const issueText = item.valid
      ? `本地重算一致 · 允许误差 ±${Number(item.tolerance || 0.05).toFixed(2)}`
      : `本地重算不一致 · ${item.issues.map((issue) => auditIssueMeta[issue] || "未知审计差异").join("、") || "评分字段缺失"}`;
    body = `<section class="player-score-evidence-score score-audit-summary">
      <span><small>基础综合分</small><strong>${formatAuditScore(item.storedBaseScore)}</strong></span>
      <span><small>行为修正</small><strong class="${Number(item.storedBehaviorModifier || 0) < 0 ? "negative" : Number(item.storedBehaviorModifier || 0) > 0 ? "positive" : ""}">${signedValue(item.storedBehaviorModifier || 0)}</strong></span>
      <span><small>最终综合分</small><strong>${formatAuditScore(item.storedFinalScore)}</strong></span>
    </section>
    <section class="player-score-audit-verification ${item.valid ? "valid" : "invalid"}"><i data-lucide="${item.valid ? "badge-check" : "circle-alert"}"></i><span><small>本地重算</small><strong>${escapeHtml(issueText)}</strong><em>基础 ${formatAuditScore(item.recomputedBaseScore)} · 修正 ${signedValue(item.recomputedBehaviorModifier || 0)} · 最终 ${formatAuditScore(item.recomputedFinalScore)}</em></span></section>
    <section><header>三路计分</header><div class="player-score-audit-paths"><span class="embedded"><small>已计入基础分</small><strong>${Number(pathCounts.embedded || 0)}</strong></span><span class="modifier"><small>行为修正</small><strong>${Number(pathCounts.modifier || 0)}</strong></span><span class="context"><small>仅作上下文</small><strong>${Number(pathCounts.context_only || 0)}</strong></span><span class="dedupe"><small>同结果已去重</small><strong>${Number(item.duplicateAppliedDedupeKeys?.length || 0)}</strong></span></div></section>
    <section><header>维度贡献</header><div class="player-score-audit-table">${dimensionRows || `<div class="player-score-data-gap compact"><span>没有可进入综合分的维度</span></div>`}</div></section>`;
    }
  } else if (type === "brief-story") {
    const verdict = PLAYER_SCORE_BRIEF_VERDICT_META[item.verdict] || PLAYER_SCORE_BRIEF_VERDICT_META.missing;
    heading = item.title;
    module = item.module || "timeline";
    time = Number(item.time || 0);
    status = playerScoreEvidenceLevel(Number(item.confidence || 0) >= 85 ? "full" : Number(item.confidence || 0) >= 70 ? "derived" : "partial");
    const metrics = (item.metrics || []).map((metric) => playerScoreEvidenceFact(metric.label || "关键指标", metric.value ?? "--", "fact")).join("");
    const refs = (item.evidenceRefs || []).map((ref) => `<code>${escapeHtml(ref)}</code>`).join("");
    body = `<section class="player-score-evidence-score"><span><small>阶段判断</small><strong>${verdict.label}</strong></span><span><small>时间</small><strong>${escapeHtml(item.range)}</strong></span><span><small>置信度</small><strong>${item.confidence == null ? "--" : `${Math.round(item.confidence)}%`}</strong></span></section><section><header>比赛过程</header><p>${escapeHtml(item.summary)}</p></section>${metrics ? `<section><header>关键事实</header><div class="player-score-evidence-facts">${metrics}</div></section>` : ""}${refs ? `<section><header>证据引用</header><div class="player-score-evidence-refs">${refs}</div></section>` : ""}`;
  } else if (type === "brief-insight" || type === "behavior-insight") {
    heading = item.title;
    module = item.module || "timeline";
    time = item.time;
    const confidence = Number(item.confidence || 0);
    status = playerScoreEvidenceLevel(confidence >= 85 ? "full" : confidence >= 70 ? "derived" : "partial");
    const refs = (item.evidenceRefs || []).map((ref) => `<code>${escapeHtml(ref)}</code>`).join("");
    const rootCause = item.rootCause || model.rootCauseById?.get(String(item.rootCauseId || ""));
    body = `<section class="player-score-evidence-flow">${playerScoreEvidenceFact("时间与位置", `${item.time == null ? "时间待补" : formatTime(item.time)}${item.location ? ` · ${item.location}` : ""}`, "fact")}${playerScoreEvidenceFact("Replay 事实", item.fact || "事实摘要待补", "fact")}${playerScoreEvidenceFact("判断", item.judgment || (item.kind === "strength" ? "这是本场可确认的正向行为。" : "该行为通过当前证据门槛。"), "derived")}${playerScoreEvidenceFact("影响", item.impact || "影响范围尚未量化", "impact")}${playerScoreEvidenceFact(item.kind === "strength" ? "继续保持" : "下一次动作", item.action || "打开对应模块复核", "action")}</section>${playerScoreRootCauseHtml(rootCause)}${refs ? `<section><header>证据引用</header><div class="player-score-evidence-refs">${refs}</div></section>` : ""}`;
  } else if (type === "dimension") {
    heading = item.label;
    status = playerScoreEvidenceLevel(item.score == null ? "missing" : item.source?.confidence >= 85 ? "full" : "derived");
    module = item.module;
    const fallbackFacts = playerScoreFallbackDimensionFacts(model, item.key);
    const facts = item.evidence.length ? item.evidence.map((evidence) => playerScoreEvidenceFact(PLAYER_EVIDENCE_META[evidence.key]?.[0] || evidence.key || "指标", playerEvidenceText(evidence))).join("")
      : `${fallbackFacts.map(([label, value]) => playerScoreEvidenceFact(label, value, "fact")).join("")}${playerScoreEvidenceFact("评分状态", "事实可展示，但当前分析包没有足够门禁生成该维度分", "missing")}`;
    const missing = (item.missing || []).map((key) => `<span>${escapeHtml(PLAYER_SCORE_MISSING_META[key] || key)}</span>`).join("");
    const auditPathMeta = {
      embedded: { label: "已计入基础分", className: "embedded" },
      modifier: { label: "行为修正", className: "modifier" },
      context_only: { label: "仅作上下文", className: "context" },
    };
    const scoringSource = item.scoringComponents.length
      ? item.scoringComponents
      : item.behaviorComponents.filter((component) => component?.insight_id).map((component) => ({
        ...component,
        score_path: "modifier",
        raw_delta: component.raw_impact ?? component.impact,
        applied_delta: component.impact,
      }));
    const behaviorComponents = scoringSource.map((component) => {
      const insight = model.rawInsights.find((candidate) => String(candidate.id) === String(component.insight_id));
      const rootCause = model.rootCauseById?.get(String(component.root_cause_id || insight?.root_cause_id || ""));
      const impact = playerScoreNumber(component.applied_delta);
      const rawImpact = playerScoreNumber(component.raw_delta ?? component.raw_impact ?? component.impact);
      const timeStart = playerScoreNumber(component.time_start ?? insight?.time_start ?? component.jump_target?.time);
      const path = auditPathMeta[component.score_path] || auditPathMeta.context_only;
      const duplicate = component.dedupe_status === "suppressed_duplicate";
      const pathLabel = duplicate ? "同结果已去重" : path.label;
      const evidenceType = rootCause ? "root-score" : "behavior-insight";
      const evidenceId = rootCause?.id || component.insight_id || "";
      return `<button class="player-score-behavior-component ${path.className} ${impact == null ? "neutral" : impact >= 0 ? "positive" : "negative"}" type="button" data-player-score-evidence-type="${evidenceType}" data-player-score-evidence-id="${escapeHtml(evidenceId)}" data-player-score-time="${timeStart ?? 0}">
        <span><small>${timeStart == null ? "全场聚合" : formatTime(timeStart)}${component.location ? ` · ${escapeHtml(component.location)}` : ""}</small><strong>${escapeHtml(component.title || insight?.title || "行为证据")}</strong><em>${escapeHtml(pathLabel)} · 原始 ${rawImpact == null ? "--" : signedValue(rawImpact)} · 实际应用 ${impact == null ? "--" : signedValue(impact)}</em></span>
        <b class="${impact != null && impact >= 0 ? "positive" : "negative"}">${impact == null ? "--" : signedValue(impact)}</b><i data-lucide="chevron-right"></i>
      </button>`;
    }).join("");
    const baseComponents = item.baseComponents.map((component) => `<div class="player-score-base-component"><span><strong>${escapeHtml(component.label || component.key || "基础评分模型")}</strong><small>局部权重 ${Number(component.local_weight || 0)}%</small></span><b>${component.normalized_score == null ? "--" : Number(component.normalized_score).toFixed(2)}</b></div>`).join("");
    const audit = item.scoreAudit;
    const auditText = !audit?.available
      ? "缺失维度不进入综合分"
      : audit.valid
        ? `本地重算一致 · ${audit.baseScore?.toFixed(2)} ${signedValue(audit.componentModifier || 0)} = ${audit.recomputedFinalScore?.toFixed(2)}`
        : `本地重算不一致 · ${(audit.issues || []).join("、")}`;
    body = `<section class="player-score-evidence-score dimension-score-chain"><span><small>基础分</small><strong>${item.baseScore == null ? "--" : Number(item.baseScore).toFixed(2)}</strong></span><span><small>行为修正</small><strong class="${Number(item.behaviorModifier || 0) < 0 ? "negative" : Number(item.behaviorModifier || 0) > 0 ? "positive" : ""}">${signedValue(item.behaviorModifier || 0)}</strong></span><span><small>最终分</small><strong>${item.finalScore == null ? "--" : Number(item.finalScore).toFixed(2)}</strong></span></section>
    <section class="player-score-dimension-audit ${audit?.valid ? "valid" : "invalid"}"><header>本地重算</header><p>${escapeHtml(auditText)}</p><small>位置权重 ${item.roleWeight}% · 有效权重 ${item.effectiveWeight == null ? "--" : `${Number(item.effectiveWeight).toFixed(2)}%`} · 置信度 ${item.confidence == null ? "--" : `${Math.round(item.confidence)}%`}</small></section>
    ${baseComponents ? `<section><header>基础分组件</header><div class="player-score-base-components">${baseComponents}</div></section>` : ""}
    ${behaviorComponents ? `<section><header>评分路径</header><div class="player-score-behavior-components">${behaviorComponents}</div></section>` : ""}
    ${item.comparison ? `<section><header>比较对象</header><div class="player-score-comparison"><strong>${escapeHtml(item.comparison.label || "本场事实")}</strong><small>${escapeHtml(item.comparison.basis || item.comparison.type || "")}</small></div></section>` : ""}
    <section><header>使用事实</header><div class="player-score-evidence-facts">${facts}</div></section>${missing ? `<section><header>缺失字段与门禁</header><div class="player-score-evidence-missing">${missing}</div></section>` : ""}<section><header>评分说明</header><p>${escapeHtml(item.score == null ? "缺失指标不会按 0 分处理，本维度从有效分母移除并降低报告置信度。" : `${item.brief}。最终分由基础分加上通过归责、去重和封顶的行为修正得到。`)}</p>${item.scoreImpact == null ? "" : `<small>对综合分贡献 ${signedValue(item.scoreImpact)}</small>`}</section>`;
  } else if (type === "root-score") {
    heading = item.title || "根因计分审计";
    module = item.jump_target?.module || "timeline";
    time = playerScoreNumber(item.time_start ?? item.jump_target?.time);
    status = playerScoreEvidenceLevel(Number(item.confidence || 0) >= 85 ? "full" : "derived");
    body = `${playerScoreRootCauseHtml(item)}<section><header>计分说明</header><p>同一根因先经过置信度与归责系数，再执行去重、单因封顶、维度封顶和综合封顶。页面显示的“实际应用”可以逐项重算最终分。</p></section>`;
  } else if (type === "advice") {
    heading = item.title;
    status = playerScoreEvidenceLevel(item.legacy || Number(item.confidence || 0) < 70 ? "partial" : Number(item.confidence || 0) >= 85 ? "full" : "derived");
    module = item.module;
    time = item.timeStart;
    const refs = (item.evidence_refs || []).map((ref) => `<code>${escapeHtml(ref)}</code>`).join("") || `<span>旧版报告未保存行为级证据引用</span>`;
    const missing = (item.missing || []).map((value) => `<span>${escapeHtml(value)}</span>`).join("");
    body = `<section class="player-score-evidence-flow">${playerScoreEvidenceFact("事实", item.fact || "事实摘要待补", "fact")}${playerScoreEvidenceFact("判断", item.judgment || "只保留高价值复核", "derived")}${playerScoreEvidenceFact("影响", item.impactText, "impact")}${playerScoreEvidenceFact("下一步动作", item.action || "打开对应模块复核", "action")}</section>${playerScoreRootCauseHtml(item.rootCause)}<section><header>证据引用</header><div class="player-score-evidence-refs">${refs}</div></section>${missing ? `<section><header>缺失字段</header><div class="player-score-evidence-missing">${missing}</div></section>` : ""}`;
  } else if (type === "phase") {
    heading = PLAYER_SCORE_PHASE_META[item.phase] || item.phase || "阶段表现";
    module = item.phase === "laning" ? "development" : "timeline";
    time = item.start;
    status = playerScoreEvidenceLevel(item.score == null ? "missing" : "derived");
    body = `<section class="player-score-evidence-score"><span><small>阶段分</small><strong>${item.score == null ? "--" : Math.round(item.score)}</strong></span><span><small>时间</small><strong>${formatTime(item.start)}-${formatTime(item.end)}</strong></span><span><small>置信度</small><strong>${item.confidence == null ? "--" : `${Math.round(item.confidence)}%`}</strong></span></section><section><header>阶段事实</header><div class="player-score-evidence-facts">${playerScoreEvidenceFact("K / D / A", `${Number(item.kills || 0)} / ${Number(item.deaths || 0)} / ${Number(item.assists || 0)}`)}${playerScoreEvidenceFact("补刀", String(Number(item.last_hits || 0)))}${playerScoreEvidenceFact("经济增长", Number(item.networth_gain || 0).toLocaleString("zh-CN"))}${playerScoreEvidenceFact("英雄伤害", Number(item.damage_dealt || 0).toLocaleString("zh-CN"))}</div></section>`;
  } else if (type === "lane") {
    heading = `${formatTime(item.time)} 对线检查点`;
    module = "development";
    time = Number(item.time);
    status = playerScoreEvidenceLevel("derived");
    body = `<section class="player-score-evidence-score"><span><small>线况分</small><strong>${signedValue(item.score)}</strong></span><span><small>补刀差</small><strong>${signedValue(item.last_hits_diff)}</strong></span><span><small>等级差</small><strong>${item.level_diff == null ? "--" : signedValue(item.level_diff)}</strong></span></section><section><header>对位事实</header><div class="player-score-evidence-facts">${playerScoreEvidenceFact("经验差", item.xp_diff == null ? "--" : signedValue(item.xp_diff))}${playerScoreEvidenceFact("净值差", item.networth_diff == null ? "--" : signedValue(item.networth_diff))}${playerScoreEvidenceFact("判定", (LANE_VERDICT_META[item.verdict] || LANE_VERDICT_META.even).label)}</div></section>`;
  } else if (type === "farm") {
    const meta = farmDecisionMeta(item.decision);
    heading = farmDiagnosticTitle(item.title);
    module = "farm";
    time = Number(item.time);
    status = playerScoreEvidenceLevel(item.recommendation_enabled ? Number(item.confidence || 0) >= 85 ? "full" : "gated" : "partial");
    body = `<section class="player-score-evidence-flow">${playerScoreEvidenceFact("Replay 实际", `${farmOptionName(item.actual)} · ${Number(item.actualGold || 0)} 金`, "fact")}${playerScoreEvidenceFact("程序判断", `${meta.label} · ${escapeHtml(item.reason || "路线事实待复核")}`, "derived")}${playerScoreEvidenceFact("候选影响", item.recommendation_enabled ? `${farmOptionName(item.recommendation)} · ${Number(item.suggestedGold || 0)} 金` : "候选路线门禁未通过", "impact")}${playerScoreEvidenceFact("门禁", item.recommendation_enabled ? `通过 · 置信度 ${Number(item.confidence || 0)}%` : routeBlockerName(item.route_blocker) || "证据不足", "action")}</section>`;
  } else if (type === "combat") {
    const contribution = fightContributions(item).find((row) => Number(row.slot) === Number(model.hero.slot));
    const gate = contribution?.responsibility_gate;
    const gateMeta = responsibilityGateMeta(gate);
    heading = item.title;
    module = "combat";
    time = Number(item.contact_start ?? item.start);
    status = playerScoreEvidenceLevel(gate?.status === "passed" ? "gated" : "partial");
    body = contribution ? `<section class="player-score-evidence-score"><span><small>职责分</small><strong>${gate?.status === "passed" ? Math.round(Number(contribution.responsibilityScore || 0)) : "--"}</strong></span><span><small>在场率</small><strong>${Number(contribution.presencePct || 0)}%</strong></span><span><small>到场</small><strong>+${Number(contribution.arrivalDelay || 0)}s</strong></span></section><section><header>个人贡献</header><div class="player-score-evidence-facts">${playerScoreEvidenceFact("伤害 / 占比", `${Number(contribution.damage || 0).toLocaleString("zh-CN")} / ${Number(contribution.teamDamageShare || 0).toFixed(1)}%`)}${playerScoreEvidenceFact("技能 / 物品", `${Number(contribution.abilityCasts || 0)} / ${Number(contribution.itemUses || 0)}`)}${playerScoreEvidenceFact("控制 / 治疗", `${Number(contribution.controlSeconds || 0).toFixed(1)} 秒 / ${Number(contribution.healing || 0)}`)}${playerScoreEvidenceFact("职责硬门禁", gate ? gateMeta.label : "证据不足", gateMeta.className)}</div></section>` : `<section><p>该战斗有参与者事实，但没有可归属到当前玩家的贡献与职责门禁。</p></section>`;
  } else if (type === "ward") {
    const wardType = wardTypeMeta(item.type);
    const life = Math.max(0, Number(item.endedAt || 0) - Number(item.placedAt || 0));
    heading = `${wardType.name} · ${item.region}`;
    module = "vision";
    time = Number(item.placedAt || 0);
    status = playerScoreEvidenceLevel(item.score == null ? "partial" : "derived");
    body = `<section class="player-score-evidence-score"><span><small>眼位评分</small><strong>${item.score == null ? "--" : Math.round(Number(item.score))}</strong></span><span><small>存活</small><strong>${formatTime(life)}</strong></span><span><small>发现</small><strong>${Number(item.detections || item.detectionEvents?.length || 0)} 次</strong></span></section><section><header>生命周期</header><div class="player-score-evidence-facts">${playerScoreEvidenceFact("放置时间", formatTime(item.placedAt))}${playerScoreEvidenceFact("结束时间", formatTime(item.endedAt))}${playerScoreEvidenceFact("用途", item.purpose === "offense" ? "进攻眼" : item.purpose === "defense" ? "防守眼" : "待判定")}${playerScoreEvidenceFact("结束原因", item.endReason || "待确认")}</div></section>`;
  } else {
    heading = item.text || "个人事件";
    module = item.category === "farm" ? "farm" : item.category === "vision" ? "vision" : item.category === "item" ? "build" : item.category === "combat" ? "combat" : "timeline";
    time = Number(item.time || 0);
    status = playerScoreEvidenceLevel(item.evidence === "事实" ? "full" : "derived");
    body = `<section class="player-score-evidence-flow">${playerScoreEvidenceFact("时间", formatTime(item.time), "fact")}${playerScoreEvidenceFact("事件", item.text || "Replay 事件", "fact")}${playerScoreEvidenceFact("数值", item.value || "--", "impact")}${playerScoreEvidenceFact("位置", item.location || "未知区域", "derived")}</section>`;
  }
  title.textContent = heading;
  stateTag.textContent = status.label;
  stateTag.className = `evidence-tag ${status.className}`;
  root.innerHTML = `${body}<footer><button class="command-button secondary" type="button" data-player-score-jump="${escapeHtml(module)}" ${time == null ? "" : `data-player-score-time="${time}"`}><i data-lucide="external-link"></i><span>前往对应模块</span></button></footer>`;
  refreshIcons(root);
}

function renderPlayerScoreContent(model) {
  const root = document.querySelector("#player-score-content");
  const section = state.playerScoreSection;
  const mode = state.playerScoreMode === "deep" ? "deep" : "brief";
  const panel = document.querySelector(".player-score-main-panel");
  const workspace = document.querySelector(".player-score-workspace");
  const tabs = document.querySelector("#player-score-sections");
  panel?.classList.toggle("brief-mode", mode === "brief");
  panel?.classList.toggle("deep-mode", mode === "deep");
  workspace?.classList.toggle("brief-reading", mode === "brief");
  tabs?.classList.toggle("hidden", mode !== "deep");
  document.querySelectorAll("#player-score-modes [data-player-score-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerScoreMode === mode);
  });
  const modeMeta = document.querySelector("#player-score-mode-meta span");
  if (modeMeta) modeMeta.textContent = mode === "brief"
    ? "一句话结论 · 三个关键时刻 · 一个训练目标"
    : `${model.dimensions.filter((dimension) => dimension.score != null).length}/10 个维度可评分 · 缺失指标不按 0 分`;
  document.querySelectorAll("#player-score-sections [data-player-score-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.playerScoreSection === section);
  });
  const reportLoadError = state.currentAnalysis?.module_load_errors?.players;
  const showUpgrade = section === "overview"
    || (section === "combat" && model.missingCombatTiming);
  const upgradeTitle = model.missingCombatTiming
    ? "当前报告尚无战斗时机分析"
    : model.hasReport ? "当前是旧版玩家报告" : "当前分析包没有玩家评分报告";
  const upgradeDetail = model.missingCombatTiming
    ? "现有评分仍可查看；升级分析后生成空间到场、首次行动和首轮交战事实。"
    : "现有事实仍可查看；重新解析后生成按位置门禁的简报、证据与训练计划。";
  const upgrade = reportLoadError && section === "overview"
    ? `<div class="player-score-upgrade-banner"><i data-lucide="circle-alert"></i><span><strong>玩家评分报告读取失败</strong><small>${escapeHtml(reportLoadError)}；其他已加载事实仍可查看。</small></span><button class="command-button secondary" type="button" data-player-score-retry><i data-lucide="refresh-cw"></i><span>重新读取</span></button></div>`
    : model.needsUpgrade && showUpgrade
      ? `<div class="player-score-upgrade-banner"><i data-lucide="scan-search"></i><span><strong>${upgradeTitle}</strong><small>${upgradeDetail}</small></span>${state.currentMatch ? `<button class="command-button secondary" type="button" data-player-score-reparse><i data-lucide="rotate-cw"></i><span>升级分析</span></button>` : ""}</div>`
      : "";
  if (mode === "brief") {
    root.innerHTML = `${upgrade}${renderPlayerScoreBrief(model)}`;
    installImageFallback(root, heroImage("unknown"));
    refreshIcons(root);
    return;
  }
  const renderer = {
    overview: renderPlayerScoreOverview,
    lane: renderPlayerScoreLane,
    farm: renderPlayerScoreFarm,
    tempo: renderPlayerScoreTempo,
    combat: renderPlayerScoreCombat,
    vision: renderPlayerScoreVision,
    execution: renderPlayerScoreExecution,
    timeline: renderPlayerScoreTimelineTab,
  }[section] || renderPlayerScoreOverview;
  root.innerHTML = `${upgrade}${renderer(model)}`;
  installImageFallback(root, heroImage("unknown"));
  refreshIcons(root);
}

function playerScoreReportIsPending() {
  const analysis = state.currentAnalysis;
  return Boolean(
    analysis
    && !analysis.modules?.players
    && !analysis.module_load_errors?.players
    && analysisModuleAvailable(analysis, "players"),
  );
}

function renderPlayerScoreLoading() {
  const loading = `<div class="player-score-data-gap player-score-module-loading"><span class="is-spinning"><i data-lucide="loader-circle"></i></span><strong>正在读取玩家评分报告</strong><span>先加载本场十人的按位置评分，再补充战斗、路线与视野证据。</span></div>`;
  document.querySelector("#player-score-header").innerHTML = loading;
  renderPlayerScoreRoster();
  document.querySelector("#player-score-content").innerHTML = loading;
  document.querySelector("#player-score-evidence-title").textContent = "评分证据";
  const stateTag = document.querySelector("#player-score-evidence-state");
  stateTag.textContent = "加载中";
  stateTag.className = "evidence-tag aggregate";
  document.querySelector("#player-score-evidence-body").innerHTML = `<div class="player-score-data-gap compact"><span>玩家报告加载完成后可查看事实、判断与建议的对应关系。</span></div>`;
  document.querySelector("#player-score-timeline").innerHTML = "";
  const modeMeta = document.querySelector("#player-score-mode-meta span");
  if (modeMeta) modeMeta.textContent = "正在读取玩家报告";
  refreshIcons(document.querySelector("#detail-player-score"));
}

function renderPlayerScore() {
  if (!document.querySelector("#detail-player-score")) return;
  if (playerScoreReportIsPending()) {
    renderPlayerScoreLoading();
    return;
  }
  const model = playerScoreModel();
  renderPlayerScoreHeader(model);
  renderPlayerScoreRoster();
  renderPlayerScoreContent(model);
  renderPlayerScoreEvidence(model);
  renderPlayerScoreTimeline(model);
}

function syncPlayerScoreTime() {
  const playhead = document.querySelector("#player-score-timeline-playhead");
  if (playhead) playhead.style.left = `${clamp(state.currentTime / Math.max(1, MATCH_DURATION) * 100, 0, 100)}%`;
  const current = document.querySelector("#player-score-timeline-current");
  if (current) current.textContent = formatTime(state.currentTime);
  const marker = document.querySelector("#player-score-content .player-score-current-hero");
  if (marker) {
    const position = positionAtTime(state.currentTime, state.selectedHeroSlot);
    if (position) {
      marker.style.left = `${position.x}%`;
      marker.style.top = `${position.y}%`;
    }
  }
  const visionMap = document.querySelector("#player-score-vision-map-canvas");
  if (visionMap) {
    const wards = WARD_RECORDS.filter((ward) => Number(ward.playerSlot) === Number(state.selectedHeroSlot));
    const wardById = new Map(wards.map((ward) => [String(ward.id), ward]));
    const selectedId = state.selectedPlayerScoreEvidence?.type === "ward" ? String(state.selectedPlayerScoreEvidence.id) : String(state.selectedWardId || "");
    visionMap.querySelectorAll("[data-player-score-ward-id]").forEach((element) => {
      const ward = wardById.get(String(element.dataset.playerScoreWardId));
      if (!ward) return;
      const timeState = wardIsActive(ward) ? "active" : state.currentTime < Number(ward.placedAt || 0) ? "future" : "expired";
      element.classList.remove("active", "future", "expired");
      element.classList.add(timeState);
      element.classList.toggle("selected", String(ward.id) === selectedId);
    });
    visionMap.querySelectorAll("[data-player-score-ward-range-id]").forEach((element) => {
      const ward = wardById.get(String(element.dataset.playerScoreWardRangeId));
      if (!ward) return;
      const timeState = wardIsActive(ward) ? "active" : state.currentTime < Number(ward.placedAt || 0) ? "future" : "expired";
      element.classList.remove("active", "future", "expired", "inactive");
      element.classList.add(timeState, timeState === "active" ? "active" : "inactive");
      element.classList.toggle("selected", String(ward.id) === selectedId);
    });
    visionMap.querySelectorAll("[data-player-score-ward-detection-time]").forEach((element) => {
      const time = Number(element.dataset.playerScoreWardDetectionTime || 0);
      const timeState = Math.abs(state.currentTime - time) <= 12 ? "current" : time <= state.currentTime ? "seen" : "future";
      element.classList.remove("current", "seen", "future");
      element.classList.add(timeState);
    });
    const current = visionMap.querySelector("#player-score-vision-time");
    const active = visionMap.querySelector("#player-score-vision-active");
    if (current) current.textContent = formatTime(state.currentTime);
    if (active) {
      const drawable = wards.filter((ward) => ward.coordinate_valid !== false && Number.isFinite(Number(ward.x)) && Number.isFinite(Number(ward.y)));
      active.textContent = `当前存活 ${drawable.filter((ward) => wardIsActive(ward)).length} · 可定位 ${drawable.length}/${wards.length}`;
    }
  }
}

function jumpFromPlayerScore(moduleName, time) {
  const view = moduleName === "lane" ? "development" : moduleName;
  const selected = state.selectedPlayerScoreEvidence;
  if (view === "combat" && selected?.type === "combat") state.selectedCombatId = selected.id;
  if (view === "farm" && selected?.type === "farm") state.selectedFarmDiagnosticId = selected.id;
  if (view === "vision" && selected?.type === "ward") state.selectedWardId = selected.id;
  if (view === "development") setDevelopmentSideView("lane");
  if (REAL_ANALYSIS_VIEWS.has(view)) setDetailView(view);
  if (Number.isFinite(Number(time))) updateCurrentTime(Number(time), { syncSegment: false });
}

function renderPlayerReportReviewBar() {
  const root = document.querySelector("#player-report-review-bar");
  if (!root) return;
  const review = state.playerReportReviewWindow;
  document.querySelector("#page-detail")?.classList.toggle("has-player-report-review", Boolean(review));
  root.hidden = !review;
  if (!review) return;

  const { navigation } = review;
  const viewLabel = {
    development: "发育复盘",
    farm: "打钱分析",
    vision: "视野分析",
    build: "出装技能",
    combat: "战斗团战",
    timeline: "完整时间轴",
  }[navigation.view] || "比赛复盘";
  const location = navigation.mapFocus?.region
    ? regionName(navigation.mapFocus.region)
    : viewLabel;
  root.classList.toggle("is-problem", review.kind !== "strength");
  document.querySelector("#player-report-review-origin").textContent = review.kind === "strength"
    ? "来自玩家报告 · 做得好"
    : "来自玩家报告 · 主要问题";
  document.querySelector("#player-report-review-title").textContent = review.title || "复盘这一波";
  document.querySelector("#player-report-review-range").textContent =
    `${formatTime(navigation.rangeStart)}-${formatTime(navigation.rangeEnd)}`;
  document.querySelector("#player-report-review-location").textContent = `${location} · ${viewLabel}`;
  syncPlaybackControls();
  refreshIcons(root);
}

function reviewPlayerScoreInsight(insightId, occurrenceIndex = null) {
  const model = playerScoreModel();
  const insight = [
    ...(model.brief?.strengths || []),
    ...(model.brief?.priorities || []),
  ].find((item) => String(item.id) === String(insightId));
  const normalizedIndex = occurrenceIndex == null ? null : Number(occurrenceIndex);
  const occurrence = Number.isInteger(normalizedIndex)
    ? insight?.occurrences?.[normalizedIndex] || null
    : null;
  const reviewTarget = occurrence?.jumpTarget || insight?.jumpTarget;
  if (!reviewTarget?.reviewable) {
    showToast("这一条暂时不能定位", "需要重新解析以生成具体事件、复盘范围和地图位置", "circle-alert");
    return;
  }

  const navigation = resolvePlayerReportReviewNavigation(reviewTarget);
  const reportScrollTop = Number(
    document.querySelector("#player-score-content")?.scrollTop
    ?? document.querySelector(".detail-workspace")?.scrollTop
    ?? 0,
  );
  state.selectedPlayerScoreEvidence = { type: "brief-insight", id: insight.id };
  state.playerReportReviewWindow = {
    insightId: insight.id,
    occurrenceIndex: occurrence ? normalizedIndex : null,
    occurrenceId: occurrence?.id || null,
    kind: insight.kind,
    title: simplifyPlayerReportText(
      occurrence?.label ? `${insight.title} · ${occurrence.label}` : insight.title,
    ),
    fact: simplifyPlayerReportText(insight.fact),
    action: simplifyPlayerReportText(insight.action),
    playerSlot: state.selectedHeroSlot,
    navigation,
    returnContext: {
      ...navigation.returnContext,
      view: "player-score",
      playerScoreMode: state.playerScoreMode,
      playerScoreSection: state.playerScoreSection,
      playerSlot: state.selectedHeroSlot,
      selectedEvidence: { type: "brief-insight", id: insight.id },
      scrollTop: reportScrollTop,
    },
  };

  if (navigation.selectedStateKey && navigation.selectedId) {
    state[navigation.selectedStateKey] = navigation.selectedId;
  }
  if (navigation.view === "combat") {
    state.combatFilter = "all";
    state.selectedCombatPlayerSlot = state.selectedHeroSlot;
  }
  if (navigation.view === "farm") {
    state.farmTimeWindow = Number(navigation.rangeStart) >= 1200 ? "post20" : "pre20";
  }
  if (navigation.view === "vision") {
    state.wardFilters = { team: "all", player: "all", type: "all", purpose: "all" };
  }
  if (navigation.developmentSideView) {
    setDevelopmentSideView(navigation.developmentSideView);
  }

  setPlayerScoreEvidenceOpen(false);
  setDetailView(navigation.view);
  updateCurrentTime(navigation.seekTime, { syncSegment: false });
  renderPlayerReportReviewBar();
  window.requestAnimationFrame(() => {
    if (navigation.view === "combat") {
      renderCombat({ centerSelection: true, scrollBehavior: "smooth" });
    }
    if (navigation.view === "farm") {
      document.querySelector(
        `[data-farm-diagnostic-id="${CSS.escape(String(navigation.selectedId || ""))}"]`,
      )?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (navigation.view === "vision") {
      const ward = WARD_RECORDS.find((item) => String(item.id) === String(navigation.selectedId));
      focusWardOnMap(ward);
    }
  });
}

function returnToPlayerScoreReport() {
  const review = state.playerReportReviewWindow;
  if (!review) return;
  const context = review.returnContext || {};
  if (state.isPlaying) stopPlaybackAt(state.playheadMs);
  if (Number.isFinite(Number(context.playerSlot))
      && Number(context.playerSlot) !== Number(state.selectedHeroSlot)) {
    selectHero(Number(context.playerSlot));
  }
  state.playerScoreMode = context.playerScoreMode === "deep" ? "deep" : "brief";
  state.playerScoreSection = context.playerScoreSection || "overview";
  state.selectedPlayerScoreEvidence = context.selectedEvidence || {
    type: "brief-insight",
    id: review.insightId,
  };
  window.localStorage.setItem(PLAYER_SCORE_MODE_KEY, state.playerScoreMode);
  state.playerReportReviewWindow = null;
  setDetailView("player-score");
  renderPlayerReportReviewBar();
  window.requestAnimationFrame(() => {
    const scrollTop = Number(context.scrollTop || 0);
    const reportContent = document.querySelector("#player-score-content");
    if (reportContent) reportContent.scrollTop = scrollTop;
    const workspace = document.querySelector(".detail-workspace");
    if (workspace) workspace.scrollTop = scrollTop;
  });
}

function togglePlayerReportReviewPlayback() {
  const review = state.playerReportReviewWindow;
  if (!review) return;
  if (state.isPlaying) {
    togglePlayback();
    return;
  }
  updateCurrentTime(review.navigation.rangeStart, { syncSegment: false });
  togglePlayback();
}

function renderCoverage() {
  const analysis = state.currentAnalysis;
  if (!analysis) {
    document.querySelector("#coverage-table").innerHTML = `<div class="coverage-empty"><i data-lucide="database-zap"></i><span>完成本地 Replay 解析后显示真实覆盖率</span></div>`;
    document.querySelector("#coverage-impact-summary").textContent = "等待模块证据";
    document.querySelector("#coverage-impact-list").innerHTML = `<div class="coverage-impact-empty">解析完成后说明哪些结论可确认、哪些结论已受控关闭。</div>`;
    refreshIcons(document.querySelector("#coverage-table"));
    return;
  }
  const coverageStatus = {
    available: ["可用", "full"],
    partial: ["部分", "processing"],
    missing: ["缺失", "failed"],
    invalid: ["无效", "failed"],
    complete: ["可用", "full"],
    derived: ["推导", "aggregate"],
  };
  const rows = (analysis.coverage || []).map((row) => {
    const [statusLabel, statusClass] = coverageStatus[row.status] || ["未知", "processing"];
    return {
      ...row,
      label: COVERAGE_LABELS[row.key] || row.label,
      range: String(row.range || "--").replace(/s$/, " 秒"),
      precision: COVERAGE_PRECISION_ZH[row.precision] || row.precision,
      source: COVERAGE_SOURCE_ZH[row.source] || row.source,
      statusLabel,
      statusClass,
    };
  });
  document.querySelector("#coverage-table").innerHTML = rows.map((row) => `<div class="coverage-row"><strong>${escapeHtml(row.label)}</strong><span>${Number(row.records || 0).toLocaleString("zh-CN")}</span><span>${escapeHtml(row.range || "--")}</span><span>${escapeHtml(row.precision || "--")}</span><span>${escapeHtml(row.source || "--")}</span><span class="data-status ${row.statusClass}">${row.statusLabel}</span></div>`).join("");
  const evidenceByModule = analysis.modules?.module_evidence || {};
  const moduleImpactRows = Object.entries(evidenceByModule)
    .map(([key, evidence]) => coverageImpactFor(key, evidence))
    .filter((impact) => impact.status !== "available" || impact.missing.length > 0);
  const patchImpact = patchCoverageImpact(analysis.match);
  const impactRows = patchImpact ? [...moduleImpactRows, patchImpact] : moduleImpactRows;
  document.querySelector("#coverage-impact-summary").textContent = impactRows.length
    ? `${impactRows.length} 个模块有受控缺口`
    : "所有模块达到当前门槛";
  document.querySelector("#coverage-impact-list").innerHTML = impactRows.length
    ? impactRows.map((impact) => `
      <article class="coverage-impact-card ${escapeHtml(impact.status)}">
        <header><strong>${escapeHtml(impact.label)}</strong><span>${impact.confidence ? `${Math.round(impact.confidence)}% · ` : ""}${impact.missing.length} 项缺口</span></header>
        <p><b>可确认：</b>${escapeHtml(impact.reliable)}</p>
        <p><b>受影响：</b>${escapeHtml(impact.limited)}</p>
        <p><b>已抑制：</b>${escapeHtml(impact.suppressed)}</p>
      </article>
    `).join("")
    : `<div class="coverage-impact-empty">当前模块均达到最低证据门槛，没有额外关闭的分析结论。</div>`;
  const integrityStatus = analysis.integrity?.status;
  document.querySelector("#coverage-complete-label").textContent = integrityStatus === "partial"
    ? "Replay 可用 · 部分结论受限" : analysis.complete ? "完整 Replay" : "数据不完整";
  const coverageLed = document.querySelector(".coverage-score .status-led");
  coverageLed?.classList.toggle("available", integrityStatus !== "partial" && analysis.complete);
  coverageLed?.classList.toggle("checking", integrityStatus === "partial");
  coverageLed?.classList.toggle("unavailable", !analysis.complete);
  document.querySelector("#coverage-object-count").textContent = `${Number(analysis.valid_json_objects || 0).toLocaleString("zh-CN")} 条有效事件 · 错误 ${analysis.invalid_lines || 0}`;
  document.querySelector("#coverage-patch").textContent = patchResolutionLabel(
    analysis.match?.patch_resolution,
    analysis.match?.patch_name || (analysis.match?.patch ? `Patch ID ${analysis.match.patch}` : ""),
  );
  document.querySelector("#coverage-schema").textContent = analysis.schema || "dota-lens/1.0";
  document.querySelector("#coverage-generated-at").textContent = formatGeneratedAt(analysis.generated_at);
}

function renderReplays() {
  const list = document.querySelector("#replay-list");
  document.querySelector("#replay-count").textContent = String(state.replays.length);
  document.querySelector("#replay-complete-count").textContent = String(state.replays.filter((replay) => replay.status === "full").length);
  document.querySelector("#replay-pending-count").textContent = String(state.replays.filter((replay) => replay.status === "processing" || replay.status === "basic").length);
  const knownBytes = state.replays.reduce((sum, replay) => sum + (Number(replay.rawBytes) || 0), 0);
  document.querySelector("#replay-total-size").textContent = knownBytes ? formatBytes(knownBytes) : "0 MB";
  if (!state.replays.length) {
    list.innerHTML = `<div class="match-empty-state"><span class="empty-state-icon"><i data-lucide="folder-clock"></i></span><strong>还没有本地 Replay</strong><p>从比赛列表选择一场自动解析，或导入本地 DEM 文件。</p></div>`;
    refreshIcons(list);
    return;
  }
  list.innerHTML = state.replays.map((replay) => {
    const status = STATUS_META[replay.status] || STATUS_META.basic;
    return `<div class="replay-row"><span class="replay-file-cell"><span class="file-icon"><i data-lucide="file-archive"></i></span><span><strong>${replay.file}</strong><small>比赛 ${replay.id}</small></span></span><span>${replay.size}</span><span>${replay.modified}</span><span>${replay.patch}</span><span class="data-status ${replay.status}">${status.label}</span><span>${replay.package}</span><span class="row-actions"><button class="icon-button quiet replay-action" type="button" data-replay-action="${replay.status === "full" ? "open" : "parse"}" data-replay-id="${replay.id}" title="${replay.status === "full" ? "打开报告" : "开始解析"}"><i data-lucide="${replay.status === "full" ? "arrow-up-right" : "play"}"></i></button><button class="icon-button quiet" type="button" title="更多"><i data-lucide="ellipsis"></i></button></span></div>`;
  }).join("");
  refreshIcons(list);
}

function renderTasks() {
  const panel = document.querySelector("#current-task-panel");
  const job = state.activeJob;
  if (!job) {
    panel.innerHTML = `<div class="task-empty-state"><span class="empty-state-icon"><i data-lucide="activity"></i></span><strong>当前没有解析任务</strong><p>在比赛列表选择任意一场，Dota Lens 会自动获取并解析 Replay。</p><button class="command-button secondary" type="button" data-task-action="matches"><i data-lucide="list-filter"></i><span>返回比赛列表</span></button></div>`;
  } else {
    const [stageLabel, stageDetail] = TASK_STAGE_META[job.stage] || ["处理中", "本地任务运行中"];
    const active = ["queued", "running"].includes(job.status);
    const statusClass = job.status === "completed" ? "positive"
      : job.status === "failed" ? "negative"
        : job.status === "canceled" ? "warning" : "info";
    const transferred = formatBytes(job.bytes_processed);
    const total = formatBytes(job.bytes_total);
    const eventCount = job.result?.event_count ? Number(job.result.event_count).toLocaleString("zh-CN") : "--";
    const retryDetail = job.stage === "waiting_replay_file" && job.retry_attempt
      ? ` · 第 ${Number(job.retry_attempt)} 次重试${job.http_status ? ` · HTTP ${job.http_status}` : ""}` : "";
    const liveDetail = stageDetail;
    const friendlyMessage = job.status === "failed" ? taskErrorMessage(job) : liveDetail;
    const errorDetail = job.status === "failed" ? `<div class="task-error-message"><i data-lucide="circle-alert"></i><span><strong>${escapeHtml(job.error_code || "parse_failed")}</strong>${escapeHtml(friendlyMessage)}</span></div>` : "";
    const updatedAt = Date.parse(job.updated_at || job.created_at || "");
    const stalledSeconds = Number.isFinite(updatedAt) ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : 0;
    const stalled = active && stalledSeconds >= 90;
    const stalledDetail = stalled
      ? `<div class="task-error-message warning"><i data-lucide="timer-off"></i><span><strong>超过 ${Math.floor(stalledSeconds / 60)} 分钟没有进度</strong>任务可能卡在网络、解压或逐帧解析；可以取消，临时文件会自动清理，然后重新解析。</span></div>`
      : "";
    panel.innerHTML = `
      <header class="panel-header"><div><span class="panel-kicker">当前任务</span><h2>比赛 ${job.match_id}</h2></div><span class="result-pill ${statusClass}">${stageLabel}</span></header>
      <div class="task-progress-block">
        <div class="task-progress-copy"><strong>${job.progress || 0}%</strong><span>${escapeHtml(liveDetail + retryDetail)}</span><small>比赛 ${job.match_id} · 本地单任务解析${active ? " · 可随时取消" : ""}</small></div>
        <div class="progress-track"><span style="width:${clamp(job.progress || 0, 0, 100)}%"></span></div>
      </div>
      ${errorDetail}
      ${stalledDetail}
      <div class="task-resource-grid"><span><small>任务阶段</small><strong>${stageLabel}</strong></span><span><small>已处理</small><strong>${transferred}</strong></span><span><small>总大小</small><strong>${total}</strong></span><span><small>有效事件</small><strong>${eventCount}</strong></span></div>
      <div class="task-actions"><button class="command-button secondary" type="button" data-task-action="matches"><i data-lucide="arrow-left"></i><span>返回比赛</span></button>${active ? `<button class="command-button danger" type="button" data-task-action="cancel" data-job-id="${job.id}"><i data-lucide="square"></i><span>取消解析</span></button>` : ""}${["failed", "canceled"].includes(job.status) ? `<button class="command-button" type="button" data-task-action="retry" data-match-id="${job.match_id}"><i data-lucide="rotate-cw"></i><span>重新解析</span></button>` : ""}${job.status === "completed" ? `<button class="command-button" type="button" data-task-action="open" data-match-id="${job.match_id}"><i data-lucide="arrow-up-right"></i><span>打开报告</span></button>` : ""}</div>
    `;
  }

  const tasks = state.taskHistory.filter((task) => !job || task.id !== job.id);
  const list = document.querySelector("#task-list");
  list.innerHTML = tasks.length ? tasks.map((task) => {
    const completed = task.status === "completed";
    const failed = task.status === "failed";
    const canceled = task.status === "canceled";
    const label = completed ? "完成" : failed ? "失败" : canceled ? "已取消" : "处理中";
    const detail = failed ? taskErrorMessage(task)
      : completed ? "本地 Replay 分析已完成" : canceled ? "任务已由用户取消" : "本地解析任务";
    return `<button class="task-row" type="button" data-history-job-id="${task.id}"><span class="task-state-icon ${failed ? "negative" : completed ? "positive" : "warning"}"><i data-lucide="${failed ? "circle-alert" : completed ? "circle-check" : canceled ? "circle-stop" : "clock-3"}"></i></span><span><strong>比赛 ${task.match_id}</strong><small>${escapeHtml(detail)}</small></span><time>${formatGeneratedAt(task.updated_at)}</time><span class="task-size">${task.result?.event_count ? `${Number(task.result.event_count).toLocaleString("zh-CN")} 条` : formatBytes(task.bytes_processed)}</span><span class="data-status ${completed ? "full" : failed ? "failed" : canceled ? "canceled" : "processing"}">${label}</span></button>`;
  }).join("") : `<div class="task-history-empty">已完成、失败或取消的任务会保留在这里</div>`;
  document.querySelector("#task-badge").textContent = job?.status === "running" || job?.status === "queued" ? "1" : "0";
  refreshIcons(list);
  refreshIcons(panel);
}

function updatePlayheadMs(value, options = {}) {
  state.playheadMs = clamp(Math.round(Number(value) || 0), MATCH_START_MS, MATCH_DURATION * 1000);
  state.currentTime = state.playheadMs / 1000;
  document.querySelector("#global-time-slider").value = String(state.playheadMs);
  document.querySelector("#current-time-label").textContent = formatPreciseTimeMs(state.playheadMs);
  if (["development", "map"].includes(state.detailView)) updateMap();
  if (state.detailView === "development") updateChartCursor();
  if (state.detailView === "build") renderBuild();
  if (state.detailView === "vision") syncWardTime();
  if (state.detailView === "farm") syncFarmTime();
  if (state.detailView === "combat") syncCombatPhasePlayhead();
  if (state.detailView === "player-score") syncPlayerScoreTime();

  const currentSegment = SEGMENTS.find((segment) => state.currentTime >= segment.start && state.currentTime <= segment.end);
  if (currentSegment && options.syncSegment !== false) {
    state.selectedSegmentId = currentSegment.id;
    document.querySelectorAll(".segment-row").forEach((row) => row.classList.toggle("active", row.dataset.segmentId === currentSegment.id));
    renderSegmentInspector();
  }
}

function updateCurrentTime(value, options = {}) {
  updatePlayheadMs((Number(value) || 0) * 1000, options);
}

function selectHero(slot) {
  state.selectedHeroSlot = Number(slot);
  state.selectedCombatPlayerSlot = state.selectedHeroSlot;
  state.selectedPlayerScoreEvidence = null;
  if (state.currentAnalysis) hydrateSelectedHeroModules(state.selectedHeroSlot);
  const hero = safeHero(state.selectedHeroSlot);
  renderHeroStrip();
  renderScoreboard();
  renderLaneReview();
  document.querySelector("#map-panel-title").textContent = `${hero.name} · 发育路线`;
  document.querySelector("#page-title").textContent = `${hero.name} · 比赛复盘`;
  renderSegments();
  renderTimelineMarkers();
  renderMapMarkers();
  renderBuild();
  renderCombat();
  if (state.detailView === "player-score") renderPlayerScore();
  if (state.detailView === "development") ensureChart();
  updateCurrentTime(state.currentTime, { syncSegment: false });
  if (state.detailView === "farm") renderFarmAnalysis();
}


function renderDetailView(view) {
  if (view === "development") window.requestAnimationFrame(() => ensureChart());
  if (view === "farm") window.requestAnimationFrame(() => {
    const diagnostic = farmDiagnosticsInSelectedWindow().find((item) => item.id === state.selectedFarmDiagnosticId)
      || farmDiagnosticsInSelectedWindow()[0];
    if (diagnostic && state.farmTimeWindow === "post20" && state.currentTime < 1200) {
      updateCurrentTime(diagnostic.time, { syncSegment: false });
    }
    renderFarmAnalysis();
  });
  if (view === "vision") window.requestAnimationFrame(renderWardAnalysis);
  if (view === "map") window.requestAnimationFrame(() => { renderMapMarkers(); updateMap(); });
  if (view === "build") window.requestAnimationFrame(renderBuild);
  if (view === "combat") window.requestAnimationFrame(() => {
    const fight = COMBAT_SEGMENTS.find((item) => item.id === state.selectedCombatId) || COMBAT_SEGMENTS[0];
    if (fight) {
      state.selectedCombatId = fight.id;
      const reviewStartMs = Number(fight.review_start_ms ?? fight.start * 1000);
      const contactEndMs = Number(fight.contact_end_ms ?? fight.end * 1000);
      if (state.playheadMs < reviewStartMs || state.playheadMs > contactEndMs) {
        updatePlayheadMs(Number(fight.contact_start_ms ?? fight.contact_start * 1000), { syncSegment: false });
      }
    }
    renderCombat();
  });
  if (view === "timeline") window.requestAnimationFrame(filterTimelineEvents);
  if (view === "player-score") window.requestAnimationFrame(renderPlayerScore);
  if (view === "players") window.requestAnimationFrame(renderScoreboard);
  if (view === "coverage") window.requestAnimationFrame(renderCoverage);
}

async function ensureAnalysisModulesForView(view) {
  const analysis = state.currentAnalysis;
  const matchId = state.currentMatch?.id;
  const moduleNames = ANALYSIS_MODULES_BY_VIEW[view] || [];
  const missing = moduleNames.filter((name) => !analysis?.modules?.[name]
    && analysisModuleAvailable(analysis, name));
  if (!analysis || !matchId || !missing.length) return;

  const button = document.querySelector(`[data-detail-view="${view}"]`);
  button?.classList.add("module-loading");
  button?.setAttribute("aria-busy", "true");
  try {
    const batches = view === "player-score" && missing.includes("players")
      ? [["players"], missing.filter((name) => name !== "players")].filter((batch) => batch.length)
      : [missing];
    const failures = [];
    for (const batch of batches) {
      const result = await fetchAnalysisModules(analysis, matchId, batch);
      failures.push(...result.failures);
      if (!result.changed || state.currentAnalysis !== analysis) continue;
      hydrateAnalysisModules(analysis);
      if (result.loaded.some((name) => ["snapshots", "development", "laning", "players"].includes(name))) {
        renderHeroStrip();
        renderLaneReview();
        renderSegments();
      }
      renderTimelineMarkers();
      renderMapMarkers();
      renderWardFilterOptions();
      if (state.detailView === view) renderDetailView(view);
    }
    if (failures.length) {
      const names = failures.map((failure) => failure.name).join("、");
      showToast(
        failures.length === missing.length ? "分析模块读取失败" : "部分证据模块读取失败",
        `${names}；可在当前页面重试`,
        "circle-alert",
      );
      if (state.detailView === view) renderDetailView(view);
    }
  } catch (error) {
    showToast("分析模块读取失败", error.message || "请检查本地解析器", "circle-alert");
  } finally {
    button?.classList.remove("module-loading");
    button?.removeAttribute("aria-busy");
  }
}

function setDetailView(view) {
  if (state.currentAnalysis && !REAL_ANALYSIS_VIEWS.has(view)) {
    showToast("该模块尚未接入真实标准化数据", "当前已开放玩家对比和数据覆盖，原始 JSONL 已保存在本地", "construction");
    view = "coverage";
  }
  state.detailView = view;
  document.querySelectorAll("[data-detail-view]").forEach((button) => button.classList.toggle("active", button.dataset.detailView === view));
  document.querySelectorAll("[data-detail-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.detailPanel === view));
  window.requestAnimationFrame(() => {
    document.querySelector(`[data-detail-view="${view}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  });
  renderDetailView(view);
  void ensureAnalysisModulesForView(view);
  syncTopbarActions();
  renderPlayerReportReviewBar();
  refreshIcons();
}

function setPage(page) {
  state.page = page;
  setDetailMoreOpen(false);
  if (window.innerWidth < 1280 && !state.sidebarCollapsed) setSidebarCollapsed(true, { persist: false });
  document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  const navPage = page === "detail" ? "matches" : page;
  document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === navPage));
  const detailMode = page === "detail";
  document.querySelector("#app-main").classList.toggle("detail-mode", detailMode);
  document.querySelector("#global-statusbar").classList.toggle("hidden", detailMode);
  document.querySelector("#playback-controller").classList.toggle("hidden", !detailMode);
  document.querySelector("#back-to-matches").classList.toggle("hidden", !detailMode);

  const titles = {
    matches: ["比赛", state.matchesStatus === "ready"
      ? `账号 ${state.accountId} · ${state.matchesOffline ? "离线缓存" : "OpenDota 最近比赛"}`
      : "等待连接账号"],
    replays: ["Replay 库", "本地回放与分析包"],
    tasks: ["解析任务", "单任务队列"],
    settings: ["设置", "本地应用配置"],
  };
  if (detailMode) {
    const hero = HEROES[state.selectedHeroSlot];
    document.querySelector("#page-title").textContent = `${hero.name} · 比赛复盘`;
    document.querySelector("#page-context").textContent = `比赛 ${state.currentMatch?.id || "--"} · 本地 Replay`;
  } else {
    document.querySelector("#page-title").textContent = titles[page][0];
    document.querySelector("#page-context").textContent = titles[page][1];
  }
  syncTopbarActions();
  if (detailMode && state.detailView === "development" && !state.currentAnalysis) {
    window.requestAnimationFrame(() => ensureChart());
  }
  refreshIcons();
}

function setSettingsPanel(panelName) {
  const button = document.querySelector(`[data-settings-panel="${panelName}"]`);
  const panel = document.querySelector(`[data-settings-content="${panelName}"]`);
  if (!button || !panel) return;
  state.settingsPanel = panelName;
  document.querySelectorAll("[data-settings-panel]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-settings-content]").forEach((item) => item.classList.toggle("active", item === panel));
  if (panelName === "diagnostics") renderDiagnostics();
}

function maskDiagnosticPath(value) {
  return String(value || "").replace(/^[A-Za-z]:\\Users\\[^\\]+/i, "%USERPROFILE%");
}

function diagnosticRows() {
  const status = state.parserStatus;
  const directories = readDirectorySettings();
  return [
    {
      ok: Boolean(status),
      title: status ? `Parser API ${status.version}` : "Parser API 未连接",
      detail: status ? `PID ${status.pid} · 活跃任务 ${status.active_jobs}` : "检查本地端口 5600",
    },
    {
      ok: Boolean(status?.java_version),
      title: status?.java_version ? `Java ${status.java_version}` : "Java 运行时等待 Parser 报告",
      detail: status?.max_memory_mb ? `最大堆内存 ${status.max_memory_mb} MB` : "未读取到内存上限",
    },
    {
      ok: Boolean(status?.parser),
      title: status?.parser || "Replay Parser 未知",
      detail: status?.started_at ? `启动于 ${formatGeneratedAt(status.started_at)}` : "等待本地服务",
    },
    {
      ok: Boolean(directories.replay),
      title: directories.replay ? "Replay 目录已配置" : "Replay 目录未配置",
      detail: directories.replay ? maskDiagnosticPath(directories.replay) : "可在 Dota 与 Replay 中选择",
    },
    {
      ok: Boolean(status?.data_directory),
      title: status?.data_directory ? "分析数据目录可用" : "分析数据目录等待 Parser 报告",
      detail: status?.data_directory ? maskDiagnosticPath(status.data_directory) : "未读取到本地数据目录",
    },
  ];
}

function renderDiagnostics() {
  const root = document.querySelector("#settings-diagnostics-list");
  if (!root) return;
  const memory = document.querySelector("#settings-parser-memory");
  if (memory) {
    memory.value = state.parserStatus?.max_memory_mb
      ? `${state.parserStatus.max_memory_mb} MB（运行中）`
      : "等待 Parser 状态";
  }
  root.innerHTML = diagnosticRows().map((row) => `
    <span class="${row.ok ? "available" : "unavailable"}">
      <i data-lucide="${row.ok ? "circle-check" : "circle-alert"}"></i>
      <strong>${escapeHtml(row.title)}</strong>
      <small>${escapeHtml(row.detail)}</small>
    </span>
  `).join("");
  refreshIcons(root);
}

function exportDiagnostics() {
  const directories = readDirectorySettings();
  const payload = {
    schema: "dota-lens-diagnostics/1.0",
    generated_at: new Date().toISOString(),
    app: {
      version: APP_VERSION,
      user_agent: navigator.userAgent,
      online: navigator.onLine,
    },
    parser: state.parserStatus || { status: "unavailable" },
    account: {
      account_id: state.accountId || null,
      match_count: state.matches.length,
      match_source: state.matchesOffline ? "local_cache" : "opendota",
      cache_fetched_at: state.matchesFetchedAt,
    },
    directories: Object.fromEntries(
      Object.entries(directories).map(([key, value]) => [key, maskDiagnosticPath(value)]),
    ),
    tasks: state.taskHistory.slice(0, 10).map((job) => ({
      id: job.id,
      match_id: job.match_id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error_code: job.error_code || null,
      updated_at: job.updated_at || null,
    })),
    current_analysis: state.currentAnalysis ? {
      match_id: state.currentMatch?.id || null,
      schema: state.currentAnalysis.schema || null,
      generated_at: state.currentAnalysis.generated_at || null,
      complete: Boolean(state.currentAnalysis.complete),
    } : null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dota-lens-diagnostics-${Date.now()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("诊断信息已导出", "文件不包含原始 Replay、原始事件或完整用户路径", "file-check");
}

function syncTopbarActions() {
  const importButton = document.querySelector("#topbar-import");
  const searchButton = document.querySelector("#global-search-toggle");
  importButton.classList.remove("hidden");
  searchButton.classList.remove("hidden");
  if (state.page === "detail") {
    importButton.innerHTML = `<i data-lucide="rotate-cw"></i><span>重新解析</span>`;
    searchButton.classList.toggle("hidden", !["timeline"].includes(state.detailView));
  } else {
    importButton.innerHTML = `<i data-lucide="file-plus-2"></i><span>导入 Replay</span>`;
  }
  refreshIcons(importButton);
}

function matchSubjectPlayers(analysis) {
  return [...(analysis?.match?.players || [])]
    .filter((player) => Number.isFinite(Number(player.player_slot)))
    .sort((left, right) => Number(left.player_slot) - Number(right.player_slot));
}

function renderMatchSubjectDialog() {
  const analysis = state.pendingSubjectAnalysis;
  if (!analysis) return;
  const players = matchSubjectPlayers(analysis);
  const positions = analysis.modules?.laning?.positions_by_slot || {};
  const pendingSlot = state.pendingSubjectSlot === null
    ? null : Number(state.pendingSubjectSlot);
  const playerRows = players.map((player, index) => {
    const meta = heroMeta(player.hero_id);
    const playerSlot = Number(player.player_slot);
    const position = Number(positions[String(index)]?.position) || index % 5 + 1;
    const selected = pendingSlot !== null && playerSlot === pendingSlot;
    const name = player.personaname || player.name || "匿名玩家";
    return {
      team: playerSlot < 128 ? "radiant" : "dire",
      html: `<button class="match-subject-player ${selected ? "selected" : ""}" type="button" data-match-subject-slot="${playerSlot}" aria-pressed="${selected}">
        <img src="${heroImage(meta.token)}" alt="${escapeHtml(meta.name)}">
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(meta.name)} · ${positionLabel(position)}</small></span>
        <em><b>${Number(player.kills) || 0} / ${Number(player.deaths) || 0} / ${Number(player.assists) || 0}</b>${Number(player.last_hits) || 0} 补 · ${Number(player.denies) || 0} 反</em>
      </button>`,
    };
  });
  document.querySelector("#match-subject-radiant").innerHTML = playerRows
    .filter((row) => row.team === "radiant").map((row) => row.html).join("");
  document.querySelector("#match-subject-dire").innerHTML = playerRows
    .filter((row) => row.team === "dire").map((row) => row.html).join("");

  const selectedPlayer = pendingSlot === null ? null : players.find((player) => (
    Number(player.player_slot) === pendingSlot
  ));
  const selectedMeta = selectedPlayer ? heroMeta(selectedPlayer.hero_id) : null;
  const selection = document.querySelector("#match-subject-selection");
  selection.textContent = selectedPlayer
    ? `已选择：${selectedPlayer.personaname || selectedPlayer.name || "匿名玩家"} · ${selectedMeta.name}`
    : "尚未选择玩家";
  selection.classList.toggle("ready", Boolean(selectedPlayer));
  document.querySelector("#match-subject-confirm").disabled = !selectedPlayer;
  installImageFallback(document.querySelector("#match-subject-dialog"), heroImage("unknown"));
  refreshIcons(document.querySelector("#match-subject-dialog"));
}

function openMatchSubjectDialog(analysis, match, { required = false } = {}) {
  const players = matchSubjectPlayers(analysis);
  if (!players.length) {
    showToast("无法选择分析玩家", "分析包中没有可识别的 Replay 阵容", "circle-alert");
    if (required) setPage("matches");
    return;
  }
  const subject = normalizeMatchSubject(analysis.match, state.accountId);
  const selectedIndex = selectedPlayerIndex(players, subject);
  state.pendingSubjectAnalysis = analysis;
  state.pendingSubjectMatch = match;
  state.pendingSubjectSlot = selectedIndex >= 0
    ? Number(players[selectedIndex].player_slot) : null;
  state.pendingSubjectRequired = required;

  const message = document.querySelector("#match-subject-message");
  message.textContent = required
    ? subject.status === "invalidated"
      ? "录像阵容与上次选择不一致，请重新确认本场使用的英雄。"
      : subject.reason === "account_id_not_provided"
        ? "本次 Replay 未绑定 Steam 数字 ID，请确认本场使用的英雄。"
        : `Steam ID ${state.accountId || "--"} 未出现在录像阵容中，请确认本场使用的英雄。`
    : "选择后会更新这场比赛的“本人”归属和默认分析玩家，不会重新解析 Replay。";
  renderMatchSubjectDialog();
  const dialog = document.querySelector("#match-subject-dialog");
  if (!dialog.open) dialog.showModal();
}

function clearPendingMatchSubject() {
  state.pendingSubjectAnalysis = null;
  state.pendingSubjectMatch = null;
  state.pendingSubjectSlot = null;
  state.pendingSubjectRequired = false;
}

function dismissMatchSubjectDialog() {
  const required = state.pendingSubjectRequired;
  const dialog = document.querySelector("#match-subject-dialog");
  if (dialog.open) dialog.close();
  clearPendingMatchSubject();
  if (required) setPage("matches");
}

async function confirmMatchSubject() {
  const analysis = state.pendingSubjectAnalysis;
  const match = state.pendingSubjectMatch;
  if (state.pendingSubjectSlot === null) return;
  const playerSlot = Number(state.pendingSubjectSlot);
  if (!analysis || !match || !Number.isFinite(playerSlot)) return;
  const confirm = document.querySelector("#match-subject-confirm");
  const previousHtml = confirm.innerHTML;
  const matchId = match.id;
  confirm.disabled = true;
  confirm.innerHTML = `<i data-lucide="loader-circle" class="is-spinning"></i><span>正在保存</span>`;
  refreshIcons(confirm);
  try {
    const subject = await apiFetch(`/matches/${matchId}/subject`, {
      method: "PUT",
      body: { player_slot: playerSlot },
      timeout: 15000,
    });
    analysis.match.subject = subject;
    analysis.match.selected_player_slot = subject.selected_player_slot;
    const resumeDetail = !state.pendingSubjectRequired && state.page === "detail";
    const resumeView = state.detailView;
    const resumeTime = state.currentTime;
    document.querySelector("#match-subject-dialog").close();
    clearPendingMatchSubject();
    hydrateMatchFromAnalysis(match, analysis);
    persistCurrentMatchesCache();
    updateMatchSummary();
    renderMatches();
    applyAnalysisToProduct(analysis, match);
    if (resumeDetail) {
      setDetailView(resumeView);
      updateCurrentTime(resumeTime, { syncSegment: false });
    }
    showToast("分析玩家已更新", "这场比赛会记住你的选择", "circle-check");
  } catch (error) {
    confirm.disabled = false;
    confirm.innerHTML = previousHtml;
    refreshIcons(confirm);
    showToast("无法保存分析玩家", error.message || "请检查本地解析器状态", "circle-alert");
  }
}

function applyAnalysisToProduct(analysis, match) {
  state.analysisModuleLoads.clear();
  state.playerReportReviewWindow = null;
  normalizeAnalysisSnapshots(analysis);
  const players = [...(analysis.match?.players || [])]
    .sort((a, b) => Number(a.player_slot) - Number(b.player_slot));
  const subject = normalizeMatchSubject(analysis.match, state.accountId);
  const selectedIndex = selectedPlayerIndex(players, subject);
  if (selectedIndex < 0) {
    throw new Error("Analysis subject must be selected before opening personal analysis");
  }
  analysis.match.subject = subject;
  analysis.match.selected_player_slot = subject.selected_player_slot;
  state.currentAnalysis = analysis;
  state.currentMatch = match;
  const resolvedPatchLabel = patchResolutionLabel(
    analysis.match?.patch_resolution,
    analysis.match?.patch_name || (analysis.match?.patch ? `ID ${analysis.match.patch}` : ""),
  );
  const replayRecord = {
    id: match.id,
    file: analysis.replay_file || `${match.id}.dem`,
    size: analysis.replay_bytes ? formatBytes(analysis.replay_bytes) : "已缓存",
    modified: formatGeneratedAt(analysis.generated_at),
    patch: resolvedPatchLabel,
    status: "full",
    package: formatBytes(analysis.raw_archive_bytes || analysis.raw_bytes),
    rawBytes: Number(analysis.raw_archive_bytes || analysis.raw_bytes) || 0,
  };
  state.replays = [replayRecord, ...state.replays.filter((replay) => replay.id !== match.id)];
  MATCH_DURATION = Math.max(1, Number(analysis.match?.duration || match.duration || 1));
  if (players.length) {
    const mappedHeroes = players.map((player, index) => {
      const meta = heroMeta(player.hero_id);
      const laning = analysis.modules?.laning?.positions_by_slot?.[String(index)] || {};
      const playerFacts = analysis.modules?.players?.by_slot?.[String(index)] || {};
      return {
        slot: index,
        replaySlot: Number(player.player_slot),
        team: Number(player.player_slot) < 128 ? "radiant" : "dire",
        token: meta.token,
        name: meta.name,
        player: player.personaname || player.name || "匿名玩家",
        me: Number(player.player_slot) === Number(subject.selected_player_slot),
        factor: 1,
        kills: Number(player.kills) || 0,
        deaths: Number(player.deaths) || 0,
        assists: Number(player.assists) || 0,
        lh: Number(player.last_hits) || 0,
        denies: Number(player.denies) || 0,
        networth: Number(player.net_worth) || 0,
        gpm: Number(player.gold_per_min) || 0,
        xpm: Number(player.xp_per_min) || 0,
        damage: Number(player.hero_damage) || 0,
        taken: Number(playerFacts.damage_taken) || 0,
        healing: Number(player.hero_healing) || 0,
        vision: Number(playerFacts.vision_score) || 0,
        position: Number(playerFacts.position || laning.position) || index % 5 + 1,
        lane: laning.lane || "unknown",
        roleConfidence: Number(playerFacts.role_confidence || laning.confidence) || 0,
        facts: playerFacts,
        report: playerFacts.report || null,
      };
    });
    HEROES.splice(0, HEROES.length, ...mappedHeroes);
    state.selectedHeroSlot = selectedIndex;
  }
  hydrateAnalysisModules(analysis);

  const radiantScore = analysis.match?.radiant_score ?? "--";
  const direScore = analysis.match?.dire_score ?? "--";
  const resultBlock = document.querySelector("#detail-result-block");
  resultBlock.classList.toggle("win", match.win);
  resultBlock.classList.toggle("loss", !match.win);
  document.querySelector("#detail-result-label").textContent = match.win ? "胜利" : "失败";
  document.querySelector("#detail-score").textContent = `${radiantScore} : ${direScore}`;
  document.querySelector("#detail-match-id").textContent = match.id;
  document.querySelector("#detail-duration").textContent = formatTime(MATCH_DURATION);
  document.querySelector("#detail-mode").textContent = match.mode;
  document.querySelector("#detail-start-time").textContent = match.date;
  document.querySelector("#detail-start-time-more").textContent = match.date;
  const patchLabel = resolvedPatchLabel;
  document.querySelector("#detail-patch").textContent = patchLabel;
  document.querySelector("#detail-patch-more").textContent = patchLabel;
  document.querySelector("#detail-subject-name").textContent = HEROES[state.selectedHeroSlot]?.player || "--";
  document.querySelector("#detail-data-source").textContent = `本地 Replay · ${Number(analysis.valid_json_objects || 0).toLocaleString("zh-CN")} 条事件`;
  MATCH_START_MS = Math.min(0, Number(analysis.timeline?.game_start_ms || 0));
  document.querySelector("#global-time-slider").min = String(MATCH_START_MS);
  document.querySelector("#global-time-slider").max = String(MATCH_DURATION * 1000);
  document.querySelector("#global-time-slider").step = "50";
  document.querySelector("#playback-total").textContent = `/ ${formatTime(MATCH_DURATION)}`;
  document.querySelectorAll("[data-detail-view]").forEach((button) => {
    const pending = !REAL_ANALYSIS_VIEWS.has(button.dataset.detailView);
    button.classList.toggle("data-pending", pending);
    button.setAttribute("aria-disabled", String(pending));
  });
  renderHeroStrip();
  renderLaneReview();
  setDevelopmentSideView(state.developmentSideView);
  const selectedHero = safeHero(state.selectedHeroSlot);
  document.querySelector("#map-panel-title").textContent = `${selectedHero.name} · 发育路线`;
  document.querySelector("#farm-map-heading").textContent = `${selectedHero.name} · 全场打钱热区`;
  renderSegments();
  renderTimelineMarkers();
  renderMapMarkers();
  renderReplays();
  setPage("detail");
  setDetailView("development");
  updateCurrentTime(0, { syncSegment: false });
}

function hydrateMatchFromAnalysis(match, analysis) {
  const detail = analysis?.match;
  if (!match || !detail) return match;
  const players = Array.isArray(detail.players) ? detail.players : [];
  const subject = normalizeMatchSubject(detail, state.accountId);
  const selectedIndex = selectedPlayerIndex(players, subject);
  if (selectedIndex < 0) return match;
  const selected = players[selectedIndex];
  const refreshed = normalizeMatch({
    ...(match.raw || {}),
    ...detail,
    ...selected,
    match_id: detail.match_id || match.id,
    local_status: "full",
    local_analysis: true,
    local_replay_cache: true,
  });
  Object.assign(match, refreshed, { status: "full", progress: null, localJob: null });
  return match;
}

async function loadAnalysis(match) {
  const analysis = await apiFetch(`/matches/${match.id}/analysis`, { timeout: 60000 });
  const subject = normalizeMatchSubject(analysis.match, state.accountId);
  analysis.match.subject = subject;
  if (selectedPlayerIndex(analysis.match?.players || [], subject) < 0) {
    openMatchSubjectDialog(analysis, match, { required: true });
    return false;
  }
  hydrateMatchFromAnalysis(match, analysis);
  persistCurrentMatchesCache();
  updateMatchSummary();
  renderMatches();
  applyAnalysisToProduct(analysis, match);
  if (analysis.upgrade_required) {
    showToast("已打开旧版分析", "为避免再次超时，本次未同步重建索引；可用“重新解析”升级", "history");
  }
  return true;
}

function rememberTask(job) {
  state.taskHistory = upsertTaskHistory(state.taskHistory, job, 20);
  writeStoredJson(TASK_HISTORY_KEY, state.taskHistory);
}

function updateMatchFromJob(job) {
  const match = state.matches.find((item) => item.id === String(job.match_id));
  if (!match) return null;
  match.progress = Number(job.progress) || 0;
  match.localJob = job;
  match.status = job.status === "completed" ? "full"
    : job.status === "failed" ? "failed"
      : job.status === "canceled" ? "canceled" : "processing";
  persistCurrentMatchesCache();
  updateMatchSummary();
  renderMatches();
  return match;
}

async function finishJob(job) {
  state.activeJob = job;
  rememberTask(job);
  const match = updateMatchFromJob(job);
  renderTasks();
  if (job.status === "completed" && match) {
    showToast("Replay 解析完成", `比赛 ${match.id} 已生成 ${Number(job.result?.event_count || 0).toLocaleString("zh-CN")} 条事件`, "circle-check");
    try {
      await loadAnalysis(match);
    } catch (error) {
      showToast("摘要读取失败", error.message || "请从比赛列表重新打开", "circle-alert");
      setPage("tasks");
    }
  } else if (job.status === "failed") {
    showToast("Replay 解析失败", taskErrorMessage(job), "circle-alert");
    setPage("tasks");
  } else if (job.status === "canceled") {
    showToast("Replay 解析已取消", `比赛 ${job.match_id} 的后台任务已经停止`, "circle-stop");
    setPage("tasks");
  }
}

async function pollJob(jobId) {
  window.clearTimeout(state.jobPollTimer);
  try {
    const job = await apiFetch(`/jobs/${jobId}`, { timeout: 15000 });
    state.activeJob = job;
    rememberTask(job);
    updateMatchFromJob(job);
    renderTasks();
    if (["completed", "failed", "canceled"].includes(job.status)) {
      await finishJob(job);
      return;
    }
    state.jobPollTimer = window.setTimeout(() => pollJob(jobId), 1200);
  } catch (error) {
    if (error.status === 404) {
      const interrupted = {
        ...(state.activeJob || {}),
        id: jobId,
        match_id: state.activeJob?.match_id || state.currentMatch?.id || "unknown",
        status: "failed",
        stage: "failed",
        progress: Number(state.activeJob?.progress || 0),
        message: TASK_ERROR_MESSAGES.job_not_found,
        error_code: "job_not_found",
        updated_at: new Date().toISOString(),
      };
      state.activeJob = interrupted;
      rememberTask(interrupted);
      updateMatchFromJob(interrupted);
      renderTasks();
      showToast("上次解析任务已中断", "可使用本地 Replay 缓存重新解析，不会影响已有报告", "history");
      return;
    }
    showToast("任务状态读取失败", error.message, "wifi-off");
    state.jobPollTimer = window.setTimeout(() => pollJob(jobId), 3000);
  }
}

async function startAutomaticParse(match, force = false) {
  const online = state.parserOnline || await checkParserStatus();
  if (!online) {
    state.matchesError = "本地解析器未启动。请先启动 Dota Lens 本地服务。";
    showToast("本地解析器未连接", "启动服务后再选择比赛", "plug-zap");
    return;
  }
  match.status = "processing";
  match.progress = 2;
  state.currentAnalysis = null;
  state.currentMatch = match;
  setPage("tasks");
  renderMatches();
  try {
    const job = await apiFetch(`/matches/${match.id}/parse`, {
      method: "POST",
      body: { account_id: Number(state.accountId), force },
      timeout: 15000,
    });
    state.activeJob = job;
    rememberTask(job);
    updateMatchFromJob(job);
    renderTasks();
    if (job.status === "completed") await finishJob(job);
    else await pollJob(job.id);
  } catch (error) {
    const failedJob = {
      id: `client-${Date.now()}`,
      match_id: match.id,
      status: "failed",
      stage: "failed",
      progress: 2,
      message: error.message,
      error_code: error.code || "request_failed",
      updated_at: new Date().toISOString(),
    };
    await finishJob(failedJob);
  }
}

async function cancelActiveJob() {
  const job = state.activeJob;
  if (!job?.id || !["queued", "running"].includes(job.status)) return;
  window.clearTimeout(state.jobPollTimer);
  const button = document.querySelector('[data-task-action="cancel"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-circle"></i><span>取消中</span>`;
    refreshIcons(button);
  }
  try {
    const canceled = await apiFetch(`/jobs/${encodeURIComponent(job.id)}`, {
      method: "DELETE",
      timeout: 15000,
    });
    await finishJob(canceled);
  } catch (error) {
    showToast("无法取消解析", error.message || "请检查本地解析器状态", "circle-alert");
    state.jobPollTimer = window.setTimeout(() => pollJob(job.id), 1500);
    renderTasks();
  }
}

function requestMatchOpen(match) {
  if (!match) return;
  const dialog = document.querySelector("#match-open-dialog");
  const meta = STATUS_META[match.status] || STATUS_META.basic;
  const hero = match.hero || safeHero(0);
  const existing = match.status === "full";
  const processing = match.status === "processing";
  const failed = ["failed", "canceled"].includes(match.status);
  state.pendingMatch = match;

  document.querySelector("#match-dialog-kicker").textContent = `比赛 ${match.id} · ${meta.label}`;
  document.querySelector("#match-dialog-title").textContent = existing
    ? "打开这场复盘？"
    : processing
      ? "查看解析进度？"
      : failed
        ? "重新解析这场比赛？"
        : "解析这场比赛？";
  document.querySelector("#match-dialog-summary").innerHTML = `
    <img src="${heroImage(hero.token)}" alt="${escapeHtml(hero.name)}">
    <span><strong>${escapeHtml(hero.name)} · ${match.kills ?? 0} / ${match.deaths ?? 0} / ${match.assists ?? 0}</strong><small>${escapeHtml(match.date || "时间未知")} · ${formatTime(match.duration || 0)} · ${escapeHtml(match.mode || "模式未知")}</small></span>
    <em class="match-dialog-result">${match.win ? "胜利" : "失败"} · ${meta.label}</em>`;
  document.querySelector("#match-dialog-notice").innerHTML = existing
    ? "本机已有完整分析，可直接打开。只有数据异常或解析器升级后，才需要<strong>重新下载并解析 Replay</strong>。"
    : processing
      ? "这场比赛正在本地解析。打开任务页可查看进度；若长时间没有推进，可直接取消后重新解析。"
      : match.recoverable
        ? "检测到上次中断后保留的本地 Replay 缓存。确认后会从解压或逐帧解析阶段继续，不会重复下载。"
        : "确认后将下载该场 Replay，并在本机生成逐秒时间轴。文件较大时会持续数分钟，下载失败会自动重试。";

  const confirm = document.querySelector("#match-dialog-confirm");
  const reparse = document.querySelector("#match-dialog-reparse");
  confirm.dataset.matchAction = processing ? "progress" : existing ? "open" : "parse";
  confirm.innerHTML = processing
    ? `<i data-lucide="list-checks"></i><span>查看进度</span>`
    : existing
      ? `<i data-lucide="book-open-check"></i><span>打开已有复盘</span>`
      : `<i data-lucide="scan-line"></i><span>${failed ? "重新解析" : "开始解析"}</span>`;
  reparse.classList.toggle("hidden", !existing);
  refreshIcons(dialog);
  installImageFallback(document.querySelector("#match-dialog-summary"), heroImage("unknown"));
  if (!dialog.open) dialog.showModal();
}

async function openMatch(match) {
  if (!match) return;
  if (match.status === "full") {
    try {
      await loadAnalysis(match);
    } catch (error) {
      showToast("本地摘要不可用", "将重新解析这场 Replay", "rotate-cw");
      await startAutomaticParse(match, true);
    }
    return;
  }
  if (match.status === "processing" && match.localJob?.id) {
    state.activeJob = match.localJob;
    setPage("tasks");
    renderTasks();
    await pollJob(match.localJob.id);
    return;
  }
  await startAutomaticParse(match, ["failed", "canceled"].includes(match.status));
}

function syncPlaybackControls() {
  const button = document.querySelector("#play-toggle");
  if (button) {
    button.innerHTML = `<i data-lucide="${state.isPlaying ? "pause" : "play"}"></i>`;
    button.title = state.isPlaying ? "暂停" : "播放";
    refreshIcons(button);
  }
  const reviewButton = document.querySelector("[data-player-report-review-play]");
  if (reviewButton) {
    reviewButton.innerHTML = state.isPlaying
      ? '<i data-lucide="pause"></i><span>暂停</span>'
      : '<i data-lucide="play"></i><span>从头播放</span>';
    refreshIcons(reviewButton);
  }
}

function stopPlaybackAt(playheadMs = state.playheadMs) {
  state.isPlaying = false;
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  if (Number.isFinite(Number(playheadMs))) {
    updatePlayheadMs(Number(playheadMs), { syncSegment: false });
  }
  syncPlaybackControls();
}

function togglePlayback() {
  const review = state.playerReportReviewWindow;
  if (!state.isPlaying && review) {
    const rangeStartMs = Number(review.navigation.rangeStart) * 1000;
    const rangeEndMs = Number(review.navigation.rangeEnd) * 1000;
    if (state.playheadMs < rangeStartMs || state.playheadMs >= rangeEndMs) {
      updatePlayheadMs(rangeStartMs, { syncSegment: false });
    }
  }
  state.isPlaying = !state.isPlaying;
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  syncPlaybackControls();
  if (state.isPlaying) {
    state.timer = window.setInterval(() => {
      const nextMs = state.playheadMs + 250 * state.playbackRate;
      const activeReview = state.playerReportReviewWindow;
      const rangeEndMs = Number(activeReview?.navigation?.rangeEnd) * 1000;
      const playbackEndMs = activeReview && Number.isFinite(rangeEndMs)
        ? Math.min(MATCH_DURATION * 1000, rangeEndMs)
        : MATCH_DURATION * 1000;
      if (nextMs >= playbackEndMs) {
        stopPlaybackAt(playbackEndMs);
        return;
      }
      updatePlayheadMs(nextMs);
    }, 250);
  }
}

function jumpToEvent(direction) {
  const times = [...new Set([
    ...SEGMENTS.map((segment) => segment.start),
    ...COMBAT_SEGMENTS.map((fight) => fight.start),
    ...ITEM_EVENTS.map((event) => event.time),
    ...FARM_DIAGNOSTICS.map((diagnostic) => diagnostic.time),
    ...WARD_RECORDS.flatMap((ward) => [ward.placedAt, ...ward.detectionEvents.map((event) => event.time), ward.endedAt]),
    ...OBJECTIVE_EVENTS.map((event) => event.time),
  ])].sort((a, b) => a - b);
  const target = direction > 0 ? times.find((time) => time > state.currentTime) : [...times].reverse().find((time) => time < state.currentTime);
  if (target !== undefined) updateCurrentTime(target);
}

function replayMatchId(fileName) {
  return String(fileName || "").match(/(?:^|[^\d])(\d{8,12})(?:[^\d]|$)/)?.[1] || null;
}

function localReplayMatch(matchId) {
  let match = state.matches.find((item) => item.id === String(matchId));
  if (match) return match;
  match = normalizeMatch({
    match_id: String(matchId),
    player_slot: 0,
    radiant_win: null,
    local_status: "processing",
    local_replay_cache: true,
  });
  match.win = null;
  match.date = "本地 Replay";
  match.mode = "等待解析";
  state.matches.unshift(match);
  return match;
}

function beginReplayImport({ matchId, fileName, size, sourcePath = null, sourceLabel = "本机文件" }) {
  const match = localReplayMatch(matchId);
  match.status = "processing";
  match.progress = 2;
  const replayRow = {
    id: matchId,
    file: fileName,
    size: formatBytes(size),
    rawBytes: Number(size) || 0,
    modified: "正在导入",
    patch: "从 Replay 识别",
    status: "processing",
    package: sourceLabel,
    sourcePath,
  };
  state.replays = [replayRow, ...state.replays.filter((item) => item.id !== matchId)];
  state.activeJob = {
    id: `upload-${matchId}`,
    match_id: matchId,
    status: "running",
    stage: "importing_replay",
    progress: 3,
    message: "正在导入本机 Replay",
    cancelable: false,
  };
  state.currentMatch = match;
  renderMatches();
  renderReplays();
  renderTasks();
  setPage("tasks");
  return { match, replayRow };
}

async function followImportedReplay(job, match) {
  state.activeJob = job;
  state.currentMatch = match;
  rememberTask(job);
  updateMatchFromJob(job);
  renderTasks();
  if (job.status === "completed") await finishJob(job);
  else await pollJob(job.id);
}

async function runReplayImport(replay, importAction) {
  const online = state.parserOnline || await checkParserStatus();
  if (!online) {
    showToast("本地解析器未连接", "启动本地解析器后再导入 Replay", "plug-zap");
    return;
  }

  const { match, replayRow } = beginReplayImport(replay);
  try {
    const job = await importAction();
    replayRow.modified = "刚刚";
    showToast("Replay 已导入", `${replay.fileName} · 开始本地逐帧解析`, "file-check-2");
    await followImportedReplay(job, match);
  } catch (error) {
    const failed = {
      id: `import-${Date.now()}`,
      match_id: replay.matchId,
      status: "failed",
      stage: "failed",
      progress: 3,
      message: error.name === "AbortError" ? "Replay 导入超时" : error.message,
      error_code: error.code || "invalid_replay_file",
      updated_at: new Date().toISOString(),
    };
    await finishJob(failed);
  } finally {
    renderReplays();
  }
}

async function importReplay(file) {
  if (!file) return;
  const matchId = replayMatchId(file.name);
  if (!matchId) {
    showToast("无法识别比赛 ID", "Replay 文件名需要包含比赛数字 ID，例如 8909845275.dem", "circle-alert");
    return;
  }
  if (!/\.dem(?:\.bz2)?$/i.test(file.name)) {
    showToast("文件格式不支持", "请选择 .dem 或 .dem.bz2 Replay", "circle-alert");
    return;
  }
  await runReplayImport({
    matchId,
    fileName: file.name,
    size: file.size,
    sourceLabel: "本机文件",
  }, async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
      const response = await fetch(`${API_BASE}/replays/${matchId}/import`, {
        method: "POST",
        body: file,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Dota-Lens-File-Name": file.name,
          "X-Dota-Lens-Account-Id": validAccountId(state.accountId) ? state.accountId : "",
        },
        signal: controller.signal,
      });
      const text = await response.text();
      const job = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const error = new Error(job.message || `本地服务返回 HTTP ${response.status}`);
        error.code = job.error || "invalid_replay_file";
        throw error;
      }
      return job;
    } finally {
      window.clearTimeout(timeout);
    }
  });
}

async function scanReplayDirectory(button = document.querySelector("#scan-replays")) {
  if (!window.dotaLensDesktop?.scanReplayDirectory) {
    showToast("桌面扫描不可用", "网页预览中请使用“导入文件”；桌面客户端支持扫描 Replay 目录", "monitor-x");
    return;
  }
  const input = document.querySelector("#settings-replay-path");
  const directory = input?.value.trim() || readDirectorySettings().replay || "";
  if (!directory) {
    setPage("settings");
    setSettingsPanel("dota");
    showToast("请先选择 Replay 目录", "设置 > Dota 与 Replay", "folder-open");
    return;
  }

  button.disabled = true;
  button.classList.add("is-spinning");
  try {
    const results = await window.dotaLensDesktop.scanReplayDirectory(directory);
    const previous = new Map(state.replays.map((replay) => [replay.id, replay]));
    state.replays = results.map((replay) => {
      const known = previous.get(replay.matchId);
      const match = state.matches.find((item) => item.id === replay.matchId);
      return {
        id: replay.matchId,
        file: replay.fileName,
        size: formatBytes(replay.size),
        rawBytes: Number(replay.size) || 0,
        modified: formatGeneratedAt(replay.modifiedAt),
        patch: match?.raw?.patch_name || known?.patch || "从 Replay 识别",
        status: match?.status === "full" ? "full" : known?.status || "basic",
        package: match?.status === "full" ? "分析包就绪" : "待解析",
        sourcePath: replay.filePath,
      };
    });
    renderReplays();
    showToast(
      state.replays.length ? "Replay 扫描完成" : "目录中没有 Replay",
      state.replays.length ? `发现 ${state.replays.length} 个可导入文件` : directory,
      "scan-search",
    );
  } catch (error) {
    showToast("Replay 扫描失败", error?.message || "请检查目录是否存在且可读取", "circle-alert");
  } finally {
    button.disabled = false;
    button.classList.remove("is-spinning");
  }
}

async function importScannedReplay(replay) {
  if (!replay?.sourcePath || !window.dotaLensDesktop?.importReplayPath) {
    showToast("无法读取该 Replay", "请重新扫描目录或使用“导入文件”", "circle-alert");
    return;
  }
  await runReplayImport({
    matchId: replay.id,
    fileName: replay.file,
    size: replay.rawBytes,
    sourcePath: replay.sourcePath,
    sourceLabel: "扫描目录",
  }, () => window.dotaLensDesktop.importReplayPath({
    filePath: replay.sourcePath,
    matchId: replay.id,
    accountId: validAccountId(state.accountId) ? state.accountId : "",
  }));
}


function bindEvents() {
  document.querySelector("#sidebar-toggle").addEventListener("click", () => {
    setSidebarCollapsed(!state.sidebarCollapsed);
  });
  document.querySelector("#sidebar-backdrop").addEventListener("click", () => {
    setSidebarCollapsed(true);
  });
  document.querySelector("#detail-more-toggle").addEventListener("click", (event) => {
    event.stopPropagation();
    const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
    setDetailMoreOpen(open);
  });
  document.querySelector("#detail-more-popover").addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setDetailMoreOpen(false));
  document.querySelector("#switch-match-subject").addEventListener("click", () => {
    if (state.currentAnalysis && state.currentMatch) {
      openMatchSubjectDialog(state.currentAnalysis, state.currentMatch);
    }
  });
  document.querySelector("#account-lookup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadMatches(document.querySelector("#account-id-input").value);
  });
  document.querySelector(".primary-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (button) setPage(button.dataset.page);
  });
  document.querySelector("#back-to-matches").addEventListener("click", () => setPage("matches"));
  document.querySelector("#parser-status").addEventListener("click", () => setPage("tasks"));
  document.querySelector("#matches-list").addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-matches]")) {
      loadMatches(state.accountId);
      return;
    }
    if (event.target.closest("[data-import-private-replay]")) {
      document.querySelector("#replay-file-input").click();
      return;
    }
    if (event.target.closest("[data-scan-private-replays]")) {
      setPage("replays");
      void scanReplayDirectory();
      return;
    }
    const row = event.target.closest("[data-match-id]");
    if (row) requestMatchOpen(state.matches.find((match) => match.id === row.dataset.matchId));
  });
  const matchDialog = document.querySelector("#match-open-dialog");
  const closeMatchDialog = () => matchDialog.close();
  document.querySelector("#match-dialog-close").addEventListener("click", closeMatchDialog);
  document.querySelector("#match-dialog-cancel").addEventListener("click", closeMatchDialog);
  document.querySelector("#match-dialog-confirm").addEventListener("click", async (event) => {
    const match = state.pendingMatch;
    const action = event.currentTarget.dataset.matchAction;
    matchDialog.close();
    if (!match) return;
    if (action === "parse") await startAutomaticParse(match, match.status === "failed");
    else await openMatch(match);
  });
  document.querySelector("#match-dialog-reparse").addEventListener("click", async () => {
    const match = state.pendingMatch;
    matchDialog.close();
    if (match) await startAutomaticParse(match, true);
  });
  matchDialog.addEventListener("click", (event) => {
    if (event.target === matchDialog) matchDialog.close();
  });
  matchDialog.addEventListener("close", () => { state.pendingMatch = null; });
  const subjectDialog = document.querySelector("#match-subject-dialog");
  document.querySelector("#match-subject-close").addEventListener("click", dismissMatchSubjectDialog);
  document.querySelector("#match-subject-cancel").addEventListener("click", dismissMatchSubjectDialog);
  document.querySelector("#match-subject-confirm").addEventListener("click", confirmMatchSubject);
  document.querySelector(".match-subject-teams").addEventListener("click", (event) => {
    const player = event.target.closest("[data-match-subject-slot]");
    if (!player) return;
    state.pendingSubjectSlot = Number(player.dataset.matchSubjectSlot);
    renderMatchSubjectDialog();
  });
  subjectDialog.addEventListener("click", (event) => {
    if (event.target === subjectDialog) dismissMatchSubjectDialog();
  });
  subjectDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismissMatchSubjectDialog();
  });
  document.querySelector("#match-status-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.matchFilter = button.dataset.status;
    document.querySelectorAll("#match-status-filter button").forEach((item) => item.classList.toggle("active", item === button));
    renderMatches();
  });
  document.querySelector("#match-search").addEventListener("input", renderMatches);
  document.querySelector("#load-more").addEventListener("click", () => loadMatches(state.accountId));
  document.querySelector("#detail-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail-view]");
    if (button) {
      setDetailView(button.dataset.detailView);
      syncTopbarActions();
    }
  });
  document.querySelector("#coverage-shortcut").addEventListener("click", () => setDetailView("coverage"));
  document.querySelector("#hero-strip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-hero-slot]");
    if (button) selectHero(button.dataset.heroSlot);
  });
  document.querySelector("#development-side-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-development-side]");
    if (button) setDevelopmentSideView(button.dataset.developmentSide);
  });
  document.querySelector("#segment-type-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-segment-type]");
    if (!button) return;
    state.segmentFilter = button.dataset.segmentType;
    document.querySelectorAll("#segment-type-filter button").forEach((item) => item.classList.toggle("active", item === button));
    renderSegments();
  });
  document.querySelector("#segment-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-segment-id]");
    if (!row) return;
    state.selectedSegmentId = row.dataset.segmentId;
    const segment = SEGMENTS.find((item) => item.id === state.selectedSegmentId);
    renderSegments();
    updateCurrentTime(segment.start, { syncSegment: false });
    ensureChart();
  });
  document.querySelector("#metric-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-metric]");
    if (!button) return;
    state.metric = button.dataset.metric;
    document.querySelectorAll("#metric-switch button").forEach((item) => item.classList.toggle("active", item === button));
    ensureChart();
    updateChartCursor();
  });
  document.querySelector("#reset-chart-zoom").addEventListener("click", () => {
    state.chartZoom = [0, 100];
    state.chart?.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
  });
  document.querySelectorAll("[data-dev-layer]").forEach((button) => button.addEventListener("click", () => {
    const layer = button.dataset.devLayer;
    state.devLayers[layer] = !state.devLayers[layer];
    button.classList.toggle("active", state.devLayers[layer]);
    renderMapMarkers();
  }));
  document.querySelectorAll("[data-map-layer]").forEach((input) => input.addEventListener("change", () => {
    state.mapLayers[input.dataset.mapLayer] = input.checked;
    renderMapMarkers();
  }));
  document.querySelectorAll("#development-map-markers, #full-map-markers, #map-event-list").forEach((container) => container.addEventListener("click", (event) => {
    const target = event.target.closest("[data-map-time]");
    if (target) updateCurrentTime(target.dataset.mapTime);
  }));
  document.querySelectorAll("[data-ward-layer]").forEach((button) => button.addEventListener("click", () => {
    const layer = button.dataset.wardLayer;
    state.wardLayers[layer] = !state.wardLayers[layer];
    button.classList.toggle("active", state.wardLayers[layer]);
    renderWardMap();
  }));
  setupWardMapInteractions();
  document.querySelector("#ward-side-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ward-side-view]");
    if (button) setWardSideView(button.dataset.wardSideView);
  });
  document.querySelector("#ward-timeline-toggle").addEventListener("click", () => {
    setWardTimelineCollapsed(!state.wardTimelineCollapsed);
  });
  document.querySelector("#ward-team-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ward-team]");
    if (!button) return;
    state.wardFilters.team = button.dataset.wardTeam;
    document.querySelectorAll("#ward-team-filter button").forEach((item) => item.classList.toggle("active", item === button));
    renderWardAnalysis();
  });
  ["player", "type", "purpose"].forEach((filter) => {
    document.querySelector(`#ward-${filter}-filter`).addEventListener("change", (event) => {
      state.wardFilters[filter] = event.target.value;
      renderWardAnalysis();
    });
  });
  document.querySelector("#ward-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-ward-id]");
    if (row) selectWard(row.dataset.wardId, Number(row.dataset.wardTime));
  });
  document.querySelector("#ward-map-markers").addEventListener("click", (event) => {
    const target = event.target.closest("[data-ward-id]");
    if (!target) return;
    const time = target.dataset.wardDetectionTime ?? target.dataset.wardTime;
    selectWard(target.dataset.wardId, Number(time));
  });
  document.querySelector("#ward-timeline").addEventListener("click", (event) => {
    const target = event.target.closest("[data-ward-id]");
    if (!target) return;
    const time = target.dataset.wardDetectionTime ?? target.dataset.wardTime;
    selectWard(target.dataset.wardId, Number(time));
  });
  document.querySelector("#farm-time-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-farm-window]");
    if (!button) return;
    state.farmTimeWindow = button.dataset.farmWindow;
    const diagnostics = farmDiagnosticsInSelectedWindow();
    const preferred = diagnostics.find((diagnostic) => diagnostic.recommendation_enabled)
      || diagnostics.find((diagnostic) => diagnostic.diagnostic_class === "anomaly")
      || diagnostics[0];
    state.selectedFarmDiagnosticId = preferred?.id || null;
    if (preferred) updateCurrentTime(preferred.time, { syncSegment: false });
    renderFarmAnalysis();
  });
  document.querySelector("#farm-compact-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-farm-compact-view]");
    if (button) setFarmCompactView(button.dataset.farmCompactView);
  });
  document.querySelector("#farm-source-filter").addEventListener("change", (event) => {
    state.farmSource = event.target.value;
    renderFarmMap();
  });
  document.querySelector("#farm-map-expand").addEventListener("click", () => {
    const panel = document.querySelector("#detail-farm");
    const expanded = panel.classList.toggle("map-expanded");
    const button = document.querySelector("#farm-map-expand");
    button.title = expanded ? "退出大地图" : "放大地图";
    button.innerHTML = `<i data-lucide="${expanded ? "minimize-2" : "maximize-2"}"></i>`;
    refreshIcons(button);
  });
  document.querySelector("#farm-units-toggle").addEventListener("click", () => {
    const layout = document.querySelector("#detail-farm .farm-layout");
    const expanded = layout.classList.toggle("units-expanded");
    const button = document.querySelector("#farm-units-toggle");
    button.title = expanded ? "收起击杀单位表" : "展开击杀单位表";
    button.setAttribute("aria-expanded", String(expanded));
    button.innerHTML = `<i data-lucide="${expanded ? "chevron-down" : "chevron-up"}"></i>`;
    refreshIcons(button);
  });
  document.querySelector("#farm-diagnosis-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-farm-diagnostic-id]");
    if (row) selectFarmDiagnostic(row.dataset.farmDiagnosticId);
  });
  document.querySelector("#farm-diagnosis-inspector").addEventListener("click", (event) => {
    const unit = event.target.closest("[data-farm-unit-time]");
    if (unit) updateCurrentTime(Number(unit.dataset.farmUnitTime), { syncSegment: false });
  });
  document.querySelector("#farm-heat-layer").addEventListener("click", (event) => {
    const point = event.target.closest("[data-farm-heat-time]");
    if (point) updateCurrentTime(point.dataset.farmHeatTime, { syncSegment: false });
  });
  document.querySelector("#farm-recommendation-pin").addEventListener("click", () => {
    const diagnostic = FARM_DIAGNOSTICS.find((item) => item.id === state.selectedFarmDiagnosticId);
    if (diagnostic) updateCurrentTime(diagnostic.time, { syncSegment: false });
    showToast("已定位决策点", "虚线仅在模型拥有可用目标坐标且置信度足够时显示", "move-up-right");
  });
  document.querySelector("#farm-team-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-farm-team]");
    if (!button) return;
    state.farmTeam = button.dataset.farmTeam;
    document.querySelectorAll("#farm-team-filter button").forEach((item) => item.classList.toggle("active", item === button));
    renderFarmUnits();
  });
  document.querySelector("#farm-units-body").addEventListener("click", (event) => {
    const row = event.target.closest("[data-farm-player-slot]");
    if (row) selectHero(row.dataset.farmPlayerSlot);
  });
  document.querySelector("#build-tracks").addEventListener("click", (event) => {
    const target = event.target.closest("[data-build-time-ms]");
    if (target) updatePlayheadMs(target.dataset.buildTimeMs);
  });
  document.querySelector("#usage-list").addEventListener("click", (event) => {
    const target = event.target.closest("[data-build-time-ms]");
    if (target) updatePlayheadMs(target.dataset.buildTimeMs);
  });
  document.querySelector("#build-compact-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-build-compact-view]");
    if (button) setBuildCompactView(button.dataset.buildCompactView);
  });
  document.querySelector("#combat-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-combat-id]");
    if (!row) return;
    state.selectedCombatId = row.dataset.combatId;
    state.selectedCombatPhase = "clash";
    renderCombat({ centerSelection: true, scrollBehavior: "smooth" });
    const fight = COMBAT_SEGMENTS.find((item) => item.id === state.selectedCombatId);
    updatePlayheadMs(Number(fight.contact_start_ms ?? fight.contact_start * 1000));
    document.querySelector(".detail-workspace").scrollTop = 0;
  });
  document.querySelector("#combat-filter").addEventListener("change", (event) => {
    state.combatFilter = event.target.value;
    renderCombat();
  });
  document.querySelector("#combat-compact-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-combat-compact-view]");
    if (button) setCombatCompactView(button.dataset.combatCompactView);
  });
  document.querySelector("#combat-map-expand").addEventListener("click", () => {
    const panel = document.querySelector("#detail-combat");
    setCombatMapExpanded(!panel.classList.contains("map-expanded"));
  });
  document.querySelector("#combat-phase-strip").addEventListener("click", (event) => {
    const phase = event.target.closest("[data-combat-phase]");
    if (!phase) return;
    state.selectedCombatPhase = phase.dataset.combatPhase;
    updatePlayheadMs(phase.dataset.combatPhaseTimeMs, { syncSegment: false });
    renderSelectedCombat();
  });
  document.querySelector("#combat-contribution-scope").addEventListener("click", (event) => {
    const button = event.target.closest("[data-combat-contribution-scope]");
    if (!button) return;
    state.combatContributionScope = button.dataset.combatContributionScope === "all" ? "all" : "current";
    renderSelectedCombat();
  });
  document.querySelector("#combat-contribution-metrics").addEventListener("click", (event) => {
    const button = event.target.closest("[data-combat-contribution-metric]");
    if (!button) return;
    state.combatContributionMetric = button.dataset.combatContributionMetric;
    state.selectedCombatContributionDimension = state.combatContributionMetric;
    renderSelectedCombat();
  });
  ["#combat-contribution-labels", "#combat-map-players"].forEach((selector) => {
    document.querySelector(selector).addEventListener("click", (event) => {
      const player = event.target.closest("[data-combat-player-slot]");
      if (!player) return;
      state.selectedCombatPlayerSlot = Number(player.dataset.combatPlayerSlot);
      state.selectedCombatContributionDimension = state.combatContributionMetric;
      state.combatInspectorView = "audit";
      renderSelectedCombat();
      if (window.innerWidth < 1280) setCombatCompactView("audit");
      focusCombatAudit("player");
    });
  });
  document.querySelector("#combat-score-components").addEventListener("click", (event) => {
    const component = event.target.closest("[data-combat-contribution-dimension]");
    if (!component) return;
    state.selectedCombatContributionDimension = component.dataset.combatContributionDimension;
    const fight = selectedCombatFight();
    if (!fight) return;
    renderCombatPlayerAudit(fight, combatContributionRows(fight, fightContributions(fight)));
    focusCombatAudit("dimension");
  });
  document.querySelector("#combat-dimension-detail").addEventListener("click", (event) => {
    const evidence = event.target.closest("[data-combat-evidence-time-ms]");
    if (!evidence) return;
    const fightId = evidence.dataset.combatEvidenceFightId;
    if (fightId && COMBAT_SEGMENTS.some((fight) => String(fight.id) === String(fightId))) {
      state.selectedCombatId = fightId;
      state.selectedCombatPhase = "clash";
      renderSelectedCombat();
    }
    updatePlayheadMs(evidence.dataset.combatEvidenceTimeMs, { syncSegment: false });
    setCombatInspectorView("events");
    if (window.innerWidth < 1280) setCombatCompactView("events");
    const sequence = evidence.dataset.combatEvidenceSeq;
    window.requestAnimationFrame(() => {
      const target = sequence
        ? document.querySelector(`#combat-event-stream [data-event-seq="${CSS.escape(sequence)}"]`)
        : null;
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("evidence-highlight");
      window.setTimeout(() => target.classList.remove("evidence-highlight"), 1800);
    });
  });
  document.querySelector("#combat-inspector-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-combat-inspector]");
    if (!button) return;
    if (window.innerWidth < 1280) setCombatCompactView(button.dataset.combatInspector);
    else setCombatInspectorView(button.dataset.combatInspector);
  });
  document.querySelector("#combat-event-stream").addEventListener("click", (event) => {
    const row = event.target.closest("[data-combat-time-ms]");
    if (row) updatePlayheadMs(row.dataset.combatTimeMs);
  });
  document.querySelector("#combat-context-summary").addEventListener("click", (event) => {
    const row = event.target.closest("[data-combat-context-time-ms]");
    if (row) updatePlayheadMs(row.dataset.combatContextTimeMs);
  });
  document.querySelector("#event-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-filter]");
    if (!button) return;
    state.eventFilter = button.dataset.eventFilter;
    document.querySelectorAll("#event-filter button").forEach((item) => item.classList.toggle("active", item === button));
    filterTimelineEvents();
  });
  document.querySelector("#event-search").addEventListener("input", filterTimelineEvents);
  document.querySelector("#event-table").addEventListener("scroll", renderVirtualEvents, { passive: true });
  document.querySelector("#event-table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-event-time-ms]");
    if (row) updatePlayheadMs(row.dataset.eventTimeMs);
  });
  document.querySelector("#scoreboard-body").addEventListener("click", (event) => {
    const row = event.target.closest("[data-player-slot]");
    if (row) selectHero(row.dataset.playerSlot);
  });
  document.querySelector("#player-report-panel").addEventListener("click", (event) => {
    const view = event.target.closest("[data-player-report-view]");
    if (view) {
      setPlayerReportView(view.dataset.playerReportView);
      return;
    }
    const reparse = event.target.closest("[data-player-report-reparse]");
    if (reparse && state.currentMatch) startAutomaticParse(state.currentMatch, true);
  });
  document.querySelector("#player-score-evidence-toggle").addEventListener("click", () => {
    setPlayerScoreEvidenceOpen(!state.playerScoreEvidenceOpen);
  });
  document.querySelector("#player-score-evidence-close").addEventListener("click", () => {
    setPlayerScoreEvidenceOpen(false);
  });
  document.querySelector("#player-score-evidence-backdrop").addEventListener("click", () => {
    setPlayerScoreEvidenceOpen(false);
  });
  document.querySelector("#player-report-review-bar").addEventListener("click", (event) => {
    if (event.target.closest("[data-player-report-review-play]")) {
      togglePlayerReportReviewPlayback();
      return;
    }
    if (event.target.closest("[data-player-report-review-return]")) {
      returnToPlayerScoreReport();
    }
  });
  document.querySelector("#detail-player-score").addEventListener("click", (event) => {
    const filter = event.target.closest("[data-player-score-roster-filter]");
    if (filter) {
      state.playerScoreRosterFilter = filter.dataset.playerScoreRosterFilter;
      renderPlayerScoreRoster();
      return;
    }
    const mode = event.target.closest("[data-player-score-mode]");
    if (mode) {
      state.playerScoreMode = mode.dataset.playerScoreMode === "deep" ? "deep" : "brief";
      window.localStorage.setItem(PLAYER_SCORE_MODE_KEY, state.playerScoreMode);
      const model = playerScoreModel();
      renderPlayerScoreHeader(model);
      renderPlayerScoreContent(model);
      renderPlayerScoreEvidence(model);
      return;
    }
    const openDimension = event.target.closest("[data-player-score-open-dimension]");
    if (openDimension) {
      state.playerScoreMode = "deep";
      state.playerScoreSection = "overview";
      state.selectedPlayerScoreEvidence = { type: "dimension", id: openDimension.dataset.playerScoreOpenDimension };
      window.localStorage.setItem(PLAYER_SCORE_MODE_KEY, state.playerScoreMode);
      const model = playerScoreModel();
      renderPlayerScoreHeader(model);
      renderPlayerScoreContent(model);
      renderPlayerScoreEvidence(model);
      if (window.innerWidth < 1180) setPlayerScoreEvidenceOpen(true);
      return;
    }
    const section = event.target.closest("[data-player-score-section]");
    if (section) {
      state.playerScoreSection = section.dataset.playerScoreSection;
      state.selectedPlayerScoreEvidence = null;
      const model = playerScoreModel();
      renderPlayerScoreContent(model);
      renderPlayerScoreEvidence(model);
      window.requestAnimationFrame(() => section.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }));
      return;
    }
    const player = event.target.closest("[data-player-score-slot]");
    if (player) {
      selectHero(player.dataset.playerScoreSlot);
      return;
    }
    const reparse = event.target.closest("[data-player-score-reparse]");
    if (reparse && state.currentMatch) {
      startAutomaticParse(state.currentMatch, true);
      return;
    }
    const retry = event.target.closest("[data-player-score-retry]");
    if (retry) {
      if (state.currentAnalysis?.module_load_errors) delete state.currentAnalysis.module_load_errors.players;
      renderPlayerScore();
      void ensureAnalysisModulesForView("player-score");
      return;
    }
    const occurrenceReview = event.target.closest("[data-player-score-review-occurrence]");
    if (occurrenceReview) {
      reviewPlayerScoreInsight(
        occurrenceReview.dataset.playerScoreReviewOccurrence,
        occurrenceReview.dataset.playerScoreOccurrenceIndex,
      );
      return;
    }
    const review = event.target.closest("[data-player-score-review]");
    if (review) {
      reviewPlayerScoreInsight(review.dataset.playerScoreReview);
      return;
    }
    const timingFight = event.target.closest("[data-player-score-combat-timing-fight]");
    if (timingFight) {
      const fightId = timingFight.dataset.playerScoreCombatTimingFight;
      state.selectedPlayerScoreEvidence = { type: "combat", id: fightId };
      state.selectedCombatId = fightId;
      state.selectedCombatPlayerSlot = state.selectedHeroSlot;
      state.combatFilter = "all";
      jumpFromPlayerScore("combat", timingFight.dataset.playerScoreTime);
      window.requestAnimationFrame(() => {
        renderCombat({ centerSelection: true, scrollBehavior: "smooth" });
      });
      return;
    }
    const jump = event.target.closest("[data-player-score-jump]");
    if (jump) {
      jumpFromPlayerScore(jump.dataset.playerScoreJump, jump.dataset.playerScoreTime);
      return;
    }
    const evidence = event.target.closest("[data-player-score-evidence-type]");
    if (evidence) {
      state.selectedPlayerScoreEvidence = {
        type: evidence.dataset.playerScoreEvidenceType,
        id: evidence.dataset.playerScoreEvidenceId,
      };
      if (state.selectedPlayerScoreEvidence.type === "ward") state.selectedWardId = state.selectedPlayerScoreEvidence.id;
      if (Number.isFinite(Number(evidence.dataset.playerScoreTime))) updateCurrentTime(Number(evidence.dataset.playerScoreTime), { syncSegment: false });
      const model = playerScoreModel();
      if (state.playerScoreSection === "vision" && state.selectedPlayerScoreEvidence.type === "ward") renderPlayerScoreContent(model);
      else document.querySelectorAll("#player-score-content [data-player-score-evidence-type]").forEach((item) => item.classList.toggle("active", item === evidence));
      renderPlayerScoreEvidence(model);
      if (state.playerScoreMode === "brief" || window.innerWidth < 1180) setPlayerScoreEvidenceOpen(true);
      return;
    }
    const timeline = event.target.closest("[data-player-score-time]");
    if (timeline) updateCurrentTime(Number(timeline.dataset.playerScoreTime), { syncSegment: false });
  });
  document.querySelector("#global-time-slider").addEventListener("input", (event) => updatePlayheadMs(event.target.value));
  document.querySelector("#play-toggle").addEventListener("click", togglePlayback);
  document.querySelector("#previous-event").addEventListener("click", () => jumpToEvent(-1));
  document.querySelector("#next-event").addEventListener("click", () => jumpToEvent(1));
  document.querySelector("#playback-speed").addEventListener("click", () => {
    const speeds = [0.5, 1, 2, 4];
    state.playbackRate = speeds[(speeds.indexOf(state.playbackRate) + 1) % speeds.length];
    document.querySelector("#playback-speed").textContent = `${state.playbackRate}x`;
  });
  document.querySelector("#timeline-zoom-in").addEventListener("click", () => {
    const center = (state.chartZoom[0] + state.chartZoom[1]) / 2;
    const span = Math.max(10, (state.chartZoom[1] - state.chartZoom[0]) * 0.65);
    state.chartZoom = [clamp(center - span / 2, 0, 100), clamp(center + span / 2, 0, 100)];
    state.chart?.dispatchAction({ type: "dataZoom", start: state.chartZoom[0], end: state.chartZoom[1] });
  });
  document.querySelector("#timeline-zoom-out").addEventListener("click", () => {
    const center = (state.chartZoom[0] + state.chartZoom[1]) / 2;
    const span = Math.min(100, (state.chartZoom[1] - state.chartZoom[0]) * 1.5);
    state.chartZoom = [clamp(center - span / 2, 0, 100), clamp(center + span / 2, 0, 100)];
    state.chart?.dispatchAction({ type: "dataZoom", start: state.chartZoom[0], end: state.chartZoom[1] });
  });

  const fileInput = document.querySelector("#replay-file-input");
  ["#topbar-import", "#import-replay-page"].forEach((selector) => document.querySelector(selector).addEventListener("click", () => {
    if (state.page === "detail" && selector === "#topbar-import") {
      if (state.currentMatch) startAutomaticParse(state.currentMatch, true);
    } else {
      fileInput.click();
    }
  }));
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) void importReplay(fileInput.files[0]);
    fileInput.value = "";
  });
  document.querySelector("#scan-replays").addEventListener("click", (event) => {
    void scanReplayDirectory(event.currentTarget);
  });
  document.querySelector("#replay-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-replay-action]");
    if (!button) return;
    const replay = state.replays.find((item) => item.id === button.dataset.replayId);
    const match = state.matches.find((item) => item.id === button.dataset.replayId);
    if (button.dataset.replayAction === "open" && match) {
      void openMatch(match);
    } else if (replay?.sourcePath) {
      void importScannedReplay(replay);
    } else {
      fileInput.click();
    }
  });
  document.querySelector("#current-task-panel").addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-action]");
    if (!button) return;
    if (button.dataset.taskAction === "matches") setPage("matches");
    if (button.dataset.taskAction === "cancel") {
      cancelActiveJob();
      return;
    }
    const match = state.matches.find((item) => item.id === button.dataset.matchId);
    if (button.dataset.taskAction === "retry" && match) startAutomaticParse(match, true);
    if (button.dataset.taskAction === "open" && match) openMatch(match);
  });
  document.querySelector("#task-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-history-job-id]");
    if (!row) return;
    const job = state.taskHistory.find((item) => item.id === row.dataset.historyJobId);
    if (job) {
      state.activeJob = job;
      renderTasks();
    }
  });
  document.querySelector("#settings-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-panel]");
    if (!button) return;
    setSettingsPanel(button.dataset.settingsPanel);
  });
  document.querySelector(".settings-content").addEventListener("click", (event) => {
    const picker = event.target.closest("[data-directory-picker]");
    if (picker) chooseSettingsDirectory(picker);
  });
  document.querySelectorAll("[data-settings-path]").forEach((input) => input.addEventListener("change", () => {
    const value = input.value.trim();
    input.value = value;
    if (value) persistDirectorySetting(input.dataset.settingsPath, value);
  }));
  document.querySelector("#settings-verify-account").addEventListener("click", () => {
    setPage("matches");
    loadMatches(document.querySelector("#settings-account-id").value);
  });
  document.querySelector("#settings-export-diagnostics").addEventListener("click", exportDiagnostics);
  document.querySelector("#topbar-refresh").addEventListener("click", async (event) => {
    event.currentTarget.classList.add("is-spinning");
    await checkParserStatus();
    if (state.matchesStatus === "ready") await loadMatches(state.accountId, { silent: true });
    event.currentTarget.classList.remove("is-spinning");
  });
  document.querySelector("#global-search-toggle").addEventListener("click", () => {
    const input = state.page === "detail" && state.detailView === "timeline" ? document.querySelector("#event-search") : document.querySelector("#match-search");
    input?.focus();
  });
  document.querySelector("#account-menu").addEventListener("click", () => {
    setPage("matches");
    document.querySelector("#account-id-input").focus();
    document.querySelector("#account-id-input").select();
  });
  document.querySelector("#match-filter-button").addEventListener("click", () => showToast("筛选已展开", "日期与模式筛选位于当前工具栏", "sliders-horizontal"));
  document.querySelector("#focus-map").addEventListener("click", () => {
    updateMap();
    showToast("已定位当前英雄", `${HEROES[state.selectedHeroSlot].name} · ${formatTime(state.currentTime)}`, "locate-fixed");
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    document.querySelector("#drop-overlay").classList.remove("hidden");
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth -= 1;
    if (dragDepth <= 0) document.querySelector("#drop-overlay").classList.add("hidden");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    document.querySelector("#drop-overlay").classList.add("hidden");
    if (event.dataTransfer?.files?.[0]) void importReplay(event.dataTransfer.files[0]);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDetailMoreOpen(false);
      if (state.playerScoreEvidenceOpen) setPlayerScoreEvidenceOpen(false);
      if (state.wardMapExpanded) setWardMapExpanded(false);
      if (window.innerWidth < 1280 && !state.sidebarCollapsed) setSidebarCollapsed(true);
    }
    if (state.page !== "detail" || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateCurrentTime(state.currentTime - (event.shiftKey ? 5 : 1));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      updateCurrentTime(state.currentTime + (event.shiftKey ? 5 : 1));
    }
  });
  window.addEventListener("resize", () => {
    applySidebarLayout();
    if (window.innerWidth >= 1180 && state.playerScoreEvidenceOpen) setPlayerScoreEvidenceOpen(false);
    const chartContainer = document.querySelector("#development-chart");
    if (state.chart && chartContainer?.clientWidth > 1 && chartContainer?.clientHeight > 1) state.chart.resize();
    const contributionChart = document.querySelector("#combat-contribution-chart");
    if (state.combatContributionChart
      && contributionChart?.clientWidth > 1
      && contributionChart?.clientHeight > 1) {
      state.combatContributionChart.resize();
    }
    const responsibilityRadar = document.querySelector("#combat-responsibility-radar");
    if (state.combatResponsibilityRadar
      && responsibilityRadar?.clientWidth > 1
      && responsibilityRadar?.clientHeight > 1) {
      state.combatResponsibilityRadar.resize();
    }
    if (state.page === "detail" && state.detailView === "combat") {
      window.requestAnimationFrame(() => resolveCombatMarkerCollisions(document.querySelector("#combat-map-players")));
    }
    if (state.page === "detail" && state.detailView === "vision") {
      window.requestAnimationFrame(applyWardMapTransform);
    }
  });
}

async function init() {
  restoreDirectorySettings();
  applyScoreboardStressFixture();
  applySidebarLayout();
  setWardSideView(state.wardSideView);
  setWardTimelineCollapsed(state.wardTimelineCollapsed, { persist: false });
  setFarmCompactView(state.farmCompactView);
  setBuildCompactView(state.buildCompactView);
  setCombatCompactView(state.combatCompactView);
  setPlayerScoreEvidenceOpen(false);
  renderMatches();
  renderReplays();
  renderTasks();
  bindEvents();
  setupCombatChartResizeObserver();
  setPage("matches");
  updateAccountChrome();
  refreshIcons();
  if (PREVIEW_VIEW) {
    if (PREVIEW_VIEW === "matches") {
      state.accountId = "123456789";
      state.matches = DEMO_MATCHES;
      state.matchesStatus = "ready";
      updateAccountChrome();
      updateMatchSummary();
      renderMatches();
      setPage("matches");
      return;
    }
    if (PREVIEW_VIEW === "replays" || PREVIEW_VIEW === "tasks") {
      setPage(PREVIEW_VIEW);
      return;
    }
    if (PREVIEW_VIEW === "settings") {
      setPage("settings");
      setSettingsPanel(PREVIEW_SETTINGS_PANEL);
      return;
    }
    if (PREVIEW_MATCH_ID) {
      const online = await checkParserStatus();
      if (!online) throw new Error("真实比赛预览需要本地解析器在线");
      const analysis = await apiFetch(`/matches/${PREVIEW_MATCH_ID}/analysis`, { timeout: 60000 });
      const players = Array.isArray(analysis.match?.players) ? analysis.match.players : [];
      const subject = normalizeMatchSubject(analysis.match, state.accountId);
      const selectedIndex = selectedPlayerIndex(players, subject);
      const player = selectedIndex >= 0 ? players[selectedIndex] : {};
      const match = normalizeMatch({
        ...analysis.match,
        ...player,
        match_id: PREVIEW_MATCH_ID,
        local_status: "full",
      });
      document.documentElement.dataset.qaMatchLoaded = PREVIEW_MATCH_ID;
      if (selectedIndex < 0) {
        openMatchSubjectDialog(analysis, match, { required: true });
        return;
      }
      applyAnalysisToProduct(analysis, match);
      setDetailView(["development", "farm", "vision", "combat", "player-score", "players"].includes(PREVIEW_VIEW) ? PREVIEW_VIEW : "farm");
      return;
    }
    state.currentMatch = { ...DEMO_MATCHES[0], id: "preview" };
    renderHeroStrip();
    renderLaneReview();
    setDevelopmentSideView(state.developmentSideView);
    renderSegments();
    renderTimelineMarkers();
    renderMapMarkers();
    renderWardFilterOptions();
    setPage("detail");
    setDetailView(["development", "farm", "vision", "combat", "player-score", "players"].includes(PREVIEW_VIEW) ? PREVIEW_VIEW : "farm");
    updateCurrentTime(state.currentTime, { syncSegment: false });
    return;
  }
  const online = await checkParserStatus();
  state.parserPollTimer = window.setInterval(() => checkParserStatus({ retries: 0 }), 10000);
  if (online && state.activeJob?.id) {
    renderTasks();
    void pollJob(state.activeJob.id);
  }
  if (online && validAccountId(state.accountId)) {
    await loadMatches(state.accountId, { silent: true });
  } else if (online) {
    document.querySelector("#account-id-input").focus();
  }
}

init().catch((error) => {
  console.error(error);
  showToast("应用初始化失败", error.message || "请刷新后重试", "circle-alert");
});
