import * as echarts from "echarts";
import { createIcons, icons } from "lucide";
import { GAME_MODES_ZH, heroMeta } from "./hero-meta.js";
import { OFFICIAL_ABILITY_NAMES_ZH, OFFICIAL_ITEM_NAMES_ZH } from "./dota-localization.generated.js";

const API_BASE = "http://127.0.0.1:5600/api";
const APP_PARAMS = new URLSearchParams(window.location.search);
const PREVIEW_VIEW = APP_PARAMS.get("preview");
const PREVIEW_MATCH_ID = /^\d+$/.test(APP_PARAMS.get("qaMatch") || "") ? APP_PARAMS.get("qaMatch") : null;
const PREVIEW_MAP_FOCUS = APP_PARAMS.get("mapFocus") === "1";
const PREVIEW_SCOREBOARD_STRESS = APP_PARAMS.get("scoreboardStress") === "1";
const PREVIEW_SETTINGS_PANEL = APP_PARAMS.get("settingsPanel") || "dota";
const DEFAULT_ACCOUNT_ID = window.localStorage.getItem("dota-lens-account-id") || "";
const DIRECTORY_SETTINGS_KEY = "dota-lens-directory-settings-v1";
const REAL_ANALYSIS_VIEWS = new Set(["development", "farm", "map", "vision", "build", "combat", "timeline", "players", "coverage"]);
const ANALYSIS_MODULES_BY_VIEW = {
  development: [],
  farm: ["farm", "vision"],
  map: ["farm", "vision", "combat"],
  vision: ["vision"],
  build: ["build"],
  combat: ["combat", "vision"],
  timeline: ["timeline"],
  players: [],
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

const GOLDEN_LABEL_META = {
  poke: { label: "消耗", tone: "info" },
  trade: { label: "换血", tone: "warning" },
  pickoff: { label: "抓单", tone: "negative" },
  skirmish: { label: "小规模冲突", tone: "warning" },
  teamfight: { label: "团战", tone: "negative" },
  non_combat: { label: "非战斗", tone: "neutral" },
};

const GOLDEN_MODEL_LABEL_ALIASES = {
  harass: "poke",
  lane_trade: "trade",
  small_skirmish: "skirmish",
};

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

const GOLDEN_TAG_META = {
  lane: "线上",
  zero_death: "无死亡逼退",
  long_chase: "长追击",
  simultaneous: "双地点冲突",
  roshan: "肉山",
  highground: "高地",
  illusion: "幻象",
  buyback: "买活",
  vision_advantage: "视野优势",
  objective: "目标争夺",
  forced_retreat: "强制撤退",
};

const GOLDEN_ANNOTATOR_META = {
  primary: "标注员 A",
  secondary: "标注员 B",
  adjudicated: "仲裁结果",
};

const GOLDEN_RAW_COMBAT_KINDS = new Set(["hero_death", "damage", "control", "ability_use", "item_use", "heal"]);

function isGoldenRawCombatEvent(event) {
  return event?.category === "combat" || GOLDEN_RAW_COMBAT_KINDS.has(event?.kind);
}

const state = {
  page: "matches",
  accountId: DEFAULT_ACCOUNT_ID,
  matches: [],
  matchesStatus: "idle",
  matchesError: "",
  parserOnline: false,
  currentMatch: null,
  currentAnalysis: null,
  activeJob: null,
  taskHistory: [],
  jobPollTimer: null,
  parserPollTimer: null,
  detailView: "development",
  matchFilter: "all",
  eventFilter: "all",
  segmentFilter: "all",
  settingsPanel: "account",
  selectedHeroSlot: 0,
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
  selectedCombatPhase: "clash",
  pendingMatch: null,
  golden: {
    matches: [],
    matchId: "",
    annotator: "primary",
    document: null,
    analysis: null,
    selectedEventId: null,
    currentTimeMs: 0,
    blind: true,
    dirty: false,
    evaluation: null,
    evaluationScope: "match",
    model: null,
    density: [],
    densityPeaks: [],
    densityWindowSeconds: 0,
    signalsExpanded: false,
    mapFocused: PREVIEW_MAP_FOCUS,
    evaluationExpanded: false,
    loading: false,
  },
};

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
  return `/assets/heroes/${token}.png`;
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
  gpm: ["GPM", "per_minute"],
  networth: ["净值", "gold"],
  hero_damage: ["英雄伤害", "damage"],
  fight_score: ["战斗执行", "score"],
  deaths: ["阵亡", "count"],
  dead_seconds: ["死亡时长", "seconds"],
  tower_damage: ["建筑伤害", "damage"],
  damage_taken: ["承受伤害", "damage"],
  observer_wards: ["侦查守卫", "count"],
  sentry_wards: ["岗哨守卫", "count"],
  dewards: ["排眼", "count"],
  teamfight_participation: ["战斗参与率", "percent"],
  control_seconds: ["控制时长", "seconds"],
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
  createIcons({ icons, attrs: { "aria-hidden": "true" }, root });
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
  parse_failed: "本地解析失败，请查看解析器日志。",
  request_failed: "无法创建本地解析任务，请检查解析器连接。",
  request_timeout: "本地服务请求超时；任务可能仍在运行，请到任务页查看或取消。",
};

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
  if (module?.schema !== "snapshot-columns/1.0") return module || {};
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
  if (snapshots?.schema === "snapshot-columns/1.0") {
    analysis.modules.snapshots = decodeSnapshotColumns(snapshots);
  }
  return analysis;
}

function analysisModuleAvailable(analysis, moduleName) {
  const available = analysis?.analysis_storage?.available_modules;
  return Array.isArray(available) && available.includes(moduleName);
}

async function fetchAnalysisModules(analysis, matchId, moduleNames) {
  if (!analysis?.modules) return false;
  const missing = [...new Set(moduleNames)].filter((name) => !analysis.modules[name]
    && analysisModuleAvailable(analysis, name));
  if (!missing.length) return false;
  await Promise.all(missing.map(async (name) => {
    const key = `${matchId}:${analysis.generated_at || "current"}:${name}`;
    let request = state.analysisModuleLoads.get(key);
    if (!request) {
      request = apiFetch(`/matches/${matchId}/analysis/modules/${name}`, { timeout: 60000 });
      state.analysisModuleLoads.set(key, request);
    }
    analysis.modules[name] = await request;
  }));
  normalizeAnalysisSnapshots(analysis);
  return true;
}

function normalizeMatch(raw) {
  const hero = heroMeta(raw.hero_id);
  const isRadiant = Number(raw.player_slot) < 128;
  const win = isRadiant ? Boolean(raw.radiant_win) : !Boolean(raw.radiant_win);
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
  document.querySelector("#sidebar-account-detail").textContent = connected ? "最近比赛已同步" : "输入 Steam 数字 ID";
  if (state.page === "matches") {
    document.querySelector("#page-context").textContent = connected ? `账号 ${accountId} · OpenDota 最近比赛` : "等待连接账号";
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
      setParserStatus(true, `就绪 · v${status.version}`);
      return true;
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }
  setParserStatus(false);
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
  renderMatches();
  updateAccountChrome();
  const lookupButton = document.querySelector("#account-lookup-button");
  lookupButton.disabled = true;
  lookupButton.innerHTML = `<i data-lucide="loader-circle"></i><span>读取中</span>`;
  refreshIcons(lookupButton);
  try {
    const payload = await apiFetch(`/players/${normalized}/matches`);
    state.matches = (payload.matches || []).map(normalizeMatch);
    state.matchesStatus = "ready";
    window.localStorage.setItem("dota-lens-account-id", normalized);
    document.querySelector("#background-status").textContent = `最近同步：${formatGeneratedAt(payload.fetched_at)}`;
    updateAccountChrome();
    updateMatchSummary();
    renderMatches();
    if (!options.silent) showToast("比赛列表已更新", `读取到 ${state.matches.length} 场最近比赛`, "list-checks");
  } catch (error) {
    state.matches = [];
    state.matchesStatus = "error";
    const parserAvailable = await checkParserStatus({ retries: 0 });
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
  replaceArray(FARM_DIAGNOSTICS, diagnosticRows.map((diagnostic) => ({
    ...diagnostic,
    reason: farmDiagnosticReason(diagnostic),
  })));
  Object.assign(FARM_MECHANICS, modules.farm?.mechanics || {});
  replaceArray(FARM_STACK_EVENTS, (modules.farm?.stack_events_by_slot?.[key] || []).map((event) => ({ ...event, region: regionName(event.region) })));
  replaceArray(FARM_LANE_JUNGLE_CYCLES, modules.farm?.lane_jungle_cycles_by_slot?.[key] || []);

  if (!FARM_CAMP_STATES.length) {
    replaceArray(CAMP_MARKERS, segments.filter((segment) => segment.type === "farm" && segment.x != null).map((segment) => ({
      time: segment.start, x: segment.x, y: segment.y, type: "camp", title: `${segment.region}资源段`,
    })));
  }

  state.selectedSegmentId = SEGMENTS[0]?.id || null;
  state.selectedFarmDiagnosticId = FARM_DIAGNOSTICS[0]?.id || null;
}

function hydrateAnalysisModules(analysis) {
  normalizeAnalysisSnapshots(analysis);
  const modules = analysis?.modules;
  if (!modules) throw new Error("分析包缺少产品模块，请重新解析这场比赛");
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
  if (FARM_CAMP_STATES.length) {
    replaceArray(CAMP_MARKERS, FARM_CAMP_STATES
      .filter((camp) => camp.coordinate_valid !== false && Number.isFinite(Number(camp.x)) && Number.isFinite(Number(camp.y)))
      .map((camp) => ({
        time: Number(camp.first_observed || 0),
        x: Number(camp.x),
        y: Number(camp.y),
        type: "camp",
        title: `野点实体 · ${regionName(camp.region)}`,
        camp,
      })));
  }

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

  if (!FARM_CAMP_STATES.length) {
    replaceArray(CAMP_MARKERS, SEGMENTS.filter((segment) => segment.type === "farm" && segment.x != null).map((segment) => ({ time: segment.start, x: segment.x, y: segment.y, type: "camp", title: `${segment.region}资源段` })));
  }
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
    return `
      <button class="match-row match-row-${match.status}" type="button" role="listitem" data-match-id="${match.id}" aria-label="${escapeHtml(match.hero.name)} ${match.win ? "胜利" : "失败"}，${meta.label}">
        <span class="match-identity">
          <img src="${heroImage(match.hero.token)}" alt="${escapeHtml(match.hero.name)}">
          <span><strong><b class="match-result ${match.win ? "positive" : "negative"}">${match.win ? "胜利" : "失败"}</b>${escapeHtml(match.hero.name)}</strong><small>${escapeHtml(match.date)} · ${escapeHtml(match.mode)}</small></span>
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
  resultCount.textContent = `显示 ${filtered.length} / ${state.matches.length} 场比赛`;
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
  return `<button class="map-pin ${marker.type}" type="button" data-map-time="${marker.time}" style="left:${marker.x}%;top:${marker.y}%" title="${formatTime(marker.time)} · ${marker.title}"><i data-lucide="${icon}"></i></button>`;
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
  const counts = {
    "map-layer-trail-count": `${snapshotsFor(state.selectedHeroSlot).length.toLocaleString("zh-CN")} 点`,
    "map-layer-heat-count": `${FARM_HEAT_CELLS.length} 区`,
    "map-layer-camps-count": `${CAMP_MARKERS.length} 段`,
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
        const start = (ward.placedAt / MATCH_DURATION) * 100;
        const width = ((ward.endedAt - ward.placedAt) / MATCH_DURATION) * 100;
        return `
          <div class="ward-track-row ${ward.id === state.selectedWardId ? "active" : ""} ${wardIsActive(ward) ? "live-now" : ""}" data-ward-row-id="${ward.id}">
            <button class="ward-track-label" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}" title="${hero.name} · ${ward.region}"><img src="${itemImage(meta.item)}" alt="${meta.label}"><span><strong>${hero.name}</strong><small>${ward.region}</small></span></button>
            <div class="ward-track-lane">
              <button class="ward-life-bar ${ward.team} ${ward.type}" type="button" data-ward-id="${ward.id}" data-ward-time="${ward.placedAt}" style="left:${start}%;width:${width}%" title="${formatTime(ward.placedAt)} - ${formatTime(ward.endedAt)} · ${ward.endReason}"><span>${formatTime(ward.endedAt - ward.placedAt)}</span></button>
              ${ward.detectionEvents.map((event) => `<button class="ward-track-detection" type="button" data-ward-id="${ward.id}" data-ward-detection-time="${event.time}" style="left:${(event.time / MATCH_DURATION) * 100}%" title="${formatTime(event.time)} · 发现 ${safeHero(event.heroSlot).name}"></button>`).join("")}
              <span class="ward-end-marker ${ward.endReason === "被反眼" ? "dewarded" : "natural"}" style="left:${(ward.endedAt / MATCH_DURATION) * 100}%"></span>
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
    jungle_reset: "应留在安全野区",
    low_income_window: "低收益时间窗",
    evidence_gap: "路线证据不足",
  };
  return labels[value] || value || "资源决策复盘";
}

function farmDiagnosticReason(diagnostic) {
  const phase = diagnostic.phase === "laning" ? "对线期" : diagnostic.phase === "expansion" ? "转线期" : "20 分钟前目标期";
  const facts = `Replay 事实：该 30 秒获得 ${Number(diagnostic.actualGold || 0)}g，其中兵线 ${Number(diagnostic.laneGold || 0)}g、野区 ${Number(diagnostic.neutralGold || 0)}g；可见敌人 ${(diagnostic.visible || []).length}/5，附近己方有效眼位 ${(diagnostic.wardIds || []).length} 个。`;
  const missing = (diagnostic.missingEvidence || []).map((key) => ({ lane_unit_positions: "兵线实体位置", camp_occupancy: "野点存活状态", team_resource_claims: "队友资源归属", hero_clear_time: "本英雄清线清野耗时" })[key] || key);
  const model = diagnostic.diagnostic_class === "relative_low"
    ? `模型判断：这是本场相对低点，不满足异常门槛，仅作为${phase}复盘样本。`
    : diagnostic.matched_best_option
      ? `模型判断：处于${phase}，实际行为与当前证据支持的最高分选项一致。`
      : `模型门控：${missing.length ? `缺少${missing.join("、")}` : "候选证据不完整"}，因此只保留复盘线索，不生成确定路线。刷新时钟本身不能证明线野双收可执行。`;
  return `${facts}${model}`;
}

function farmCandidates(diagnostic) {
  if (diagnostic.candidates?.length) return diagnostic.candidates;
  if (diagnostic.recommendation === "insufficient_evidence") return [];
  return [{ kind: diagnostic.recommendation || "current_route", expectedGold: Number(diagnostic.suggestedGold || 0), risk: Number(diagnostic.risk || 0), travelSeconds: Number(diagnostic.travelSeconds || 0), deadlineSeconds: Number(diagnostic.expiresIn || 0), evidence: "legacy_model" }];
}

function nextPeriodicTime(current, first, interval, last = Infinity) {
  if (current <= first) return first;
  const next = first + Math.ceil((current - first) / interval) * interval;
  return next <= last ? next : null;
}

function renderFarmResourceClock() {
  const current = state.currentTime;
  const m = FARM_MECHANICS;
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
    return `<span class="farm-resource-tick ${remaining != null && remaining <= 10 ? "due" : ""}"><i data-lucide="${icon}"></i><span><small>${label}</small><strong>${time == null ? "本轮已结束" : `${formatTime(time)} · ${remaining}s`}</strong></span></span>`;
  }).join("");
  const phase = current < 450 ? "0-7:30 对线期" : current < 900 ? "7:30-15:00 转线期" : current < 1200 ? "15:00-20:00 目标前" : "20 分钟后";
  document.querySelector("#farm-phase-label").textContent = phase;
  refreshIcons(root);
}

function farmDecisionMeta(decision) {
  if (decision === "correct") return { label: "正确决策", className: "positive", icon: "circle-check" };
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
  const midpoint = (cell.start + cell.end) / 2;
  if (state.farmTimeWindow === "pre20") return midpoint < 1200;
  if (state.farmTimeWindow === "m0_5") return midpoint < 300;
  if (state.farmTimeWindow === "m5_10") return midpoint >= 300 && midpoint < 600;
  if (state.farmTimeWindow === "m10_15") return midpoint >= 600 && midpoint < 900;
  if (state.farmTimeWindow === "m15_20") return midpoint >= 900 && midpoint < 1200;
  if (state.farmTimeWindow === "post20") return midpoint >= 1200;
  return true;
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
  const combat = cells.filter((cell) => farmCellGroup(cell) === "combat").reduce((sum, cell) => sum + cell.gold, 0);
  const diagnostics = farmDiagnosticsForHero();
  const recoverable = diagnostics.filter((item) => item.review_required).reduce((sum, item) => sum + Math.max(0, item.suggestedGold - item.actualGold), 0);
  const lowIncomeSeconds = diagnostics.filter((item) => item.diagnostic_class !== "relative_low")
    .reduce((sum, item) => sum + Math.max(1, Number(item.end || item.time + 29) - Number(item.time || 0) + 1), 0);
  const percentage = (value) => `${total ? Math.round((value / total) * 100) : 0}%`;
  const kills = UNIT_KILL_STATS.find((row) => Number(row.slot) === state.selectedHeroSlot) || {};
  const metrics = [
    ["coins", "资源收入", `${total.toLocaleString("zh-CN")}g`, "Replay 金钱事件归因"],
    ["wheat", "兵线", `${lane.toLocaleString("zh-CN")}g`, `${percentage(lane)} · ${Number(kills.lane || 0)} 个小兵 · ${FARM_LANE_WAVES.length} 波实体`],
    ["trees", "野区", `${neutral.toLocaleString("zh-CN")}g`, `${percentage(neutral)} · ${FARM_CAMP_STATES.length} 个野点 / ${FARM_CAMP_STATES.reduce((sum, camp) => sum + (camp.observations || []).length, 0)} 个观测周期`],
    ["swords", "战斗与目标", `${combat.toLocaleString("zh-CN")}g`, `${percentage(combat)} · ${safeHero(state.selectedHeroSlot).kills} 次击杀`],
    ["footprints", "前 20 分钟机会窗", formatTime(lowIncomeSeconds), "按 30 秒资源窗口识别"],
    ["trending-up", "模型机会差", `+${recoverable}g`, `${diagnostics.length} 个候选决策点`],
  ];
  const root = document.querySelector("#farm-summary");
  root.innerHTML = metrics.map(([icon, label, value, detail]) => `
    <span class="farm-summary-item"><i data-lucide="${icon}"></i><span><small>${label}</small><strong>${value}</strong><em>${detail}</em></span></span>
  `).join("");
  refreshIcons(root);
}

function renderFarmMap() {
  const hero = safeHero(state.selectedHeroSlot);
  const currentPosition = positionAtTime(state.currentTime, state.selectedHeroSlot);
  const diagnostics = farmDiagnosticsForHero();
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
  document.querySelector("#farm-map-heading").textContent = `${hero.name} · ${windowLabels[state.farmTimeWindow]}打钱热区`;
  document.querySelector("#farm-map-region").textContent = currentPosition
    ? (state.currentAnalysis ? regionName(currentPosition.region) : regionForPosition(currentPosition))
    : "位置数据缺失";
  document.querySelector("#farm-map-time").textContent = formatTime(state.currentTime);
}

function renderFarmDiagnosis() {
  const diagnostics = farmDiagnosticsForHero();
  const list = document.querySelector("#farm-diagnosis-list");
  if (!diagnostics.length) {
    list.innerHTML = `<div class="coverage-empty"><i data-lucide="route-off"></i><span>没有识别到可比较的低收益窗口</span></div>`;
    document.querySelector("#farm-diagnosis-inspector").innerHTML = `<p>该英雄前 20 分钟没有形成可稳定比较的 30 秒低收益窗口，或者数据覆盖不足。</p>`;
    document.querySelector("#farm-model-confidence").textContent = "无异常窗口";
    refreshIcons(list);
    return;
  }
  list.innerHTML = diagnostics.map((diagnostic) => {
    const meta = farmDecisionMeta(diagnostic.decision);
    const delta = Math.max(0, diagnostic.suggestedGold - diagnostic.actualGold);
    const gap = diagnostic.decision === "evidence_gap" || diagnostic.recommendation === "insufficient_evidence";
    const verified = diagnostic.matched_best_option === true;
    return `
      <button class="farm-diagnosis-row ${state.selectedFarmDiagnosticId === diagnostic.id ? "active" : ""}" type="button" data-farm-diagnostic-id="${diagnostic.id}" data-farm-diagnostic-time="${diagnostic.time}">
        <time>${formatTime(diagnostic.time)}</time>
        <span class="farm-diagnosis-main"><strong>${farmDiagnosticTitle(diagnostic.title)}</strong><small>${farmOptionName(diagnostic.actual)} → ${farmOptionName(diagnostic.recommendation)}</small></span>
        <span class="farm-diagnosis-delta ${diagnostic.decision}"><strong>${gap ? "待补证据" : verified ? "已验证" : delta > 0 ? `+${delta}g` : "需复核"}</strong><small>${gap ? `置信度 ${diagnostic.confidence}%` : `风险 ${diagnostic.risk}`}</small></span>
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
  const blocked = diagnostic.blockedCandidates || [];
  document.querySelector("#farm-model-confidence").textContent = `置信度 ${diagnostic.confidence}%`;
  document.querySelector("#farm-model-confidence").className = `evidence-tag ${diagnostic.confidence >= 85 ? "fact" : "aggregate"}`;
  const inspector = document.querySelector("#farm-diagnosis-inspector");
  inspector.innerHTML = `
    <div class="farm-diagnosis-head"><span><small>${formatTime(diagnostic.time)} · ${meta.label}</small><strong>${farmDiagnosticTitle(diagnostic.title)}</strong></span><span class="farm-diagnosis-grade ${meta.className}"><strong>${evidenceGap ? "?" : verified ? "✓" : delta > 0 ? `+${delta}g` : "!"}</strong><small>${evidenceGap ? "不生成路线" : verified ? "行为方向已验证" : "同类窗口基准差"}</small></span></div>
    <div class="farm-route-compare">
      <span class="actual"><small>Replay 实际</small><strong>${farmOptionName(diagnostic.actual)}</strong><em>${diagnostic.actualGold}g 已归因收益</em></span>
      <i data-lucide="arrow-right"></i>
      <span class="recommended"><small>${diagnostic.matched_best_option ? "事实匹配" : "证据门控"}</small><strong>${farmOptionName(diagnostic.recommendation)}</strong><em>${diagnostic.matched_best_option ? `${diagnostic.actualGold}g 已归因收益` : "等待兵线与野点状态"}</em></span>
    </div>
    <div class="farm-candidate-grid">
      ${candidates.length ? candidates.slice(0, 3).map((candidate) => `<span class="farm-candidate ${candidate.kind === diagnostic.recommendation ? "recommended" : ""}"><small>${candidate.evidence === "observed_lane_jungle_lane_sequence" ? "Replay 已完成" : "同类窗口基准"}</small><strong>${farmOptionName(candidate.kind)}</strong><em>${Number(candidate.expectedGold || 0)}g · 风险 ${Number(candidate.risk || 0)} · ${Number(candidate.travelSeconds || 0)}s</em></span>`).join("") : `<span class="farm-candidate blocked"><small>不可用</small><strong>没有可执行候选</strong><em>刷新时间不等于路线成立</em></span>`}
      ${blocked.slice(0, 1).map((candidate) => `<span class="farm-candidate blocked"><small>已阻止</small><strong>${farmOptionName(candidate.kind)}</strong><em>${escapeHtml(candidate.reason || "关键证据缺失")}</em></span>`).join("")}
    </div>
    <div class="farm-model-metrics">
      <span><small>移动时间</small><strong>${diagnostic.travelSeconds} 秒</strong></span>
      <span><small>实际兵线击杀</small><strong>${Number(diagnostic.laneCreeps || 0)} 个</strong></span>
      <span><small>候选截止</small><strong>${diagnostic.expiresIn} 秒</strong></span>
      <span><small>可见敌人</small><strong>${diagnostic.visible.length} / 5</strong></span>
      <span><small>失踪威胁</small><strong>${diagnostic.missing.length} 人</strong></span>
      <span><small>己方视野</small><strong>${wardNames.length} 个眼位</strong></span>
    </div>
    <span class="farm-stack-fact"><i data-lucide="layers-3"></i>${Number(diagnostic.stackDelta || 0) > 1 ? `此窗口确认拉到 ${diagnostic.stackDelta} 个营地（双拉）` : Number(diagnostic.stackDelta || 0) === 1 ? "此窗口确认完成 1 次堆野" : "此窗口没有检测到堆野计数增长"}</span>
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
  renderFarmSummary();
  renderFarmResourceClock();
  renderFarmDiagnosis();
  renderFarmUnits();
  renderFarmMap();
}

function syncFarmTime() {
  if (state.detailView !== "farm") return;
  const diagnostics = farmDiagnosticsForHero();
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

function ensureChart() {
  const container = document.querySelector("#development-chart");
  if (!container || container.clientWidth < 2 || container.clientHeight < 2) return;
  if (!state.chart) {
    state.chart = echarts.init(container, null, { renderer: "canvas" });
    state.chart.on("click", (params) => {
      if (Array.isArray(params.value)) updateCurrentTime(params.value[0]);
    });
    state.chart.on("datazoom", () => {
      const option = state.chart.getOption();
      const zoom = option.dataZoom?.[0];
      if (zoom) state.chartZoom = [zoom.start, zoom.end];
    });
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
      return { time: view.time, timeMs: view.timeMs, icon: view.icon, text: `${view.actor} · ${view.text}`, value: view.value };
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
    const role = slot % 5 < 3 ? "core" : "support";
    const abilityCasts = role === "core" ? 3 + (slot % 3) : 4 + (slot % 2);
    const controlSeconds = role === "support" ? 2.4 + (slot % 2) * 1.6 : slot % 2 ? 1.2 : 0;
    const score = clamp(Math.round(55 + damage / Math.max(1, Number(fight.damage || 3000)) * 70 + abilityCasts * 2 + controlSeconds * 2), 32, 94);
    const gateStatus = slot % 4 === 1 ? "blocked" : slot % 4 === 2 ? "insufficient_evidence" : "passed";
    const responsibilityGate = { status: gateStatus, coverage_pct: gateStatus === "insufficient_evidence" ? 42 : 96, opportunity_seconds: gateStatus === "passed" ? 7 : 0, blockers: gateStatus === "blocked" ? { cooldown: 5, stun: 2 } : gateStatus === "insufficient_evidence" ? { range_unknown: 8, ability_state_missing: 3 } : {}, opportunities: [] };
    return { slot, role, damage, teamDamageShare: 0, damageToKills: Math.round(damage * 0.62), killConversion: 62, abilityCasts, itemUses: role === "support" ? 2 : 1, controlSeconds, healing: role === "support" && slot % 2 ? 420 : 0, kills: 0, deaths: 0, presencePct: 78 - (slot % 3) * 7, arrivalDelay: slot % 4, setupObservers: role === "support" ? 1 : 0, setupSentries: role === "support" && slot % 2 ? 1 : 0, responsibilityScore: score, status: score >= 72 ? "ok" : score >= 48 ? "watch" : "issue", confidence: state.currentAnalysis ? 48 : 72, issues: [], responsibility_gate: responsibilityGate };
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
  const learned = fight.classification?.learning_applied;
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
    ["识别依据", learned ? `标注相似 ${Math.round(Number(fight.classification?.similarity || 0) * 100)}%` : confidence ? `自动规则 ${confidence}%` : "固定战斗规则"],
    ["事件上下文", tags.length ? tags.join(" · ") : reason || "基础战斗事件"],
    ["关键程度", `${importanceMeta.label} ${Number(importance.score || 0)} · ${importanceReason || "未评分"}`],
  ];
  document.querySelector("#combat-overview-stats").innerHTML = stats.map(([label, value]) => `<span class="combat-overview-stat"><small>${label}</small><strong>${value}</strong></span>`).join("");
  const teams = [["radiant", "天辉"], ["dire", "夜魇"]];
  document.querySelector("#combat-vision-summary").innerHTML = teams.map(([team, label]) => {
    const vision = fightVisionTeam(fight, team, center);
    if (!vision) return `<div class="combat-vision-team ${team}"><strong>${label}</strong><span class="combat-vision-copy"><small>这场战斗缺少可用的视野事件证据</small></span><span>数据不足</span></div>`;
    const visibility = Number(vision.combat_log_visibility_pct || 0);
    const observer = Number(vision.nearby_observers || 0);
    const sentry = Number(vision.nearby_sentries || 0);
    return `<div class="combat-vision-team ${team}"><strong>${label}</strong><span class="combat-vision-copy"><span class="combat-vision-meter"><span style="width:${clamp(visibility, 0, 100)}%"></span></span><small>可见伤害事件 ${visibility}%</small><em>附近假眼 ${observer} · 真眼 ${sentry} · 开战前真眼 ${Number(vision.setup_sentries || 0)}</em></span><span>${vision.observer_coverage ? "有视野" : "无眼覆盖"}${vision.sentry_coverage ? " + 反隐" : ""}</span></div>`;
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

function renderCombatContributions(fight, contributions) {
  const table = document.querySelector("#combat-contribution-table");
  if (!contributions.length) {
    table.innerHTML = `<div class="coverage-empty"><span>该战斗缺少可归属到英雄的贡献事件</span></div>`;
    return;
  }
  table.innerHTML = contributions.map((row) => {
    const hero = safeHero(row.slot);
    const gate = responsibilityGateMeta(row.responsibility_gate);
    const score = row.responsibility_gate && row.responsibility_gate.status !== "passed"
      ? gate.shortLabel : Number(row.responsibilityScore || 0);
    return `<button class="combat-contribution-row ${state.selectedCombatPlayerSlot === row.slot ? "active" : ""}" type="button" data-combat-player-slot="${row.slot}">
      <span class="combat-contribution-player"><img src="${heroImage(hero.token)}" alt="${hero.name}"><span><strong>${hero.player}${hero.me ? " · 我" : ""}</strong><small>${hero.name} · 伤害占比 ${Number(row.teamDamageShare || 0).toFixed(1)}%</small></span></span>
      <span><i class="combat-role-tag">${positionLabel(hero.position)}</i></span>
      <span>${Number(row.damage || 0).toLocaleString("zh-CN")}</span><span>${Number(row.abilityCasts || 0)}</span><span>${Number(row.controlSeconds || 0).toFixed(1)}s</span><span>${Number(row.healing || 0)}</span><span>${Number(row.presencePct || 0)}%</span><span><i class="combat-score-tag ${row.responsibility_gate ? gate.className : row.status || "watch"}">${score}</i></span>
    </button>`;
  }).join("");
  installImageFallback(table, heroImage("unknown"));
}

function renderCombatPlayerAudit(fight, contributions) {
  const contribution = contributions.find((row) => row.slot === state.selectedCombatPlayerSlot) || contributions[0];
  if (!contribution) {
    document.querySelector("#combat-player-heading").textContent = "没有可审计的玩家事件";
    document.querySelector("#combat-audit-score").textContent = "--";
    document.querySelector("#combat-player-audit").innerHTML = `<div class="coverage-empty"><span>贡献评分已停用，直到解析器取得真实施法、伤害或控制证据</span></div>`;
    document.querySelector("#damage-breakdown").innerHTML = "";
    return;
  }
  state.selectedCombatPlayerSlot = contribution.slot;
  const hero = safeHero(contribution.slot);
  const gate = contribution.responsibility_gate || null;
  const gateMeta = responsibilityGateMeta(gate);
  document.querySelector("#combat-player-heading").textContent = `${hero.name} · ${positionLabel(hero.position)}`;
  document.querySelector("#combat-audit-kicker").textContent = `责任审计 · ${gate ? gateMeta.label : `置信度 ${Number(contribution.confidence || 0)}%`}`;
  document.querySelector("#combat-audit-score").textContent = gate && gate.status !== "passed" ? "--" : Number(contribution.responsibilityScore || 0);
  const issues = contribution.issues || [];
  const blockers = Object.entries(gate?.blockers || {}).filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 4);
  document.querySelector("#combat-player-audit").innerHTML = `
    <div class="combat-audit-metrics">
      <span><small>伤害 / 占比</small><strong>${Number(contribution.damage || 0).toLocaleString("zh-CN")} · ${Number(contribution.teamDamageShare || 0).toFixed(1)}%</strong></span>
      <span><small>技能 / 物品</small><strong>${Number(contribution.abilityCasts || 0)} / ${Number(contribution.itemUses || 0)}</strong></span>
      <span><small>控制 / 治疗</small><strong>${Number(contribution.controlSeconds || 0).toFixed(1)}s / ${Number(contribution.healing || 0)}</strong></span>
      <span><small>在场率</small><strong>${Number(contribution.presencePct || 0)}%</strong></span>
      <span><small>进入战斗</small><strong>+${Number(contribution.arrivalDelay || 0)}s</strong></span>
      <span><small>眼 / 真眼准备</small><strong>${Number(contribution.setupObservers || 0)} / ${Number(contribution.setupSentries || 0)}</strong></span>
    </div>
    ${gate ? `<div class="combat-gate-summary ${gateMeta.className}"><span><small>职责硬门禁</small><strong>${gateMeta.label}</strong></span><span><small>状态覆盖</small><strong>${Number(gate.coverage_pct || 0)}%</strong></span><span><small>有效机会</small><strong>${Number(gate.opportunity_seconds || 0)} 秒</strong></span><span class="combat-gate-blockers"><small>主要限制</small><strong>${blockers.length ? blockers.map(([key, count]) => `${RESPONSIBILITY_BLOCKER_NAMES[key] || key} ${count}`).join(" · ") : "无"}</strong></span></div>` : ""}
    <div class="combat-audit-issues">${issues.length ? issues.map((issue) => `<span>${COMBAT_ISSUE_NAMES[issue] || issue}</span>`).join("") : gate && gate.status !== "passed" ? `<span class="clear">硬门禁未通过，本场不生成“没交技能”等责任结论</span>` : `<span class="clear">职责证据未发现明显缺口</span>`}</div>`;
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
    const classifier = fight.classification?.learning_applied
      ? ` · 标注相似 ${Math.round(Number(fight.classification.similarity || 0) * 100)}%`
      : Number(fight.classification?.confidence) > 0
        ? ` · 自动 ${Number(fight.classification.confidence)}%`
        : "";
    const reason = (fight.classification?.reasons || []).map((item) => COMBAT_REASON_NAMES[item] || item)[0];
    const importance = fightImportanceMeta(fight);
    const importanceReason = (fight.importance?.reasons || []).map((item) => COMBAT_IMPORTANCE_REASON_NAMES[item] || item)[0];
    const duration = Math.max(0, Number(fight.contact_end_ms ?? contactEnd * 1000) - Number(fight.contact_start_ms ?? contactStart * 1000)) / 1000;
    return `<button class="combat-row ${state.selectedCombatId === fight.id ? "active" : ""}" type="button" data-combat-id="${fight.id}"><time>${formatTime(contactStart)}<br>${formatTime(contactEnd)}</time><span><strong>${fight.title}<i class="combat-importance-badge ${importance.className}">${importance.label} ${Number(fight.importance?.score || 0)}</i></strong><small>${importanceReason || reason || fight.location} · 接触 ${duration.toFixed(duration < 10 ? 1 : 0)} 秒${classifier}</small></span><span class="result-pill ${fight.tone}">${fight.result}</span></button>`;
  }).join("") : `<div class="coverage-empty"><i data-lucide="shield-off"></i><span>没有识别到战斗片段</span></div>`;
  document.querySelector("#combat-count").textContent = state.combatFilter === "all" ? `${fights.length} 场` : `${fights.length}/${baseFights.length}`;
  renderSelectedCombat();
  if (options.centerSelection) {
    window.requestAnimationFrame(() => centerSelectedCombatRow(options.scrollBehavior));
  }
}

function renderSelectedCombat() {
  const fight = COMBAT_SEGMENTS.find((item) => item.id === state.selectedCombatId)
    || (state.combatFilter === "all" ? COMBAT_SEGMENTS[0] : null);
  if (!fight) {
    document.querySelector("#combat-heading").textContent = "没有战斗片段";
    document.querySelector("#combat-event-stream").innerHTML = "";
    document.querySelector("#damage-breakdown").innerHTML = "";
    document.querySelector("#combat-contribution-table").innerHTML = "";
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
  if (!contributions.some((row) => row.slot === state.selectedCombatPlayerSlot)) {
    state.selectedCombatPlayerSlot = contributions.some((row) => row.slot === state.selectedHeroSlot) ? state.selectedHeroSlot : contributions[0]?.slot;
  }
  renderCombatMap(fight, contributions);
  renderCombatVision(fight, contributions);
  renderCombatContext(fight);
  renderCombatContributions(fight, contributions);
  renderCombatPlayerAudit(fight, contributions);
  const eventStream = document.querySelector("#combat-event-stream");
  eventStream.innerHTML = combatEventRows(fight).map((event) => `<button class="combat-event-row" type="button" data-combat-time-ms="${event.timeMs ?? event.time * 1000}"><time>${formatPreciseTimeMs(event.timeMs ?? event.time * 1000)}</time><span class="event-symbol"><i data-lucide="${event.icon}"></i></span><strong>${event.text}</strong><small>${event.value}</small></button>`).join("");
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
  const noCounterpart = new Set(["lane_confidence", "dead_seconds", "observer_wards", "sentry_wards", "dewards"]);
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
    const score = Math.round(Number(dimension.score) || 0);
    const evidence = (dimension.evidence || []).slice(0, 2).map(playerEvidenceText).join(" · ");
    return `<div class="player-report-dimension ${escapeHtml(dimension.status || "stable")}">
      <span class="dimension-label"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(brief)} · 权重 ${Number(dimension.weight) || 0}%</small></span>
      <span class="dimension-meter"><i style="width:${clamp(score, 0, 100)}%"></i><small title="${escapeHtml(evidence)}">${escapeHtml(evidence)}</small></span>
      <b>${score}</b>
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
      <header><span>分阶段表现</span><small>同位置对位基准</small></header>
      <div class="player-phase-list">${phaseHtml}</div>
      <div class="player-report-insights">
        <div><small>优势证据</small>${insightHtml(strengths, "strength")}</div>
        <div><small>优先复核</small>${insightHtml(improvements, "improve")}</div>
      </div>
    </section>
  </div>
  <footer class="player-report-caveat"><i data-lucide="info"></i><span>分数是本场同位置相对履职评估，不代表段位百分位；英雄专属任务与施法机会仍需结合战斗时间轴复核。</span></footer>`;
  installImageFallback(root, heroImage("unknown"));
  refreshIcons(root);
}

function renderCoverage() {
  const analysis = state.currentAnalysis;
  if (!analysis) {
    document.querySelector("#coverage-table").innerHTML = `<div class="coverage-empty"><i data-lucide="database-zap"></i><span>完成本地 Replay 解析后显示真实覆盖率</span></div>`;
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
  const integrityStatus = analysis.integrity?.status;
  document.querySelector("#coverage-complete-label").textContent = integrityStatus === "partial"
    ? "Replay 完整 · 坐标有缺口" : analysis.complete ? "完整 Replay" : "数据不完整";
  document.querySelector("#coverage-object-count").textContent = `${Number(analysis.valid_json_objects || 0).toLocaleString("zh-CN")} 条有效事件 · 错误 ${analysis.invalid_lines || 0}`;
  document.querySelector("#coverage-patch").textContent = analysis.match?.patch_name || (analysis.match?.patch ? `Patch ID ${analysis.match.patch}` : "--");
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
    const friendlyMessage = job.status === "failed" ? TASK_ERROR_MESSAGES[job.error_code] || liveDetail : liveDetail;
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
    const detail = failed ? TASK_ERROR_MESSAGES[task.error_code] || "解析失败"
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
  updateMap();
  updateChartCursor();
  renderBuild();
  syncWardTime();
  syncFarmTime();
  syncCombatPhasePlayhead();

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
  if (state.detailView === "development") ensureChart();
  updateCurrentTime(state.currentTime, { syncSegment: false });
  if (state.detailView === "farm") renderFarmAnalysis();
}

function formatGoldenTime(milliseconds) {
  const value = Math.round(Number(milliseconds) || 0);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const minutes = Math.floor(absolute / 60000);
  const seconds = Math.floor((absolute % 60000) / 1000);
  const millis = absolute % 1000;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function parseGoldenTimeInput(value) {
  const normalized = String(value || "").trim().replace("：", ":").replace(",", ".");
  if (!normalized) return null;
  if (!normalized.includes(":")) {
    const seconds = Number(normalized);
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  }
  const match = normalized.match(/^(-)?(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(String(match[4] || "0").padEnd(3, "0"));
  return sign * (minutes * 60_000 + seconds * 1000 + millis);
}

function goldenDurationMs() {
  return Math.max(1, Number(state.golden.analysis?.match?.duration || 1) * 1000);
}

function goldenPlayers() {
  return [...(state.golden.analysis?.match?.players || [])]
    .sort((a, b) => Number(a.player_slot) - Number(b.player_slot))
    .map((player, slot) => {
      const meta = heroMeta(player.hero_id);
      return {
        slot,
        team: Number(player.player_slot) < 128 ? "radiant" : "dire",
        token: meta.token,
        name: meta.name,
        player: player.personaname || player.name || "匿名玩家",
      };
    });
}

function goldenSelectedEvent() {
  return state.golden.document?.events?.find((event) => event.id === state.golden.selectedEventId) || null;
}

function goldenSnapshotAt(slot, milliseconds = state.golden.currentTimeMs) {
  const rows = state.golden.analysis?.modules?.snapshots?.[String(slot)] || [];
  if (!rows.length) return null;
  const second = Math.round(Number(milliseconds) / 1000);
  let low = 0;
  let high = rows.length - 1;
  let best = rows[0];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = rows[middle];
    if (Math.abs(Number(current.second) - second) < Math.abs(Number(best.second) - second)) best = current;
    if (Number(current.second) < second) low = middle + 1;
    else if (Number(current.second) > second) high = middle - 1;
    else return current;
  }
  return best;
}

function buildGoldenDensity(analysis) {
  const durationSeconds = Math.max(1, Number(analysis?.match?.duration || 1));
  const density = Array.from({ length: Math.ceil(durationSeconds) + 1 }, () => 0);
  const weights = { hero_death: 9, damage: 3, control: 3, ability_use: 2, item_use: 1, heal: 1 };
  for (const event of analysis?.modules?.timeline?.events || []) {
    if (!isGoldenRawCombatEvent(event)) continue;
    const second = clamp(Number(event.time) || 0, 0, durationSeconds);
    const index = Math.min(density.length - 1, Math.floor(second));
    const valueWeight = event.kind === "damage" ? Math.min(5, Math.log10(Math.max(10, Number(event.value) || 10))) : 0;
    density[index] += (weights[event.kind] || 1) + valueWeight;
  }
  return density;
}

function buildGoldenDensityPeaks(density) {
  if (!density?.length) return [];
  const radius = 3;
  const smoothed = density.map((_, index) => {
    let sum = 0;
    for (let cursor = Math.max(0, index - radius); cursor <= Math.min(density.length - 1, index + radius); cursor++) sum += density[cursor];
    return sum;
  });
  const positive = smoothed.filter((value) => value > 0).sort((a, b) => a - b);
  if (!positive.length) return [];
  const threshold = positive[Math.floor((positive.length - 1) * 0.72)];
  const candidates = [];
  for (let index = 1; index < smoothed.length - 1; index++) {
    if (smoothed[index] < threshold || smoothed[index] < smoothed[index - 1] || smoothed[index] < smoothed[index + 1]) continue;
    candidates.push({ second: index, score: smoothed[index] });
  }
  const separated = [];
  for (const candidate of candidates) {
    const previous = separated.at(-1);
    if (!previous || candidate.second - previous.second >= 15) separated.push(candidate);
    else if (candidate.score > previous.score) separated[separated.length - 1] = candidate;
  }
  return separated.map((candidate) => candidate.second * 1000);
}

function goldenDensityRange() {
  const duration = goldenDurationMs();
  const windowSeconds = Number(state.golden.densityWindowSeconds) || 0;
  if (!windowSeconds) return { start: 0, end: duration };
  const radius = windowSeconds * 1000;
  let start = Math.max(0, state.golden.currentTimeMs - radius);
  let end = Math.min(duration, state.golden.currentTimeMs + radius);
  const expected = Math.min(duration, radius * 2);
  if (end - start < expected) {
    if (start === 0) end = Math.min(duration, expected);
    else start = Math.max(0, duration - expected);
  }
  return { start, end };
}

function goldenRawCombatEvents(startMs, endMs) {
  return (state.golden.analysis?.modules?.timeline?.events || []).filter((event) => {
    const timeMs = Number(event.time) * 1000;
    return isGoldenRawCombatEvent(event) && timeMs >= startMs && timeMs <= endMs;
  });
}

function goldenEventValidation(event) {
  if (!event) return [];
  const review = Number(event.review_start_ms);
  const start = Number(event.contact_start_ms);
  const peak = Number(event.peak_ms);
  const end = Number(event.contact_end_ms);
  const participants = [...new Set((event.participants || []).map(Number).filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < 10))];
  const radiant = participants.filter((slot) => slot < 5).length;
  const dire = participants.length - radiant;
  const combat = event.label !== "non_combat";
  const center = event.center;
  const hasCenter = Number.isFinite(Number(center?.map_x)) && Number.isFinite(Number(center?.map_y));
  return [
    { key: "time", label: "时间顺序", passed: review <= start && start <= peak && peak <= end },
    { key: "review", label: "回溯 ≤10秒", passed: !combat || start - review <= 10_000 },
    { key: "participants", label: "参与者", passed: !combat || participants.length >= 2 },
    { key: "teams", label: "双方交互", passed: !combat || (radiant > 0 && dire > 0) },
    { key: "center", label: "战场圆心", passed: !combat || hasCenter },
    { key: "teamfight", label: "团战门槛", passed: event.label !== "teamfight" || (participants.length >= 5 && radiant >= 2 && dire >= 2 && !(radiant === 2 && dire === 2)) },
  ];
}

function goldenEventIssues(event) {
  return goldenEventValidation(event).filter((check) => !check.passed);
}

function renderGoldenLayoutState() {
  const workspace = document.querySelector("#golden-workspace");
  const signalList = document.querySelector("#golden-signal-list");
  const evaluationPanel = document.querySelector("#golden-evaluation-panel");
  workspace.classList.toggle("map-focused", state.golden.mapFocused);
  signalList.classList.toggle("collapsed", !state.golden.signalsExpanded);
  evaluationPanel.classList.toggle("collapsed", !state.golden.evaluationExpanded);

  const mapButton = document.querySelector("#golden-map-focus");
  mapButton.innerHTML = `<i data-lucide="${state.golden.mapFocused ? "minimize-2" : "maximize-2"}"></i>`;
  mapButton.title = state.golden.mapFocused ? "恢复三栏工作区" : "放大地图工作区";
  const signalButton = document.querySelector("#golden-toggle-signals");
  signalButton.innerHTML = `<i data-lucide="${state.golden.signalsExpanded ? "chevron-up" : "chevron-down"}"></i>`;
  signalButton.title = state.golden.signalsExpanded ? "收起原始事件列表" : "展开原始事件列表";
  const evaluationButton = document.querySelector("#golden-toggle-evaluation");
  evaluationButton.innerHTML = `<i data-lucide="${state.golden.evaluationExpanded ? "chevron-down" : "chevron-up"}"></i>`;
  evaluationButton.title = state.golden.evaluationExpanded ? "收起评测面板" : "展开评测面板";
  refreshIcons(mapButton);
  refreshIcons(signalButton);
  refreshIcons(evaluationButton);
}

function renderGoldenValidation(event) {
  const validation = document.querySelector("#golden-validation");
  validation.innerHTML = goldenEventValidation(event).map((check) => `<span class="${check.passed ? "" : "invalid"}" title="${check.passed ? "已满足" : "需要完善"}">${check.label}</span>`).join("");
}

function goldenDensityTimeFromPointer(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const range = goldenDensityRange();
  return Math.round(range.start + ratio * (range.end - range.start));
}

function updateGoldenDensityTooltip(event) {
  const tooltip = document.querySelector("#golden-density-tooltip");
  const rect = event.currentTarget.getBoundingClientRect();
  const timeMs = goldenDensityTimeFromPointer(event);
  const second = Math.max(0, Math.round(timeMs / 1000));
  const intensity = Number(state.golden.density?.[second]) || 0;
  const left = clamp(event.clientX - rect.left, 46, Math.max(46, rect.width - 46));
  tooltip.value = `${formatGoldenTime(timeMs)} · 强度 ${intensity.toFixed(1)}`;
  tooltip.textContent = tooltip.value;
  tooltip.style.left = `${left}px`;
  tooltip.classList.remove("hidden");
}

function setGoldenDensityWindow(seconds) {
  state.golden.densityWindowSeconds = Number(seconds) || 0;
  renderGoldenDensity();
  renderGoldenWindowTrack(goldenSelectedEvent());
}

function jumpGoldenPeak(direction) {
  const peaks = state.golden.densityPeaks || [];
  const target = direction > 0
    ? peaks.find((time) => time > state.golden.currentTimeMs + 250)
    : [...peaks].reverse().find((time) => time < state.golden.currentTimeMs - 250);
  if (target != null) setGoldenTime(target);
}

function renderGoldenMatchOptions() {
  const select = document.querySelector("#golden-match-select");
  const current = state.golden.matchId;
  select.innerHTML = `<option value="">选择本地比赛</option>${state.golden.matches.map((match) => {
    const annotation = match.annotation || {};
    const status = annotation.status === "not_started" ? "未开始" : annotation.status === "draft" ? "草稿" : annotation.status === "adjudicated" ? "已仲裁" : "已完成";
    return `<option value="${match.match_id}">${match.match_id} · ${escapeHtml(match.patch_name || "版本未知")} · ${formatTime(match.duration || 0)} · ${status}</option>`;
  }).join("")}`;
  select.value = state.golden.matches.some((match) => String(match.match_id) === String(current)) ? current : "";
  renderGoldenSlotStatus();
}

function renderGoldenSlotStatus() {
  const match = state.golden.matches.find((item) => String(item.match_id) === String(state.golden.matchId));
  const slots = match?.annotation_slots || {};
  const slotsHtml = Object.entries(GOLDEN_ANNOTATOR_META).map(([key, label]) => {
    const status = slots[key]?.status || "not_started";
    const statusLabel = status === "not_started" ? "未开始" : status === "draft" ? "草稿" : status === "complete" ? "完成" : "仲裁";
    return `<span class="${status}">${label} · ${statusLabel}</span>`;
  }).join("");
  const model = state.golden.model;
  const modelHtml = model
    ? `<span class="${model.status === "active" ? "complete" : ""}" title="跨比赛留一验证，不使用当前比赛自身标签">全局学习 · ${Number(model.training_matches || 0)} 场 / ${Number(model.samples || 0)} 样本</span>`
    : "";
  document.querySelector("#golden-slot-status").innerHTML = `${slotsHtml}${modelHtml}`;
}

async function loadGoldenMatches({ reloadSelected = false, silent = false } = {}) {
  try {
    const payload = await apiFetch(`/qa/goldens?annotator=${encodeURIComponent(state.golden.annotator)}`, { timeout: 20000 });
    state.golden.matches = payload.matches || [];
    state.golden.model = payload.learning_model || null;
    renderGoldenMatchOptions();
    if (reloadSelected && state.golden.matchId) await loadGoldenMatch(state.golden.matchId);
  } catch (error) {
    if (!silent) showToast("无法读取黄金样本", error.message || "请检查本地解析器", "circle-alert");
  }
}

async function loadGoldenMatch(matchId) {
  const id = String(matchId || "");
  state.golden.matchId = id;
  state.golden.loading = Boolean(id);
  state.golden.evaluation = null;
  state.golden.evaluationScope = "match";
  renderGoldenMatchOptions();
  if (!id) {
    state.golden.analysis = null;
    state.golden.document = null;
    state.golden.selectedEventId = null;
    renderGoldenWorkspace();
    return;
  }
  document.querySelector("#golden-empty").classList.remove("hidden");
  document.querySelector("#golden-empty strong").textContent = "正在读取本地分析包";
  document.querySelector("#golden-empty small").textContent = `比赛 ${id} · 标注文件与模型摘要保持隔离`;
  document.querySelector("#golden-workspace").classList.add("hidden");
  try {
    const annotator = encodeURIComponent(state.golden.annotator);
    const [analysis, annotationDocument] = await Promise.all([
      apiFetch(`/matches/${id}/analysis`, { timeout: 30000 }),
      apiFetch(`/qa/goldens/${id}?annotator=${annotator}`, { timeout: 15000 }),
    ]);
    await fetchAnalysisModules(analysis, id, ["combat", "timeline"]);
    normalizeAnalysisSnapshots(analysis);
    state.golden.analysis = analysis;
    state.golden.document = annotationDocument;
    state.golden.blind = true;
    state.golden.density = buildGoldenDensity(analysis);
    state.golden.densityPeaks = buildGoldenDensityPeaks(state.golden.density);
    state.golden.currentTimeMs = Math.min(goldenDurationMs(), Number(annotationDocument.events?.[0]?.contact_start_ms || 0));
    state.golden.selectedEventId = annotationDocument.events?.[0]?.id || null;
    state.golden.dirty = false;
    document.querySelector("#golden-time-slider").max = String(goldenDurationMs());
    document.querySelector("#golden-time-slider").value = String(state.golden.currentTimeMs);
    document.querySelector("#golden-blind-toggle").checked = state.golden.blind;
    renderGoldenWorkspace();
    if (state.golden.annotator === "adjudicated") await renderGoldenAdjudicationDiff();
  } catch (error) {
    state.golden.analysis = null;
    state.golden.document = null;
    document.querySelector("#golden-empty strong").textContent = "标注工作台读取失败";
    document.querySelector("#golden-empty small").textContent = error.message || "请确认比赛拥有完整本地分析";
    showToast("标注工作台读取失败", error.message, "circle-alert");
  } finally {
    state.golden.loading = false;
  }
}

function renderGoldenWorkspace() {
  const ready = Boolean(state.golden.analysis && state.golden.document);
  document.querySelector("#golden-empty").classList.toggle("hidden", ready);
  document.querySelector("#golden-workspace").classList.toggle("hidden", !ready);
  document.querySelector("#golden-evaluation-panel").classList.toggle("hidden", !ready);
  if (!ready) return;
  const match = state.golden.analysis.match || {};
  document.querySelector("#golden-stage-title").textContent = `比赛 ${match.match_id} · ${match.patch_name || "版本未知"}`;
  document.querySelector("#golden-document-status").textContent = state.golden.document.status === "adjudicated" ? "仲裁完成" : state.golden.document.status === "complete" ? "标注完成" : "草稿";
  document.querySelector("#golden-status-select").value = state.golden.document.status || "draft";
  document.querySelector("#golden-status-select").querySelector('option[value="adjudicated"]').disabled = state.golden.annotator !== "adjudicated";
  document.querySelector("#golden-save span").textContent = state.golden.document.status === "draft" ? "保存草稿" : "保存标注";
  document.querySelector("#golden-run-evaluation").disabled = state.golden.document.status === "draft";
  renderGoldenLayoutState();
  renderGoldenEventList();
  renderGoldenStage();
  renderGoldenInspector();
  renderGoldenEvaluation();
  refreshIcons(document.querySelector("#page-goldens"));
}

function renderGoldenEventList() {
  const events = [...(state.golden.document?.events || [])].sort((a, b) => Number(a.contact_start_ms) - Number(b.contact_start_ms));
  document.querySelector("#golden-event-count").textContent = String(events.length);
  const issueCount = events.filter((event) => goldenEventIssues(event).length).length;
  document.querySelector("#golden-issue-count").textContent = String(issueCount);
  const list = document.querySelector("#golden-event-list");
  list.innerHTML = events.length ? events.map((event) => {
    const meta = GOLDEN_LABEL_META[event.label] || GOLDEN_LABEL_META.non_combat;
    const participants = event.participants?.length || 0;
    const duration = Math.max(0, Number(event.contact_end_ms || 0) - Number(event.contact_start_ms || 0));
    const issues = goldenEventIssues(event);
    const status = issues.length
      ? `<em class="issue" title="${escapeHtml(issues.map((issue) => issue.label).join("、"))}">${issues.length}</em>`
      : `<em class="${event.confidence || "medium"}" title="标注完整"></em>`;
    return `<button class="golden-event-row ${event.id === state.golden.selectedEventId ? "active" : ""}" type="button" data-golden-event-id="${escapeHtml(event.id)}"><time>${formatGoldenTime(event.contact_start_ms).slice(0, 5)}</time><span><strong>${meta.label}</strong><small>${participants} 人 · ${(duration / 1000).toFixed(1)} 秒${event.tags?.length ? ` · ${event.tags.map((tag) => GOLDEN_TAG_META[tag] || tag).slice(0, 2).join("/")}` : ""}</small></span>${status}</button>`;
  }).join("") : `<div class="golden-inspector-empty">从全场时间轴发现第一段英雄交互</div>`;
}

function renderGoldenStage() {
  const time = clamp(Number(state.golden.currentTimeMs) || 0, 0, goldenDurationMs());
  state.golden.currentTimeMs = time;
  document.querySelector("#golden-time-slider").value = String(time);
  document.querySelector("#golden-current-time").textContent = formatGoldenTime(time);
  document.querySelector("#golden-map-time").textContent = formatGoldenTime(time).slice(0, 5);
  const players = goldenPlayers();
  const selected = goldenSelectedEvent();
  const selectedParticipants = new Set((selected?.participants || []).map(Number));
  const heroes = document.querySelector("#golden-map-heroes");
  heroes.innerHTML = players.map((player) => {
    const snapshot = goldenSnapshotAt(player.slot, time);
    const x = Number(snapshot?.x);
    const y = Number(snapshot?.y);
    if (snapshot?.coordinate_valid === false || !Number.isFinite(x) || !Number.isFinite(y)) return "";
    const inactive = Number(snapshot.life_state) !== 0 ? "inactive" : "";
    const participantState = selectedParticipants.size ? selectedParticipants.has(player.slot) ? "selected" : "deemphasized" : "";
    return `<img class="golden-map-hero ${player.team} ${inactive} ${participantState}" src="${heroImage(player.token)}" alt="${escapeHtml(player.name)}" title="${escapeHtml(player.name)} · ${escapeHtml(snapshot.region || "未知区域")}" style="left:${x}%;top:${y}%">`;
  }).join("");

  const windowStart = time - 5000;
  const windowEnd = time + 5000;
  const signals = goldenRawCombatEvents(windowStart, windowEnd).slice(0, 40);
  document.querySelector("#golden-signal-count").textContent = `${signals.length} 条`;
  document.querySelector("#golden-map-signals").innerHTML = signals.filter((event) => event.coordinate_valid !== false
    && Number.isFinite(Number(event.x)) && Number.isFinite(Number(event.y))).map((event) => `<span class="golden-map-signal" style="left:${Number(event.x)}%;top:${Number(event.y)}%"></span>`).join("");
  document.querySelector("#golden-signal-list").innerHTML = signals.length ? signals.slice(0, 18).map((event) => {
    const actor = players[Number(event.actor_slot)]?.name || "系统";
    const target = players[Number(event.target_slot)]?.name;
    const key = event.key ? abilityName(event.key) : event.kind === "damage" ? "英雄伤害" : event.kind === "control" ? "控制" : event.kind || "战斗事件";
    const value = event.value == null ? "" : ` · ${Number(event.value).toLocaleString("zh-CN")}`;
    return `<div class="golden-signal-row"><time>${formatTime(event.time)}</time><strong>${escapeHtml(event.kind || "事件")}</strong><span>${escapeHtml(actor)}${target ? ` → ${escapeHtml(target)}` : ""} · ${escapeHtml(key)}${value}</span></div>`;
  }).join("") : `<div class="golden-inspector-empty">当前前后 5 秒没有战斗日志</div>`;

  const center = selected?.center;
  const pin = document.querySelector("#golden-center-pin");
  const ring = document.querySelector("#golden-center-radius");
  const hasCenter = Number.isFinite(Number(center?.map_x)) && Number.isFinite(Number(center?.map_y));
  pin.classList.toggle("hidden", !hasCenter);
  ring.style.display = hasCenter ? "block" : "none";
  if (hasCenter) {
    pin.style.left = `${Number(center.map_x)}%`;
    pin.style.top = `${Number(center.map_y)}%`;
    ring.setAttribute("cx", String(Number(center.map_x)));
    ring.setAttribute("cy", String(Number(center.map_y)));
    ring.setAttribute("r", String(clamp(Number(selected.radius_world || 700) / 163.84, 1.2, 18)));
    document.querySelector("#golden-map-region").textContent = center.region ? regionName(center.region) : `${Number(center.map_x).toFixed(1)}, ${Number(center.map_y).toFixed(1)}`;
  } else {
    document.querySelector("#golden-map-region").textContent = selected ? "点击地图标记主战场" : "尚未选择片段";
  }
  renderGoldenDensity();
  renderGoldenWindowTrack(selected);
  renderGoldenPredictions();
  installImageFallback(heroes, heroImage("unknown"));
  refreshIcons(pin);
}

function renderGoldenDensity() {
  const canvas = document.querySelector("#golden-density-canvas");
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const targetWidth = Math.round(width * pixelRatio);
  const targetHeight = Math.round(height * pixelRatio);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const density = state.golden.density || [];
  const range = goldenDensityRange();
  const span = Math.max(1, range.end - range.start);
  const plotHeight = Math.max(18, height - 16);
  const firstSecond = Math.max(0, Math.floor(range.start / 1000));
  const lastSecond = Math.min(density.length - 1, Math.ceil(range.end / 1000));
  const pixelValues = Array.from({ length: Math.max(1, Math.floor(width)) }, () => 0);
  for (let second = firstSecond; second <= lastSecond; second++) {
    const x = clamp(Math.floor(((second * 1000) - range.start) / span * pixelValues.length), 0, pixelValues.length - 1);
    pixelValues[x] += Number(density[second]) || 0;
  }
  const maximum = Math.max(1, ...pixelValues);

  context.fillStyle = "#0f1113";
  context.fillRect(0, 0, width, height);
  const visibleSeconds = span / 1000;
  const tickSeconds = visibleSeconds <= 70 ? 10 : visibleSeconds <= 150 ? 15 : visibleSeconds <= 900 ? 60 : visibleSeconds <= 2700 ? 300 : 600;
  const firstTick = Math.ceil(range.start / 1000 / tickSeconds) * tickSeconds;
  context.font = "8px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textBaseline = "bottom";
  for (let second = firstTick; second * 1000 <= range.end; second += tickSeconds) {
    const x = (second * 1000 - range.start) / span * width;
    context.fillStyle = "rgba(255,255,255,0.08)";
    context.fillRect(Math.round(x), 0, 1, plotHeight);
    context.fillStyle = "rgba(163,170,176,0.78)";
    const label = formatTime(second);
    const labelWidth = context.measureText(label).width;
    context.fillText(label, clamp(x - labelWidth / 2, 2, width - labelWidth - 2), height - 2);
  }

  pixelValues.forEach((value, index) => {
    if (value <= 0) return;
    const intensity = value / maximum;
    const barHeight = Math.max(2, intensity * (plotHeight - 12));
    context.fillStyle = intensity > 0.66 ? "rgba(223,91,97,0.9)" : intensity > 0.32 ? "rgba(216,164,71,0.78)" : "rgba(94,159,214,0.56)";
    context.fillRect(index, plotHeight - barHeight, 1.2, barHeight);
  });

  for (const event of state.golden.document?.events || []) {
    const eventTime = Number(event.contact_start_ms);
    if (eventTime < range.start || eventTime > range.end) continue;
    const x = (eventTime - range.start) / span * width;
    context.fillStyle = event.id === state.golden.selectedEventId ? "#ffffff" : "rgba(216,164,71,0.78)";
    context.beginPath();
    context.moveTo(x, 11);
    context.lineTo(x - 3, 4);
    context.lineTo(x + 3, 4);
    context.closePath();
    context.fill();
  }

  const playheadX = clamp((state.golden.currentTimeMs - range.start) / span * width, 0, width);
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.fillRect(Math.round(playheadX), 0, 1, plotHeight);

  const peaksInRange = (state.golden.densityPeaks || []).filter((time) => time >= range.start && time <= range.end).length;
  document.querySelector("#golden-density-summary").textContent = state.golden.densityWindowSeconds
    ? `局部 ±${state.golden.densityWindowSeconds} 秒 · ${formatGoldenTime(range.start).slice(0, 5)}–${formatGoldenTime(range.end).slice(0, 5)}`
    : `全场 · ${state.golden.densityPeaks.length} 个高峰`;
  document.querySelectorAll("[data-golden-density-window]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.goldenDensityWindow) === Number(state.golden.densityWindowSeconds));
  });
  document.querySelector("#golden-prev-peak").disabled = !(state.golden.densityPeaks || []).some((time) => time < state.golden.currentTimeMs - 250);
  document.querySelector("#golden-next-peak").disabled = !(state.golden.densityPeaks || []).some((time) => time > state.golden.currentTimeMs + 250);
  canvas.setAttribute("aria-label", `原始战斗事件密度，当前范围 ${peaksInRange} 个高峰`);
}

function renderGoldenWindowTrack(event) {
  const range = goldenDensityRange();
  const span = Math.max(1, range.end - range.start);
  const setTrack = (selector, start, end) => {
    const element = document.querySelector(selector);
    const visibleStart = Math.max(Number(start), range.start);
    const visibleEnd = Math.min(Number(end), range.end);
    if (!event || !Number.isFinite(visibleStart) || !Number.isFinite(visibleEnd) || visibleEnd < visibleStart) {
      element.style.display = "none";
      return;
    }
    const left = clamp((visibleStart - range.start) / span * 100, 0, 100);
    const right = clamp((visibleEnd - range.start) / span * 100, 0, 100);
    element.style.left = `${left}%`;
    element.style.width = `${Math.max(0, right - left)}%`;
    element.style.display = "block";
  };
  setTrack("#golden-review-window", event?.review_start_ms, event?.contact_end_ms);
  setTrack("#golden-contact-window", event?.contact_start_ms, event?.contact_end_ms);
  const peak = document.querySelector("#golden-peak-marker");
  const peakTime = Number(event?.peak_ms);
  const visiblePeak = event && Number.isFinite(peakTime) && peakTime >= range.start && peakTime <= range.end;
  peak.style.display = visiblePeak ? "block" : "none";
  peak.style.left = `${clamp((peakTime - range.start) / span * 100, 0, 100)}%`;
}

function renderGoldenPredictions() {
  const strip = document.querySelector("#golden-prediction-strip");
  const badge = document.querySelector("#golden-stage-badge");
  strip.classList.toggle("hidden", state.golden.blind);
  badge.textContent = state.golden.blind ? "原始事实 · 模型隐藏" : "模型对照已显示";
  badge.className = `evidence-tag ${state.golden.blind ? "fact" : "derived"}`;
  if (state.golden.blind) return;
  const current = state.golden.currentTimeMs / 1000;
  const predictions = (state.golden.analysis?.modules?.combat?.fights || [])
    .filter((fight) => Number(fight.contact_start ?? fight.start) <= current + 12 && Number(fight.contact_end ?? fight.end) >= current - 12)
    .slice(0, 8);
  strip.innerHTML = predictions.length ? predictions.map((fight) => {
    const normalizedKind = GOLDEN_MODEL_LABEL_ALIASES[fight.kind] || fight.kind;
    const meta = GOLDEN_LABEL_META[normalizedKind] || { label: fight.kind || "未知" };
    return `<span><strong>${formatTime(fight.contact_start ?? fight.start)} · ${meta.label}</strong> · ${fight.participants?.length || 0} 人 · ${regionName(fight.region)}</span>`;
  }).join("　") : "当前窗口没有模型预测片段";
}

function renderGoldenInspector() {
  const event = goldenSelectedEvent();
  document.querySelector("#golden-inspector-empty").classList.toggle("hidden", Boolean(event));
  document.querySelector("#golden-inspector-form").classList.toggle("hidden", !event);
  document.querySelector("#golden-delete-event").disabled = !event;
  document.querySelector("#golden-duplicate-event").disabled = !event;
  document.querySelector("#golden-suggest-center").disabled = !event || !(event.participants || []).length;
  if (!event) {
    document.querySelector("#golden-inspector-title").textContent = "尚未选择片段";
    document.querySelector("#golden-validation").innerHTML = "";
    return;
  }
  const meta = GOLDEN_LABEL_META[event.label] || GOLDEN_LABEL_META.non_combat;
  document.querySelector("#golden-inspector-title").textContent = `${formatGoldenTime(event.contact_start_ms).slice(0, 5)} · ${meta.label}`;
  document.querySelectorAll("[data-golden-label]").forEach((button) => button.classList.toggle("active", button.dataset.goldenLabel === event.label));
  document.querySelector("#golden-review-start").value = formatGoldenTime(event.review_start_ms);
  document.querySelector("#golden-contact-start").value = formatGoldenTime(event.contact_start_ms);
  document.querySelector("#golden-peak-time").value = formatGoldenTime(event.peak_ms);
  document.querySelector("#golden-contact-end").value = formatGoldenTime(event.contact_end_ms);
  document.querySelector("#golden-confidence").value = event.confidence || "medium";
  document.querySelector("#golden-event-notes").value = event.notes || "";
  document.querySelector("#golden-radius-slider").value = String(event.radius_world || 700);
  document.querySelector("#golden-radius-value").textContent = String(event.radius_world || 700);
  renderGoldenValidation(event);

  const participants = new Set((event.participants || []).map(Number));
  const players = goldenPlayers();
  const radiant = [...participants].filter((slot) => slot < 5).length;
  const dire = participants.size - radiant;
  document.querySelector("#golden-participant-summary").textContent = `${participants.size} 人 · ${radiant}v${dire}`;
  const grid = document.querySelector("#golden-participant-grid");
  grid.innerHTML = players.map((player) => `<button class="golden-participant ${player.team} ${participants.has(player.slot) ? "active" : ""}" type="button" data-golden-participant="${player.slot}" title="${escapeHtml(player.name)} · ${escapeHtml(player.player)}"><img src="${heroImage(player.token)}" alt="${escapeHtml(player.name)}"><small>P${player.slot % 5 + 1}</small></button>`).join("");
  installImageFallback(grid, heroImage("unknown"));
  const tags = new Set(event.tags || []);
  document.querySelector("#golden-tag-grid").innerHTML = Object.entries(GOLDEN_TAG_META).map(([key, label]) => `<label><input type="checkbox" data-golden-tag="${key}" ${tags.has(key) ? "checked" : ""}><span>${label}</span></label>`).join("");
}

function renderGoldenEvaluation() {
  const grid = document.querySelector("#golden-metric-grid");
  const scopeBadge = document.querySelector("#golden-evaluation-scope");
  const evaluation = state.golden.evaluation;
  const learning = evaluation?.learning_model || state.golden.model;
  const learningMetric = () => {
    if (!learning) return "";
    const validation = learning.cross_match_validation || {};
    const evaluable = Number(validation.evaluable_samples || 0);
    const accuracy = evaluable ? `${(Number(validation.accuracy || 0) * 100).toFixed(1)}%` : "待更多比赛";
    const status = learning.status === "active" ? "已启用" : learning.status === "bootstrap" ? "引导期" : "无样本";
    return `<div class="golden-metric ${learning.status === "active" ? "pass" : ""}"><small>跨场学习 · ${status}</small><strong>${Number(learning.samples || 0)} 样本</strong><em>${Number(learning.training_matches || 0)} 场 · 留一准确率 ${accuracy}</em></div>`;
  };
  if (!evaluation) {
    const frozen = state.golden.document?.status !== "draft";
    scopeBadge.textContent = frozen ? "标签已冻结" : "等待标签冻结";
    scopeBadge.className = `evidence-tag ${frozen ? "fact" : "derived"}`;
    grid.innerHTML = `<div class="golden-metric"><small>评测状态</small><strong>--</strong><em>${frozen ? "可运行本场诊断或全库验收" : "草稿不计入发布门槛"}</em></div>${learningMetric()}`;
    return;
  }
  const corpus = evaluation.scope === "corpus";
  scopeBadge.textContent = corpus ? `全库 · ${evaluation.matches_evaluated || 0} 场` : `本场 · ${evaluation.annotation_status || "已冻结"}`;
  scopeBadge.className = `evidence-tag ${evaluation.provisional ? "derived" : "fact"}`;
  const gates = evaluation.gates || {};
  const rows = [
    ...(corpus ? [["黄金样本场次", gates.corpus_size, (value) => `${Math.round(value)} 场`]] : []),
    ["团战精确率", gates.teamfight_precision, (value) => `${(value * 100).toFixed(1)}%`],
    ["团战召回率", gates.teamfight_recall, (value) => `${(value * 100).toFixed(1)}%`],
    ["线上误报", gates.lane_false_positive, (value) => `${(value * 100).toFixed(1)}%`],
    ["2v2 升级", gates.two_versus_two_upgrades, (value) => `${Math.round(value)} 次`],
    ["参与者 F1", gates.participant_macro_f1, (value) => `${(value * 100).toFixed(1)}%`],
    ["圆心中位误差", gates.center_median_error, (value) => `${Math.round(value)} u`],
  ];
  grid.innerHTML = rows.map(([label, gate, formatter]) => {
    const evaluable = gate?.evaluable;
    const value = evaluable ? formatter(Number(gate.actual)) : "--";
    const target = gate ? `${gate.operator} ${gate.target}` : "无样本";
    return `<div class="golden-metric ${evaluable ? gate.passed ? "pass" : "fail" : ""}"><small>${label}</small><strong>${value}</strong><em>${evaluable ? `门槛 ${target} · ${gate.samples} 样本` : "样本不足"}</em></div>`;
  }).join("") + learningMetric();
}

async function renderGoldenAdjudicationDiff() {
  const panel = document.querySelector("#golden-adjudication-diff");
  panel.classList.remove("active");
  if (!state.golden.matchId || state.golden.annotator !== "adjudicated") return;
  try {
    const [primary, secondary] = await Promise.all([
      apiFetch(`/qa/goldens/${state.golden.matchId}?annotator=primary`, { timeout: 10000 }),
      apiFetch(`/qa/goldens/${state.golden.matchId}?annotator=secondary`, { timeout: 10000 }),
    ]);
    const primaryEvents = primary.events || [];
    const secondaryEvents = secondary.events || [];
    let labelDifferences = 0;
    for (const left of primaryEvents) {
      const nearest = secondaryEvents.reduce((best, right) => Math.abs(Number(right.contact_start_ms) - Number(left.contact_start_ms)) < Math.abs(Number(best?.contact_start_ms ?? Infinity) - Number(left.contact_start_ms)) ? right : best, null);
      if (!nearest || Math.abs(Number(nearest.contact_start_ms) - Number(left.contact_start_ms)) > 8000 || nearest.label !== left.label) labelDifferences++;
    }
    panel.innerHTML = `<span>标注员 A：<strong>${primaryEvents.length}</strong> 段 · ${primary.status || "未开始"}</span><span>标注员 B：<strong>${secondaryEvents.length}</strong> 段 · ${secondary.status || "未开始"}</span><span>待仲裁差异：<strong>${labelDifferences + Math.max(0, secondaryEvents.length - primaryEvents.length)}</strong></span><span class="spacer"></span><button class="command-button secondary" type="button" data-golden-seed="primary" ${primaryEvents.length ? "" : "disabled"}>从 A 导入</button><button class="command-button secondary" type="button" data-golden-seed="secondary" ${secondaryEvents.length ? "" : "disabled"}>从 B 导入</button>`;
    panel.classList.add("active");
  } catch {
    panel.innerHTML = "读取双标差异失败";
    panel.classList.add("active");
  }
}

async function seedGoldenAdjudication(source) {
  if (state.golden.annotator !== "adjudicated" || !state.golden.matchId) return;
  try {
    const sourceDocument = await apiFetch(`/qa/goldens/${state.golden.matchId}?annotator=${encodeURIComponent(source)}`, { timeout: 10000 });
    const events = JSON.parse(JSON.stringify(sourceDocument.events || []));
    if (!events.length) throw new Error("该标注员还没有可导入片段");
    state.golden.document.events = events;
    state.golden.document.status = "draft";
    state.golden.selectedEventId = events[0].id;
    state.golden.currentTimeMs = Number(events[0].contact_start_ms) || 0;
    state.golden.dirty = true;
    state.golden.evaluation = null;
    renderGoldenWorkspace();
    await renderGoldenAdjudicationDiff();
    showToast("已导入仲裁底稿", `${GOLDEN_ANNOTATOR_META[source]} · ${events.length} 个片段`, "copy-check");
  } catch (error) {
    showToast("无法导入底稿", error.message || "请先完成双人标注", "circle-alert");
  }
}

function setGoldenTime(milliseconds) {
  state.golden.currentTimeMs = clamp(Math.round(Number(milliseconds) || 0), 0, goldenDurationMs());
  renderGoldenStage();
}

function selectGoldenEvent(eventId, { movePlayhead = true } = {}) {
  const event = state.golden.document?.events?.find((item) => item.id === eventId);
  if (!event) return;
  state.golden.selectedEventId = eventId;
  if (movePlayhead) state.golden.currentTimeMs = Number(event.contact_start_ms) || 0;
  renderGoldenEventList();
  renderGoldenStage();
  renderGoldenInspector();
  refreshIcons(document.querySelector(".golden-inspector-panel"));
}

function addGoldenEvent() {
  if (!state.golden.document) return;
  const now = state.golden.currentTimeMs;
  const end = Math.min(goldenDurationMs(), now + 12_000);
  const id = `gold-${Date.now().toString(36)}`;
  const event = {
    id,
    label: "trade",
    review_start_ms: Math.max(-180_000, now - 10_000),
    contact_start_ms: now,
    contact_end_ms: end,
    peak_ms: Math.min(end, now + 4_000),
    participants: [],
    nearby_slots: [],
    tags: [],
    confidence: "medium",
    radius_world: 700,
    notes: "",
  };
  state.golden.document.events = [...(state.golden.document.events || []), event];
  state.golden.selectedEventId = id;
  state.golden.dirty = true;
  renderGoldenWorkspace();
}

function deleteGoldenEvent() {
  const id = state.golden.selectedEventId;
  if (!id || !state.golden.document) return;
  const events = state.golden.document.events || [];
  const index = events.findIndex((event) => event.id === id);
  state.golden.document.events = events.filter((event) => event.id !== id);
  state.golden.selectedEventId = state.golden.document.events[Math.max(0, index - 1)]?.id || null;
  state.golden.dirty = true;
  renderGoldenWorkspace();
}

function updateGoldenEvent(change, { renderInspector = true } = {}) {
  const event = goldenSelectedEvent();
  if (!event) return;
  Object.assign(event, change);
  state.golden.dirty = true;
  renderGoldenEventList();
  renderGoldenStage();
  if (renderInspector) renderGoldenInspector();
}

function suggestGoldenParticipants() {
  const event = goldenSelectedEvent();
  if (!event) return;
  const start = Number(event.review_start_ms);
  const end = Number(event.contact_end_ms);
  const scores = new Map();
  for (const signal of goldenRawCombatEvents(start, end)) {
    const weight = signal.kind === "hero_death" ? 4 : signal.kind === "control" ? 2 : 1;
    for (const key of ["actor_slot", "target_slot"]) {
      const slot = Number(signal[key]);
      if (Number.isInteger(slot) && slot >= 0 && slot < 10) scores.set(slot, (scores.get(slot) || 0) + weight);
    }
  }
  const participants = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .map(([slot]) => slot)
    .sort((a, b) => a - b);
  if (!participants.length) {
    showToast("没有提取到参与者", "当前时间窗口缺少带玩家槽位的原始战斗事件", "circle-alert");
    return;
  }
  updateGoldenEvent({ participants });
  showToast("已从原始事件提取", `${participants.length} 位候选参与者，仍需人工核对`, "users-round");
}

function goldenMedian(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function suggestGoldenCenter() {
  const event = goldenSelectedEvent();
  if (!event) return;
  const snapshots = (event.participants || []).map((slot) => goldenSnapshotAt(Number(slot), Number(event.peak_ms))).filter((snapshot) => {
    return snapshot?.coordinate_valid !== false && Number.isFinite(Number(snapshot?.x)) && Number.isFinite(Number(snapshot?.y));
  });
  const mapX = goldenMedian(snapshots.map((snapshot) => Number(snapshot.x)));
  const mapY = goldenMedian(snapshots.map((snapshot) => Number(snapshot.y)));
  if (!Number.isFinite(mapX) || !Number.isFinite(mapY)) {
    showToast("无法建议主战场圆心", "参与者峰值时刻没有有效位置快照", "circle-alert");
    return;
  }
  const regionCounts = new Map();
  for (const snapshot of snapshots) {
    const region = snapshot.region || snapshot.location;
    if (region) regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
  }
  const region = [...regionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  updateGoldenEvent({ center: { map_x: Number(mapX.toFixed(2)), map_y: Number(mapY.toFixed(2)), ...(region ? { region } : {}) } });
  showToast("已建议主战场圆心", `采用 ${snapshots.length} 位参与者峰值位置的中位数`, "locate-fixed");
}

function setGoldenBoundary(field) {
  if (!goldenSelectedEvent()) return;
  updateGoldenEvent({ [field]: state.golden.currentTimeMs });
}

function duplicateGoldenEvent() {
  const source = goldenSelectedEvent();
  if (!source || !state.golden.document) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `gold-${Date.now().toString(36)}`;
  copy.confidence = "medium";
  copy.notes = copy.notes ? `${copy.notes}（复制待核对）` : "复制片段，待核对";
  state.golden.document.events = [...(state.golden.document.events || []), copy];
  state.golden.selectedEventId = copy.id;
  state.golden.currentTimeMs = Number(copy.contact_start_ms) || 0;
  state.golden.dirty = true;
  renderGoldenWorkspace();
  showToast("已复制当前片段", "时间、参与者和圆心已保留，请调整差异项", "copy-plus");
}

function nextIncompleteGoldenEvent() {
  const events = [...(state.golden.document?.events || [])].sort((a, b) => Number(a.contact_start_ms) - Number(b.contact_start_ms));
  const incomplete = events.filter((event) => goldenEventIssues(event).length);
  if (!incomplete.length) {
    showToast("当前片段均已完整", "可以冻结标签并运行本场诊断", "list-checks");
    return;
  }
  const currentIndex = incomplete.findIndex((event) => event.id === state.golden.selectedEventId);
  const target = incomplete[(currentIndex + 1 + incomplete.length) % incomplete.length];
  selectGoldenEvent(target.id);
  showToast("已跳到待完善片段", goldenEventIssues(target).map((issue) => issue.label).join("、"), "list-checks");
}

function toggleGoldenMapFocus() {
  state.golden.mapFocused = !state.golden.mapFocused;
  renderGoldenLayoutState();
  window.requestAnimationFrame(() => renderGoldenDensity());
}

function toggleGoldenSignals() {
  state.golden.signalsExpanded = !state.golden.signalsExpanded;
  renderGoldenLayoutState();
  window.requestAnimationFrame(() => renderGoldenDensity());
}

function toggleGoldenEvaluation() {
  state.golden.evaluationExpanded = !state.golden.evaluationExpanded;
  renderGoldenLayoutState();
  window.requestAnimationFrame(() => renderGoldenDensity());
}

async function saveGoldenDocument({ silent = false } = {}) {
  if (!state.golden.document || !state.golden.matchId) return false;
  state.golden.document.status = document.querySelector("#golden-status-select").value;
  state.golden.document.blind_mode = state.golden.annotator !== "adjudicated";
  if (state.golden.document.status !== "draft") {
    const incomplete = [...(state.golden.document.events || [])]
      .sort((a, b) => Number(a.contact_start_ms) - Number(b.contact_start_ms))
      .find((event) => goldenEventIssues(event).length);
    if (incomplete) {
      selectGoldenEvent(incomplete.id);
      showToast("还有片段未完善", goldenEventIssues(incomplete).map((issue) => issue.label).join("、"), "circle-alert");
      return false;
    }
  }
  try {
    const saved = await apiFetch(`/qa/goldens/${state.golden.matchId}?annotator=${encodeURIComponent(state.golden.annotator)}`, {
      method: "PUT",
      timeout: 20000,
      body: state.golden.document,
    });
    state.golden.document = saved;
    state.golden.dirty = false;
    if (!silent) showToast("黄金样本已保存", `${GOLDEN_ANNOTATOR_META[state.golden.annotator]} · ${saved.event_count || 0} 个片段`, "save");
    await loadGoldenMatches({ silent: true });
    renderGoldenWorkspace();
    return true;
  } catch (error) {
    showToast("标注未保存", error.message || "请检查时间、参与者和地图圆心", "circle-alert");
    return false;
  }
}

async function runGoldenEvaluation() {
  if (state.golden.dirty && !await saveGoldenDocument({ silent: true })) return;
  if (state.golden.document?.status === "draft") {
    showToast("草稿不能进入评测", "先完成整场盲标并把文档状态改为标注完成", "lock-keyhole");
    return;
  }
  try {
    state.golden.evaluation = await apiFetch(`/qa/goldens/${state.golden.matchId}/evaluate?annotator=${encodeURIComponent(state.golden.annotator)}`, {
      method: "POST",
      timeout: 30000,
      body: {},
    });
    state.golden.evaluationScope = "match";
    renderGoldenEvaluation();
    showToast("评测完成", `匹配 ${state.golden.evaluation.matched_events || 0} 个战斗片段`, "flask-conical");
  } catch (error) {
    showToast("评测失败", error.message || "请先保存至少一个片段", "circle-alert");
  }
}

async function runGoldenBenchmark() {
  try {
    state.golden.evaluation = await apiFetch("/qa/goldens/evaluate?annotator=adjudicated", {
      method: "POST",
      timeout: 120000,
      body: {},
    });
    state.golden.evaluationScope = "corpus";
    renderGoldenEvaluation();
    const count = state.golden.evaluation.matches_evaluated || 0;
    showToast("全库验收完成", `${count} 场已仲裁比赛进入发布门槛`, "gauge");
  } catch (error) {
    showToast("全库验收失败", error.message || "请确认已有仲裁完成的黄金样本", "circle-alert");
  }
}

function updateGoldenTimeField(field, input) {
  const milliseconds = parseGoldenTimeInput(input.value);
  if (!Number.isFinite(milliseconds)) {
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    showToast("时间格式不正确", "请使用 分:秒.毫秒，例如 08:04.250", "circle-alert");
    input.focus();
    input.select();
    return;
  }
  input.classList.remove("invalid");
  input.removeAttribute("aria-invalid");
  input.value = formatGoldenTime(milliseconds);
  updateGoldenEvent({ [field]: milliseconds }, { renderInspector: false });
}

function renderDetailView(view) {
  if (view === "development") window.requestAnimationFrame(() => ensureChart());
  if (view === "farm") window.requestAnimationFrame(renderFarmAnalysis);
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
    const changed = await fetchAnalysisModules(analysis, matchId, missing);
    if (!changed || state.currentAnalysis !== analysis) return;
    hydrateAnalysisModules(analysis);
    renderTimelineMarkers();
    renderMapMarkers();
    renderWardFilterOptions();
    if (state.detailView === view) renderDetailView(view);
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
  renderDetailView(view);
  void ensureAnalysisModulesForView(view);
  syncTopbarActions();
  refreshIcons();
}

function setPage(page) {
  state.page = page;
  document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  const navPage = page === "detail" ? "matches" : page;
  document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === navPage));
  const detailMode = page === "detail";
  document.querySelector("#app-main").classList.toggle("detail-mode", detailMode);
  document.querySelector("#global-statusbar").classList.toggle("hidden", detailMode);
  document.querySelector("#playback-controller").classList.toggle("hidden", !detailMode);
  document.querySelector("#back-to-matches").classList.toggle("hidden", !detailMode);

  const titles = {
    matches: ["比赛", state.matchesStatus === "ready" ? `账号 ${state.accountId} · OpenDota 最近比赛` : "等待连接账号"],
    replays: ["Replay 库", "本地回放与分析包"],
    tasks: ["解析任务", "单任务队列"],
    goldens: ["黄金样本", "QA-01 · 团战盲标与模型验收"],
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
  if (page === "goldens" && !state.golden.matches.length) loadGoldenMatches({ silent: true });
  refreshIcons();
}

function setSettingsPanel(panelName) {
  const button = document.querySelector(`[data-settings-panel="${panelName}"]`);
  const panel = document.querySelector(`[data-settings-content="${panelName}"]`);
  if (!button || !panel) return;
  state.settingsPanel = panelName;
  document.querySelectorAll("[data-settings-panel]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-settings-content]").forEach((item) => item.classList.toggle("active", item === panel));
}

function syncTopbarActions() {
  const importButton = document.querySelector("#topbar-import");
  const searchButton = document.querySelector("#global-search-toggle");
  importButton.classList.remove("hidden");
  searchButton.classList.remove("hidden");
  if (state.page === "detail") {
    importButton.innerHTML = `<i data-lucide="rotate-cw"></i><span>重新解析</span>`;
    searchButton.classList.toggle("hidden", !["timeline"].includes(state.detailView));
  } else if (state.page === "goldens") {
    importButton.classList.add("hidden");
    searchButton.classList.add("hidden");
  } else {
    importButton.innerHTML = `<i data-lucide="file-plus-2"></i><span>导入 Replay</span>`;
  }
  refreshIcons(importButton);
}

function applyAnalysisToProduct(analysis, match) {
  state.analysisModuleLoads.clear();
  normalizeAnalysisSnapshots(analysis);
  state.currentAnalysis = analysis;
  state.currentMatch = match;
  const replayRecord = {
    id: match.id,
    file: analysis.replay_file || `${match.id}.dem`,
    size: analysis.replay_bytes ? formatBytes(analysis.replay_bytes) : "已缓存",
    modified: formatGeneratedAt(analysis.generated_at),
    patch: analysis.match?.patch_name || `ID ${analysis.match?.patch ?? "--"}`,
    status: "full",
    package: formatBytes(analysis.raw_archive_bytes || analysis.raw_bytes),
    rawBytes: Number(analysis.raw_archive_bytes || analysis.raw_bytes) || 0,
  };
  state.replays = [replayRecord, ...state.replays.filter((replay) => replay.id !== match.id)];
  MATCH_DURATION = Math.max(1, Number(analysis.match?.duration || match.duration || 1));
  const players = [...(analysis.match?.players || [])].sort((a, b) => Number(a.player_slot) - Number(b.player_slot));
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
        me: String(player.account_id || "") === String(state.accountId),
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
    state.selectedHeroSlot = Math.max(0, HEROES.findIndex((hero) => hero.me));
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
  document.querySelector("#detail-patch").textContent = analysis.match?.patch_name || (analysis.match?.patch ? `ID ${analysis.match.patch}` : "--");
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
  renderWardFilterOptions();
  renderWardAnalysis();
  renderFarmAnalysis();
  renderBuild();
  renderCombat();
  filterTimelineEvents();
  renderScoreboard();
  renderCoverage();
  renderReplays();
  setPage("detail");
  setDetailView("development");
  updateCurrentTime(0, { syncSegment: false });
}

async function loadAnalysis(match) {
  const analysis = await apiFetch(`/matches/${match.id}/analysis`, { timeout: 60000 });
  match.status = "full";
  match.progress = null;
  updateMatchSummary();
  renderMatches();
  applyAnalysisToProduct(analysis, match);
  if (analysis.upgrade_required) {
    showToast("已打开旧版分析", "为避免再次超时，本次未同步重建索引；可用“重新解析”升级", "history");
  }
}

function rememberTask(job) {
  state.taskHistory = [job, ...state.taskHistory.filter((item) => item.id !== job.id)].slice(0, 20);
}

function updateMatchFromJob(job) {
  const match = state.matches.find((item) => item.id === String(job.match_id));
  if (!match) return null;
  match.progress = Number(job.progress) || 0;
  match.localJob = job;
  match.status = job.status === "completed" ? "full"
    : job.status === "failed" ? "failed"
      : job.status === "canceled" ? "canceled" : "processing";
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
    showToast("Replay 解析失败", TASK_ERROR_MESSAGES[job.error_code] || job.message || "可在任务页重新解析", "circle-alert");
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
    updateMatchFromJob(job);
    renderTasks();
    if (["completed", "failed", "canceled"].includes(job.status)) {
      await finishJob(job);
      return;
    }
    state.jobPollTimer = window.setTimeout(() => pollJob(jobId), 1200);
  } catch (error) {
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

function togglePlayback() {
  state.isPlaying = !state.isPlaying;
  const button = document.querySelector("#play-toggle");
  button.innerHTML = `<i data-lucide="${state.isPlaying ? "pause" : "play"}"></i>`;
  button.title = state.isPlaying ? "暂停" : "播放";
  refreshIcons(button);
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
  if (state.isPlaying) {
    state.timer = window.setInterval(() => {
      const nextMs = state.playheadMs + 250 * state.playbackRate;
      if (nextMs >= MATCH_DURATION * 1000) {
        state.isPlaying = false;
        window.clearInterval(state.timer);
        state.timer = null;
        updatePlayheadMs(MATCH_DURATION * 1000);
        button.innerHTML = `<i data-lucide="play"></i>`;
        refreshIcons(button);
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

function importReplay(file) {
  const fallbackName = "7284129980.dem";
  const name = file?.name || fallbackName;
  const id = name.match(/\d{8,}/)?.[0] || "7284129980";
  const size = file?.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "84.20 MB";
  state.replays.unshift({ id, file: name, size, modified: "刚刚", patch: "检测中", status: "processing", package: "—" });
  renderReplays();
  document.querySelector("#task-badge").textContent = "2";
  showToast("Replay 已加入队列", `${name} · 等待解析`, "file-check-2");
}

function bindGoldenEvents() {
  document.querySelector("#golden-match-select").addEventListener("change", (event) => loadGoldenMatch(event.target.value));
  document.querySelector("#golden-annotator-select").addEventListener("change", async (event) => {
    state.golden.annotator = event.target.value;
    await loadGoldenMatches({ silent: true });
    if (state.golden.matchId) await loadGoldenMatch(state.golden.matchId);
  });
  document.querySelector("#golden-reload").addEventListener("click", () => loadGoldenMatches({ reloadSelected: true }));
  document.querySelector("#golden-blind-toggle").addEventListener("change", (event) => {
    state.golden.blind = event.target.checked;
    renderGoldenPredictions();
  });
  document.querySelector("#golden-save").addEventListener("click", () => saveGoldenDocument());
  document.querySelector("#golden-add-event").addEventListener("click", addGoldenEvent);
  document.querySelector("#golden-next-incomplete").addEventListener("click", nextIncompleteGoldenEvent);
  document.querySelector("#golden-duplicate-event").addEventListener("click", duplicateGoldenEvent);
  document.querySelector("#golden-delete-event").addEventListener("click", deleteGoldenEvent);
  document.querySelector("#golden-suggest-participants").addEventListener("click", suggestGoldenParticipants);
  document.querySelector("#golden-suggest-center").addEventListener("click", suggestGoldenCenter);
  document.querySelector("#golden-map-focus").addEventListener("click", toggleGoldenMapFocus);
  document.querySelector("#golden-toggle-signals").addEventListener("click", toggleGoldenSignals);
  document.querySelector("#golden-toggle-evaluation").addEventListener("click", toggleGoldenEvaluation);
  document.querySelector("#golden-event-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-golden-event-id]");
    if (row) selectGoldenEvent(row.dataset.goldenEventId);
  });
  document.querySelector("#golden-time-slider").addEventListener("input", (event) => setGoldenTime(event.target.value));
  document.querySelector("#golden-density-canvas").addEventListener("click", (event) => {
    setGoldenTime(goldenDensityTimeFromPointer(event));
  });
  document.querySelector("#golden-density-canvas").addEventListener("mousemove", updateGoldenDensityTooltip);
  document.querySelector("#golden-density-canvas").addEventListener("mouseleave", () => document.querySelector("#golden-density-tooltip").classList.add("hidden"));
  document.querySelector("#golden-density-mode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-density-window]");
    if (button) setGoldenDensityWindow(button.dataset.goldenDensityWindow);
  });
  document.querySelector("#golden-prev-peak").addEventListener("click", () => jumpGoldenPeak(-1));
  document.querySelector("#golden-next-peak").addEventListener("click", () => jumpGoldenPeak(1));
  document.querySelector("#golden-step-back").addEventListener("click", () => setGoldenTime(state.golden.currentTimeMs - 1000));
  document.querySelector("#golden-step-forward").addEventListener("click", () => setGoldenTime(state.golden.currentTimeMs + 1000));
  document.querySelector("#golden-map").addEventListener("click", (event) => {
    const selected = goldenSelectedEvent();
    if (!selected) {
      showToast("先新建交互片段", "地图圆心必须归属于一个人工标签", "crosshair");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const mapX = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
    const mapY = clamp((event.clientY - rect.top) / rect.height * 100, 0, 100);
    updateGoldenEvent({ center: { map_x: Number(mapX.toFixed(2)), map_y: Number(mapY.toFixed(2)) } });
  });
  document.querySelector("#golden-label-control").addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-label]");
    if (button) updateGoldenEvent({ label: button.dataset.goldenLabel });
  });
  const timeFields = {
    "#golden-review-start": "review_start_ms",
    "#golden-contact-start": "contact_start_ms",
    "#golden-peak-time": "peak_ms",
    "#golden-contact-end": "contact_end_ms",
  };
  Object.entries(timeFields).forEach(([selector, field]) => {
    document.querySelector(selector).addEventListener("change", (event) => updateGoldenTimeField(field, event.target));
  });
  document.querySelector(".golden-boundary-actions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-set-boundary]");
    if (button) setGoldenBoundary(button.dataset.goldenSetBoundary);
  });
  document.querySelector("#golden-participant-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-participant]");
    const selected = goldenSelectedEvent();
    if (!button || !selected) return;
    const slot = Number(button.dataset.goldenParticipant);
    const participants = new Set((selected.participants || []).map(Number));
    if (participants.has(slot)) participants.delete(slot); else participants.add(slot);
    updateGoldenEvent({ participants: [...participants].sort((a, b) => a - b) });
  });
  document.querySelector("#golden-tag-grid").addEventListener("change", (event) => {
    const input = event.target.closest("[data-golden-tag]");
    const selected = goldenSelectedEvent();
    if (!input || !selected) return;
    const tags = new Set(selected.tags || []);
    if (input.checked) tags.add(input.dataset.goldenTag); else tags.delete(input.dataset.goldenTag);
    updateGoldenEvent({ tags: [...tags] });
  });
  document.querySelector("#golden-radius-slider").addEventListener("input", (event) => {
    document.querySelector("#golden-radius-value").textContent = event.target.value;
    updateGoldenEvent({ radius_world: Number(event.target.value) }, { renderInspector: false });
  });
  document.querySelector("#golden-confidence").addEventListener("change", (event) => updateGoldenEvent({ confidence: event.target.value }));
  document.querySelector("#golden-status-select").addEventListener("change", (event) => {
    if (!state.golden.document) return;
    state.golden.document.status = event.target.value;
    state.golden.dirty = true;
    document.querySelector("#golden-document-status").textContent = event.target.value === "adjudicated" ? "仲裁完成" : event.target.value === "complete" ? "标注完成" : "草稿";
    document.querySelector("#golden-run-evaluation").disabled = event.target.value === "draft";
    state.golden.evaluation = null;
    renderGoldenEvaluation();
  });
  document.querySelector("#golden-event-notes").addEventListener("input", (event) => {
    const selected = goldenSelectedEvent();
    if (!selected) return;
    selected.notes = event.target.value;
    state.golden.dirty = true;
  });
  document.querySelector("#golden-run-evaluation").addEventListener("click", runGoldenEvaluation);
  document.querySelector("#golden-run-benchmark").addEventListener("click", runGoldenBenchmark);
  document.querySelector("#golden-adjudication-diff").addEventListener("click", (event) => {
    const button = event.target.closest("[data-golden-seed]");
    if (button) seedGoldenAdjudication(button.dataset.goldenSeed);
  });
  window.addEventListener("resize", () => {
    if (state.page === "goldens" && state.golden.analysis) renderGoldenDensity();
  });
  window.addEventListener("keydown", (event) => {
    if (state.page === "goldens" && event.ctrlKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveGoldenDocument();
      return;
    }
    if (state.page !== "goldens" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
    if (event.key.toLowerCase() === "a") {
      event.preventDefault();
      addGoldenEvent();
    } else if (event.key === "[") {
      event.preventDefault();
      jumpGoldenPeak(-1);
    } else if (event.key === "]") {
      event.preventDefault();
      jumpGoldenPeak(1);
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleGoldenMapFocus();
    }
  });
}

function bindEvents() {
  bindGoldenEvents();
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
    document.querySelectorAll("#farm-time-filter button").forEach((item) => item.classList.toggle("active", item === button));
    renderFarmMap();
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
  document.querySelector("#combat-phase-strip").addEventListener("click", (event) => {
    const phase = event.target.closest("[data-combat-phase]");
    if (!phase) return;
    state.selectedCombatPhase = phase.dataset.combatPhase;
    updatePlayheadMs(phase.dataset.combatPhaseTimeMs, { syncSegment: false });
    renderSelectedCombat();
  });
  ["#combat-contribution-table", "#combat-map-players"].forEach((selector) => {
    document.querySelector(selector).addEventListener("click", (event) => {
      const player = event.target.closest("[data-combat-player-slot]");
      if (!player) return;
      state.selectedCombatPlayerSlot = Number(player.dataset.combatPlayerSlot);
      state.combatInspectorView = "audit";
      renderSelectedCombat();
    });
  });
  document.querySelector("#combat-inspector-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-combat-inspector]");
    if (button) setCombatInspectorView(button.dataset.combatInspector);
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
    const reparse = event.target.closest("[data-player-report-reparse]");
    if (reparse && state.currentMatch) startAutomaticParse(state.currentMatch, true);
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
    if (fileInput.files?.[0]) importReplay(fileInput.files[0]);
    fileInput.value = "";
  });
  document.querySelector("#scan-replays").addEventListener("click", (event) => {
    event.currentTarget.classList.add("is-spinning");
    window.setTimeout(() => {
      event.currentTarget.classList.remove("is-spinning");
      showToast("扫描完成", "没有发现新的本地 Replay", "scan-search");
    }, 800);
  });
  document.querySelector("#replay-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-replay-action]");
    if (!button) return;
    const match = state.matches.find((item) => item.id === button.dataset.replayId) || DEMO_MATCHES[0];
    if (button.dataset.replayAction === "open") openMatch(match);
    else if (state.matches.includes(match)) startAutomaticParse(match);
    else showToast("请先从比赛列表读取该场", `比赛 ${button.dataset.replayId}`, "list-search");
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
  document.querySelector(".settings-content").addEventListener("click", (event) => {
    if (event.target.closest(".command-button") && !event.target.closest("#settings-verify-account")) showToast("设置已保存", "本地配置已更新", "save");
  });
  document.querySelector("#topbar-refresh").addEventListener("click", async (event) => {
    event.currentTarget.classList.add("is-spinning");
    await checkParserStatus();
    if (state.page === "goldens") await loadGoldenMatches({ reloadSelected: true, silent: true });
    else if (state.matchesStatus === "ready") await loadMatches(state.accountId, { silent: true });
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
    if (event.dataTransfer?.files?.[0]) importReplay(event.dataTransfer.files[0]);
  });

  window.addEventListener("keydown", (event) => {
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
    const chartContainer = document.querySelector("#development-chart");
    if (state.chart && chartContainer?.clientWidth > 1 && chartContainer?.clientHeight > 1) state.chart.resize();
    if (state.page === "detail" && state.detailView === "combat") {
      window.requestAnimationFrame(() => resolveCombatMarkerCollisions(document.querySelector("#combat-map-players")));
    }
  });
}

async function init() {
  restoreDirectorySettings();
  applyScoreboardStressFixture();
  renderMatches();
  renderHeroStrip();
  renderLaneReview();
  setDevelopmentSideView(state.developmentSideView);
  renderSegments();
  renderTimelineMarkers();
  renderMapMarkers();
  renderWardFilterOptions();
  renderWardAnalysis();
  renderFarmAnalysis();
  renderBuild();
  renderCombat();
  filterTimelineEvents();
  renderScoreboard();
  renderCoverage();
  renderReplays();
  renderTasks();
  renderGoldenMatchOptions();
  renderGoldenWorkspace();
  bindEvents();
  setPage("matches");
  updateAccountChrome();
  updateCurrentTime(state.currentTime, { syncSegment: false });
  refreshIcons();
  if (PREVIEW_VIEW) {
    if (PREVIEW_VIEW === "goldens") {
      setPage("goldens");
      const online = await checkParserStatus();
      if (online) {
        await loadGoldenMatches({ silent: true });
        const previewMatch = state.golden.matches.find((match) => match.annotation?.exists) || state.golden.matches[0];
        if (previewMatch) await loadGoldenMatch(previewMatch.match_id);
      }
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
      const player = analysis.match?.players?.find((item) => String(item.account_id || "") === String(state.accountId))
        || analysis.match?.players?.[0]
        || {};
      const match = normalizeMatch({
        ...analysis.match,
        ...player,
        match_id: PREVIEW_MATCH_ID,
        local_status: "full",
      });
      applyAnalysisToProduct(analysis, match);
      setDetailView(["development", "farm", "vision", "combat", "players"].includes(PREVIEW_VIEW) ? PREVIEW_VIEW : "farm");
      document.documentElement.dataset.qaMatchLoaded = PREVIEW_MATCH_ID;
      return;
    }
    state.currentMatch = { ...DEMO_MATCHES[0], id: "preview" };
    setPage("detail");
    setDetailView(["development", "farm", "vision", "combat", "players"].includes(PREVIEW_VIEW) ? PREVIEW_VIEW : "farm");
    return;
  }
  const online = await checkParserStatus();
  state.parserPollTimer = window.setInterval(() => checkParserStatus({ retries: 0 }), 10000);
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
