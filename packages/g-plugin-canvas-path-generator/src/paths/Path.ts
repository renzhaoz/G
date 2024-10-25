import type { Path } from '@antv/g-lite';
import { isDisplayObject } from '@antv/g-lite';

export function generatePath(context: CanvasRenderingContext2D, path: Path) {
  const { markerStartOffset, markerEndOffset } = path.attributes;
  const { d } = path.parsedStyle;
  const { markerStart, markerEnd } = path.parsedStyle;
  const { absolutePath, segments } = d;

  let startOffsetX = 0;
  let startOffsetY = 0;
  let endOffsetX = 0;
  let endOffsetY = 0;

  let rad = 0;
  let x: number;
  let y: number;

  if (markerStart && isDisplayObject(markerStart) && markerStartOffset) {
    const [p1, p2] = (markerStart.parentNode as Path).getStartTangent();
    x = p1[0] - p2[0];
    y = p1[1] - p2[1];

    rad = Math.atan2(y, x);
    startOffsetX = Math.cos(rad) * (markerStartOffset || 0);
    startOffsetY = Math.sin(rad) * (markerStartOffset || 0);
  }

  if (markerEnd && isDisplayObject(markerEnd) && markerEndOffset) {
    const [p1, p2] = (markerEnd.parentNode as Path).getEndTangent();
    x = p1[0] - p2[0];
    y = p1[1] - p2[1];
    rad = Math.atan2(y, x);
    endOffsetX = Math.cos(rad) * (markerEndOffset || 0);
    endOffsetY = Math.sin(rad) * (markerEndOffset || 0);
  }

  for (let i = 0; i < absolutePath.length; i++) {
    const params = absolutePath[i];
    const command = params[0];
    const nextSegment = absolutePath[i + 1];
    const useStartOffset =
      i === 0 && (startOffsetX !== 0 || startOffsetY !== 0);
    const useEndOffset =
      (i === absolutePath.length - 1 ||
        (nextSegment && (nextSegment[0] === 'M' || nextSegment[0] === 'Z'))) &&
      endOffsetX !== 0 &&
      endOffsetY !== 0;

    switch (command) {
      case 'M':
        // Use start marker offset
        if (useStartOffset) {
          context.moveTo(params[1] + startOffsetX, params[2] + startOffsetY);
        } else {
          context.moveTo(params[1], params[2]);
        }
        break;
      case 'L':
        if (useEndOffset) {
          context.lineTo(params[1] + endOffsetX, params[2] + endOffsetY);
        } else {
          context.lineTo(params[1], params[2]);
        }
        break;
      case 'Q':
        context.quadraticCurveTo(params[1], params[2], params[3], params[4]);
        if (useEndOffset) {
          context.lineTo(params[3] + endOffsetX, params[4] + endOffsetY);
        }
        break;
      case 'C':
        context.bezierCurveTo(
          params[1],
          params[2],
          params[3],
          params[4],
          params[5],
          params[6],
        );
        if (useEndOffset) {
          context.lineTo(params[5] + endOffsetX, params[6] + endOffsetY);
        }
        break;
      case 'A': {
        const { arcParams } = segments[i];
        const { cx, cy, rx, ry, startAngle, endAngle, xRotation, sweepFlag } =
          arcParams;
        // @see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse
        if (context.ellipse) {
          context.ellipse(
            cx,
            cy,
            rx,
            ry,
            xRotation,
            startAngle,
            endAngle,
            !!(1 - sweepFlag),
          );
        } else {
          // @see https://stackoverflow.com/a/47494351
          const r = rx > ry ? rx : ry;
          const scaleX = rx > ry ? 1 : rx / ry;
          const scaleY = rx > ry ? ry / rx : 1;
          context.translate(cx, cy);
          context.rotate(xRotation);
          context.scale(scaleX, scaleY);
          context.arc(0, 0, r, startAngle, endAngle, !!(1 - sweepFlag));
          context.scale(1 / scaleX, 1 / scaleY);
          context.rotate(-xRotation);
          context.translate(-cx, -cy);
        }

        if (useEndOffset) {
          context.lineTo(params[6] + endOffsetX, params[7] + endOffsetY);
        }
        break;
      }
      case 'Z':
        context.closePath();
        break;
      default:
        break;
    }
  }
}
