// Original fresh-route layout. Shared by collision, presentation and test drivers.
const smooth = value => value * value * (3 - 2 * value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const ROUTE_FORK = Object.freeze({
  splitStartZ: -1.5,
  obstacleFrontZ: -4.25,
  obstacleBackZ: -14.25,
  rejoinZ: -17.2,
  pathHalfWidth: .82,
  rejoinHalfWidth: 2.1,
  obstacle: Object.freeze({ kind: 'route-ridge', x: 0, z: -9.25, w: 4.4, d: 10, h: 2.8 }),
  left: Object.freeze({
    id: 'left', x: -3.45, label: '石灯の道', landmark: '石灯', consequence: '近い道で留守居と早く対峙',
    consequenceId: 'early-retainer', enemyId: 'retainer',
    markers: Object.freeze([
      Object.freeze({ x: -4.9, z: -6.25 }),
      Object.freeze({ x: -4.75, z: -9.75 }),
      Object.freeze({ x: -4.45, z: -13.1 })
    ])
  }),
  right: Object.freeze({
    id: 'right', x: 4.55, label: '風布の道', landmark: '風布', consequence: '長い迂回で岩尾根と社を見渡す',
    consequenceId: 'overlook-warden', enemyId: 'warden',
    markers: Object.freeze([
      Object.freeze({ x: 5.85, z: -6.15 }),
      Object.freeze({ x: 5.95, z: -9.7 }),
      Object.freeze({ x: 5.55, z: -13.25 })
    ])
  })
});

export const ROUTE_IDS = Object.freeze(['left', 'right']);
export const isRouteId = route => ROUTE_IDS.includes(route);
export function routeEncounterActive(routePhase, routeChoice, enemyId) {
  const route = ROUTE_IDS.find(id => ROUTE_FORK[id].enemyId === enemyId);
  return !route || routePhase === 'rejoined' || routeChoice === route;
}
const branchFor = route => {
  if (!isRouteId(route)) throw new RangeError(`Unknown route: ${route}`);
  return ROUTE_FORK[route];
};

export function routeCenterAt(route, z) {
  const branch = branchFor(route);
  const { splitStartZ, obstacleFrontZ, obstacleBackZ, rejoinZ } = ROUTE_FORK;
  if (z >= splitStartZ || z <= rejoinZ) return 0;
  if (z > obstacleFrontZ) {
    const t = clamp((splitStartZ - z) / (splitStartZ - obstacleFrontZ), 0, 1);
    return branch.x * smooth(t);
  }
  if (z >= obstacleBackZ) return branch.x;
  const t = clamp((obstacleBackZ - z) / (obstacleBackZ - rejoinZ), 0, 1);
  return branch.x * (1 - smooth(t));
}

export function routePathCenters(z) {
  const left = routeCenterAt('left', z), right = routeCenterAt('right', z);
  return Math.abs(right - left) < .7 ? [0] : [left, right];
}

export function distanceFromRoute(x, z) {
  return Math.min(...routePathCenters(z).map(center => Math.abs(x - center)));
}

export function routeWaypoint(route, stage = 'middle') {
  const branch = branchFor(route);
  if (stage === 'approach') return { x: 0, z: 5.35 };
  if (stage === 'entry') return { x: branch.x, z: ROUTE_FORK.obstacleFrontZ - .8 };
  if (stage === 'exit') return { x: branch.x, z: ROUTE_FORK.obstacleBackZ - .75 };
  if (stage === 'rejoin') return { x: 0, z: ROUTE_FORK.rejoinZ - .8 };
  return { x: branch.x, z: ROUTE_FORK.obstacle.z };
}

// Test players use the same authored corridor as the rendered stones. The three
// waypoints keep them on their chosen side until the solid ridge is behind them.
export function routeTravelGoal(position, route) {
  if (position.z > 5.55) return routeWaypoint(route, 'approach');
  if (position.z > ROUTE_FORK.obstacleFrontZ - .45) return routeWaypoint(route, 'entry');
  if (position.z > ROUTE_FORK.obstacleBackZ - .45) return routeWaypoint(route, 'exit');
  if (position.z > ROUTE_FORK.rejoinZ - .45) return routeWaypoint(route, 'rejoin');
  return null;
}

export function routePathLength(route) {
  const branch = branchFor(route);
  return Math.hypot(branch.x, ROUTE_FORK.splitStartZ - ROUTE_FORK.obstacleFrontZ) +
    (ROUTE_FORK.obstacleFrontZ - ROUTE_FORK.obstacleBackZ) +
    Math.hypot(branch.x, ROUTE_FORK.obstacleBackZ - ROUTE_FORK.rejoinZ);
}

export function routeChoiceAt(position) {
  const margin = .28;
  if (position.z > ROUTE_FORK.obstacleFrontZ + margin ||
      position.z < ROUTE_FORK.obstacleBackZ - margin) return null;
  const clearance = ROUTE_FORK.obstacle.w / 2 + .35;
  if (position.x <= -clearance && position.x >= ROUTE_FORK.left.x - 1.7) return 'left';
  if (position.x >= clearance && position.x <= ROUTE_FORK.right.x + 1.7) return 'right';
  return null;
}

export function routeLabel(route) {
  return branchFor(route).label;
}
