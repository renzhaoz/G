import type { CSSRGB, ParsedBaseStyleProps } from '@antv/g';
import { Shape } from '@antv/g';
import { singleton } from 'mana-syringe';
import { isNil } from '@antv/util';
import { StyleRenderer } from './interfaces';

@singleton({
  token: [
    { token: StyleRenderer, named: Shape.CIRCLE },
    { token: StyleRenderer, named: Shape.ELLIPSE },
    { token: StyleRenderer, named: Shape.RECT },
    { token: StyleRenderer, named: Shape.LINE },
    { token: StyleRenderer, named: Shape.POLYLINE },
    { token: StyleRenderer, named: Shape.POLYGON },
    { token: StyleRenderer, named: Shape.PATH },
  ],
})
export class DefaultRenderer implements StyleRenderer {
  hash(parsedStyle: ParsedBaseStyleProps) {
    // const { fill, opacity, fillOpacity, stroke, strokeOpacity, lineWidth, lineCap, lineJoin } =
    //   parsedStyle;

    // return fill + opacity + fillOpacity + stroke + strokeOpacity + lineWidth + lineCap + lineJoin;
    return '';
  }

  render(context: CanvasRenderingContext2D, parsedStyle: ParsedBaseStyleProps) {
    const {
      fill,
      opacity,
      fillOpacity,
      stroke,
      strokeOpacity,
      lineWidth,
      lineCap,
      lineJoin,
      shadowColor,
      filter,
      miterLimit,
    } = parsedStyle;
    const hasFill = !isNil(fill);
    const hasStroke = !isNil(stroke);
    const isFillTransparent = (fill as CSSRGB).alpha === 0;

    if (hasFill) {
      if (!isNil(fillOpacity) && fillOpacity.value !== 1) {
        context.globalAlpha = fillOpacity.value;
        context.fill();
        context.globalAlpha = opacity.value;
      } else {
        context.fill();
      }
    }

    if (hasStroke) {
      if (lineWidth && lineWidth.value > 0) {
        const applyOpacity = !isNil(strokeOpacity) && strokeOpacity.value !== 1;
        if (applyOpacity) {
          context.globalAlpha = strokeOpacity.value;
        }
        context.lineWidth = lineWidth.value;
        if (!isNil(miterLimit)) {
          context.miterLimit = miterLimit;
        }

        if (!isNil(lineCap)) {
          context.lineCap = lineCap.value as CanvasLineCap;
        }

        if (!isNil(lineJoin)) {
          context.lineJoin = lineJoin.value as CanvasLineJoin;
        }

        let oldShadowBlur: number;
        let oldShadowColor: string;
        let oldFilter: string;
        const hasShadowColor = !isNil(shadowColor);
        const hasFilter = !isNil(filter);

        if (hasShadowColor) {
          // prevent inner shadow when drawing stroke, toggle shadowBlur & filter(drop-shadow)
          // save shadow blur
          oldShadowBlur = context.shadowBlur;
          oldShadowColor = context.shadowColor;
          if (!isNil(oldShadowBlur)) {
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
          }
        }

        if (hasFilter) {
          // save drop-shadow filter
          oldFilter = context.filter;
          if (!isNil(oldFilter) && oldFilter.indexOf('drop-shadow') > -1) {
            context.filter = oldFilter.replace(/drop-shadow\([^)]*\)/, '').trim() || 'none';
          }
        }

        const drawStroke = hasFill && !isFillTransparent;
        if (drawStroke) {
          context.stroke();
        }

        // restore shadow blur
        if (hasShadowColor) {
          context.shadowColor = oldShadowColor;
          context.shadowBlur = oldShadowBlur;
        }
        // restore filters
        if (hasFilter) {
          context.filter = oldFilter;
        }

        if (!drawStroke) {
          context.stroke();
        }
      }
    }
  }
}
