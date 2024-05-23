import {
  CanvasContext,
  CSSGradientValue,
  CSSRGB,
  DisplayObject,
  GlobalRuntime,
  LinearGradient,
  ParsedBaseStyleProps,
  Pattern,
  RadialGradient,
  Rect,
} from '@antv/g-lite';
import { GradientType, isPattern, Shape } from '@antv/g-lite';
import type { ImagePool } from '@antv/g-plugin-image-loader';
import { isNil } from '@antv/util';
import { CanvasRendererPlugin } from '../../CanvasRendererPlugin';
import type { StyleRenderer } from './interfaces';

export class DefaultRenderer implements StyleRenderer {
  constructor(private imagePool: ImagePool) {}

  render(
    context: CanvasRenderingContext2D,
    parsedStyle: ParsedBaseStyleProps,
    object: DisplayObject,
    canvasContext: CanvasContext,
    plugin: CanvasRendererPlugin,
    runtime: GlobalRuntime,
  ) {
    const {
      fill,
      fillRule,
      opacity = 1,
      fillOpacity = 1,
      stroke,
      strokeOpacity = 1,
      lineWidth = 1,
      lineCap,
      lineJoin,
      shadowType,
      shadowColor,
      shadowBlur,
      filter,
      miterLimit,
    } = parsedStyle;
    const hasFill = fill && !(fill as CSSRGB).isNone;
    const hasStroke = stroke && !(stroke as CSSRGB).isNone && lineWidth > 0;

    const isFillTransparent = (fill as CSSRGB)?.alpha === 0;
    const hasFilter = !!(filter && filter.length);
    const hasShadow = !isNil(shadowColor) && shadowBlur > 0;
    const nodeName = object.nodeName;
    const isInnerShadow = shadowType === 'inner';
    const shouldDrawShadowWithStroke =
      hasStroke &&
      hasShadow &&
      (nodeName === Shape.PATH ||
        nodeName === Shape.LINE ||
        nodeName === Shape.POLYLINE ||
        isFillTransparent ||
        isInnerShadow);

    if (hasFill) {
      context.globalAlpha = opacity * fillOpacity;

      if (!shouldDrawShadowWithStroke) {
        setShadowAndFilter(object, context, hasShadow);
      }

      applyFill(
        context,
        object,
        fill,
        fillRule,
        canvasContext,
        plugin,
        runtime,
        this.imagePool,
      );

      if (!shouldDrawShadowWithStroke) {
        this.clearShadowAndFilter(context, hasFilter, hasShadow);
      }
    }

    if (hasStroke) {
      context.globalAlpha = opacity * strokeOpacity;
      context.lineWidth = lineWidth;
      if (!isNil(miterLimit)) {
        context.miterLimit = miterLimit;
      }

      if (!isNil(lineCap)) {
        context.lineCap = lineCap;
      }

      if (!isNil(lineJoin)) {
        context.lineJoin = lineJoin;
      }

      if (shouldDrawShadowWithStroke) {
        if (isInnerShadow) {
          context.globalCompositeOperation = 'source-atop';
        }
        setShadowAndFilter(object, context, true);

        if (isInnerShadow) {
          applyStroke(
            context,
            object,
            stroke,
            canvasContext,
            plugin,
            runtime,
            this.imagePool,
          );
          context.globalCompositeOperation = 'source-over';
          this.clearShadowAndFilter(context, hasFilter, true);
        }
      }

      applyStroke(
        context,
        object,
        stroke,
        canvasContext,
        plugin,
        runtime,
        this.imagePool,
      );
    }
  }

  private clearShadowAndFilter(
    context: CanvasRenderingContext2D,
    hasFilter: boolean,
    hasShadow: boolean,
  ) {
    if (hasShadow) {
      context.shadowColor = 'transparent';
      context.shadowBlur = 0;
    }

    if (hasFilter) {
      // save drop-shadow filter
      const oldFilter = context.filter;
      if (!isNil(oldFilter) && oldFilter.indexOf('drop-shadow') > -1) {
        context.filter =
          oldFilter.replace(/drop-shadow\([^)]*\)/, '').trim() || 'none';
      }
    }
  }
}

/**
 * apply before fill and stroke but only once
 */
export function setShadowAndFilter(
  object: DisplayObject,
  context: CanvasRenderingContext2D,
  hasShadow: boolean,
) {
  const { filter, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY } =
    object.parsedStyle as ParsedBaseStyleProps;

  if (filter && filter.length) {
    // use raw filter string
    context.filter = object.style.filter;
  }

  if (hasShadow) {
    context.shadowColor = shadowColor.toString();
    context.shadowBlur = shadowBlur || 0;
    context.shadowOffsetX = shadowOffsetX || 0;
    context.shadowOffsetY = shadowOffsetY || 0;
  }
}

export function getPattern(
  pattern: Pattern,
  object: DisplayObject,
  context: CanvasRenderingContext2D,
  canvasContext: CanvasContext,
  plugin: CanvasRendererPlugin,
  runtime: GlobalRuntime,
  imagePool: ImagePool,
): CanvasPattern {
  let $offscreenCanvas: HTMLCanvasElement;
  let dpr: number;
  if ((pattern.image as Rect).nodeName === 'rect') {
    const { width, height } = (pattern.image as Rect).parsedStyle;
    dpr = canvasContext.contextService.getDPR();
    const { offscreenCanvas } = canvasContext.config;
    $offscreenCanvas = runtime.offscreenCanvasCreator.getOrCreateCanvas(
      offscreenCanvas,
    ) as HTMLCanvasElement;

    $offscreenCanvas.width = width * dpr;
    $offscreenCanvas.height = height * dpr;

    const offscreenCanvasContext =
      runtime.offscreenCanvasCreator.getOrCreateContext(
        offscreenCanvas,
      ) as CanvasRenderingContext2D;

    const restoreStack = [];

    // offscreenCanvasContext.scale(1 / dpr, 1 / dpr);

    (pattern.image as Rect).forEach((object: DisplayObject) => {
      plugin.renderDisplayObject(
        object,
        offscreenCanvasContext,
        canvasContext,
        restoreStack,
        runtime,
      );
    });

    restoreStack.forEach(() => {
      offscreenCanvasContext.restore();
    });
  }

  const canvasPattern = imagePool.getOrCreatePatternSync(
    pattern,
    context,
    $offscreenCanvas,
    dpr,
    object.getGeometryBounds().min,
    () => {
      // set dirty rectangle flag
      object.renderable.dirty = true;
      canvasContext.renderingService.dirtify();
    },
  );

  return canvasPattern;
}

export function getColor(
  parsedColor: CSSGradientValue,
  object: DisplayObject,
  context: CanvasRenderingContext2D,
  imagePool: ImagePool,
) {
  let color: CanvasGradient | string;

  if (
    parsedColor.type === GradientType.LinearGradient ||
    parsedColor.type === GradientType.RadialGradient
  ) {
    const bounds = object.getGeometryBounds();
    const width = (bounds && bounds.halfExtents[0] * 2) || 1;
    const height = (bounds && bounds.halfExtents[1] * 2) || 1;
    const min = (bounds && bounds.min) || [0, 0];
    color = imagePool.getOrCreateGradient(
      {
        type: parsedColor.type,
        ...(parsedColor.value as LinearGradient & RadialGradient),
        min: min as [number, number],
        width,
        height,
      },
      context,
    );
  }

  return color;
}

export function applyFill(
  context: CanvasRenderingContext2D,
  object: DisplayObject,
  fill: CSSRGB | CSSGradientValue[] | Pattern,
  fillRule: 'nonzero' | 'evenodd',
  canvasContext: CanvasContext,
  plugin: CanvasRendererPlugin,
  runtime: GlobalRuntime,
  imagePool: ImagePool,
  skipFill = false,
) {
  if (Array.isArray(fill)) {
    fill.forEach((gradient) => {
      context.fillStyle = getColor(gradient, object, context, imagePool);
      if (!skipFill) {
        fillRule ? context.fill(fillRule) : context.fill();
      }
    });
  } else {
    if (isPattern(fill)) {
      context.fillStyle = getPattern(
        fill,
        object,
        context,
        canvasContext,
        plugin,
        runtime,
        imagePool,
      );
    }
    if (!skipFill) {
      fillRule ? context.fill(fillRule) : context.fill();
    }
  }
}

export function applyStroke(
  context: CanvasRenderingContext2D,
  object: DisplayObject,
  stroke: CSSRGB | CSSGradientValue[] | Pattern,
  canvasContext: CanvasContext,
  plugin: CanvasRendererPlugin,
  runtime: GlobalRuntime,
  imagePool: ImagePool,
  skipStroke = false,
) {
  if (Array.isArray(stroke)) {
    stroke.forEach((gradient) => {
      context.strokeStyle = getColor(gradient, object, context, imagePool);
      if (!skipStroke) {
        context.stroke();
      }
    });
  } else {
    if (isPattern(stroke)) {
      context.strokeStyle = getPattern(
        stroke,
        object,
        context,
        canvasContext,
        plugin,
        runtime,
        imagePool,
      );
    }
    if (!skipStroke) {
      context.stroke();
    }
  }
}
