import { Cubic as CubicUtil, Quad as QuadUtil } from '@antv/g-math';
import { clamp, distanceSquareRoot } from '@antv/util';

const SEGMENT_LENGTH = 10;
const MIN_SEGMENT_NUM = 8;
const MAX_SEGMENT_NUM = 100;

export function lineTo(toX: number, toY: number, points: number[]) {
  const fromX = points[points.length - 2];
  const fromY = points[points.length - 1];

  const l = distanceSquareRoot([fromX, fromY], [toX, toY]);
  const n = clamp(l / SEGMENT_LENGTH, MIN_SEGMENT_NUM, MAX_SEGMENT_NUM);

  for (let i = 1; i <= n; i++) {
    const t = i / n;
    points.push(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
  }
}

export function arcCurveTo(
  _startX: number,
  _startY: number,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  _anticlockwise: boolean,
  points: number[],
) {
  // const sweep = endAngle - startAngle;
  // const n = GRAPHICS_CURVES._segmentsCount(
  //   Math.abs(sweep) * radius,
  //   Math.ceil(Math.abs(sweep) / Math.PI * 2) * 40,
  // );
  // ArcUtil.length()
  // const theta = sweep / (n * 2);
  // const theta2 = theta * 2;
  // const cTheta = Math.cos(theta);
  // const sTheta = Math.sin(theta);
  // const segMinus = n - 1;
  // const remainder = (segMinus % 1) / segMinus;
  // for (let i = 0; i <= segMinus; ++i) {
  //   const real = i + remainder * i;
  //   const angle = theta + startAngle + theta2 * real;
  //   const c = Math.cos(angle);
  //   const s = -Math.sin(angle);
  //   points.push((cTheta * c + sTheta * s) * radius + cx, (cTheta * -s + sTheta * c) * radius + cy);
  // }
}

export function quadCurveTo(cpX: number, cpY: number, toX: number, toY: number, points: number[]) {
  const fromX = points[points.length - 2];
  const fromY = points[points.length - 1];

  const l = QuadUtil.length(fromX, fromY, cpX, cpY, toX, toY);
  const n = clamp(l / SEGMENT_LENGTH, MIN_SEGMENT_NUM, MAX_SEGMENT_NUM);

  let xa = 0;
  let ya = 0;

  for (let i = 1; i <= n; ++i) {
    const j = i / n;

    xa = fromX + (cpX - fromX) * j;
    ya = fromY + (cpY - fromY) * j;

    points.push(xa + (cpX + (toX - cpX) * j - xa) * j, ya + (cpY + (toY - cpY) * j - ya) * j);
  }
}

export function bezierCurveTo(
  cpX: number,
  cpY: number,
  cpX2: number,
  cpY2: number,
  toX: number,
  toY: number,
  points: number[],
): void {
  const fromX = points[points.length - 2];
  const fromY = points[points.length - 1];

  points.length -= 2;

  const l = CubicUtil.length(fromX, fromY, cpX, cpY, cpX2, cpY2, toX, toY);
  const n = clamp(l / SEGMENT_LENGTH, MIN_SEGMENT_NUM, MAX_SEGMENT_NUM);

  let dt = 0;
  let dt2 = 0;
  let dt3 = 0;
  let t2 = 0;
  let t3 = 0;

  points.push(fromX, fromY);

  for (let i = 1, j = 0; i <= n; ++i) {
    j = i / n;

    dt = 1 - j;
    dt2 = dt * dt;
    dt3 = dt2 * dt;

    t2 = j * j;
    t3 = t2 * j;

    points.push(
      dt3 * fromX + 3 * dt2 * j * cpX + 3 * dt * t2 * cpX2 + t3 * toX,
      dt3 * fromY + 3 * dt2 * j * cpY + 3 * dt * t2 * cpY2 + t3 * toY,
    );
  }
}
