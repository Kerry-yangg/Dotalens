import assert from "node:assert/strict";
import test from "node:test";

import {
  combatContributionChartOption,
  combatContributionTooltip,
  combatResponsibilityRadarOption,
} from "../../combat-contribution-chart.js";

function player(slot, team, overrides = {}) {
  return {
    slot,
    team,
    position: slot % 5 + 1,
    hero: {
      player: `玩家${slot}`,
      name: `英雄${slot}`,
    },
    status: "passed",
    available: true,
    value: 72,
    display: "72",
    secondary: "通过 1/1 场",
    ...overrides,
  };
}

test("mirrored chart uses two aligned grids and one shared scale", () => {
  const option = combatContributionChartOption({
    metric: "responsibility",
    label: "职责评分",
    maxValue: 100,
    positions: [1, 2, 3, 4, 5],
    radiant: Array.from({ length: 5 }, (_, index) => player(index, "radiant")),
    dire: Array.from({ length: 5 }, (_, index) => player(index + 5, "dire")),
  });

  assert.equal(option.grid.length, 2);
  assert.equal(option.xAxis[0].inverse, true);
  assert.equal(option.xAxis[0].max, 100);
  assert.equal(option.xAxis[1].max, 100);
  assert.equal(option.series[0].data[0].slot, 0);
  assert.equal(option.series[1].data[0].slot, 5);
  assert.deepEqual(option.yAxis[0].data, ["1", "2", "3", "4", "5"]);
});

test("absent players remain clickable data rows but render as grey zero bars", () => {
  const option = combatContributionChartOption({
    metric: "damage",
    label: "伤害",
    maxValue: 1200,
    positions: [1, 2, 3, 4, 5],
    radiant: [
      player(0, "radiant", {
        status: "not_participant",
        available: false,
        value: 0,
        display: "未进入主战场",
      }),
    ],
    dire: [player(5, "dire", { value: 1200, display: "1,200" })],
  });

  const absent = option.series[0].data[0];
  assert.equal(absent.value, 0);
  assert.equal(absent.slot, 0);
  assert.equal(absent.itemStyle.color, "#626b70");
  assert.equal(absent.display, "未进入主战场");
});

test("blocked responsibility tooltip explains the gate without a numeric score", () => {
  const tooltip = combatContributionTooltip({
    seriesName: "天辉",
    data: player(0, "radiant", {
      status: "blocked",
      available: false,
      value: 0,
      display: "客观条件阻断",
      secondary: "通过 0/1 场",
    }),
  });

  assert.match(tooltip, /客观条件阻断/);
  assert.doesNotMatch(tooltip, />0(?:\.0)?</);
  assert.doesNotMatch(tooltip, /职责评分\s*0/);
});

test("compact chart narrows both external label gutters equally", () => {
  const option = combatContributionChartOption({
    metric: "damage",
    label: "伤害",
    maxValue: 1200,
    labelWidth: 142,
    positions: [1, 2, 3, 4, 5],
    radiant: [player(0, "radiant")],
    dire: [player(5, "dire")],
  });

  assert.equal(option.grid[0].left, 142);
  assert.equal(option.grid[1].right, 142);
});

test("responsibility radar renders only available role axes", () => {
  const option = combatResponsibilityRadarOption({
    roleAxes: [
      { key: "damage_share", label: "输出占比", applicable: true, available: true, value: 72 },
      { key: "ability_casts", label: "技能执行", applicable: true, available: true, value: 60 },
      { key: "presence", label: "战场在场", applicable: true, available: true, value: 84 },
      { key: "arrival", label: "到场时机", applicable: true, available: false, value: null },
      { key: "control", label: "控制价值", applicable: false, available: false, value: null },
    ],
  });

  assert.deepEqual(
    option.radar.indicator.map((axis) => axis.name),
    ["输出占比", "技能执行", "战场在场"],
  );
  assert.deepEqual(option.series[0].data[0].value, [72, 60, 84]);
});

test("responsibility radar stays empty when fewer than three axes are judgeable", () => {
  const option = combatResponsibilityRadarOption({
    roleAxes: [
      { key: "damage_share", label: "输出占比", applicable: true, available: true, value: 72 },
      { key: "arrival", label: "到场时机", applicable: true, available: false, value: null },
    ],
  });

  assert.equal(option, null);
});
