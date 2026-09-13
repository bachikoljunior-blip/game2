// Original fresh-design mission. Shared by simulation, presentation and interface.
export const SIGNAL = Object.freeze({ x: 0, z: -19.6, radius: 1.65 });
export const INTRO = '谷に残る人々へ、山道が開いたことを知らせる。道を塞ぐ剣士を退け、社の正面の灯をともそう。';
export const ENDING = '社の灯がともった。谷で待つ人々に、山道が開いたことが伝わる。刃を納め、風を聞く。';
export function canLightSignal(world) {
  return world.pathCleared && world.player.hp > 0 && world.enemies.every(enemy => enemy.hp <= 0) &&
    Math.hypot(world.player.x - SIGNAL.x, world.player.z - SIGNAL.z) <= SIGNAL.radius;
}
export function objectiveText(world) {
  if (world.player.hp <= 0) return '灯はまだ消えている。もう一度、山道へ。';
  if (world.signalLit) return '社の灯が、谷への合図になった';
  const remaining = world.enemies.filter(enemy => enemy.hp > 0).length;
  if (!remaining) return canLightSignal(world)?'E または「灯す」で、谷へ合図を送る':'道は開いた。社の正面の灯に近づく';
  if (world.player.z > 10 && !world.totals.kills) return '谷へ合図を送るため、鳥居の先へ';
  return `灯へ続く道を開く　残る剣士 ${remaining}`;
}
