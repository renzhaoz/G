import {
  DisplayObject,
  GlobalRuntime,
  ImageStyleProps,
  Point,
  RenderingPluginContext,
  Shape,
  getParsedStyle,
} from '@antv/g-lite';
import { StyleRenderer } from '@antv/g-plugin-canvas-renderer';

export function isPointInPath(
  displayObject: DisplayObject<ImageStyleProps>,
  position: Point,
  isClipPath: boolean,
  isPointInPath: (
    displayObject: DisplayObject<ImageStyleProps>,
    position: Point,
  ) => boolean,
  renderingPluginContext: RenderingPluginContext,
  runtime: GlobalRuntime,
): boolean {
  const { x = 0, y = 0, pointerEvents = 'auto' } = displayObject.attributes;
  const width = getParsedStyle(displayObject, 'width') as number;
  const height = getParsedStyle(displayObject, 'height') as number;

  if (pointerEvents === 'non-transparent-pixel') {
    const { offscreenCanvas } = renderingPluginContext.config;
    const canvas =
      runtime.offscreenCanvasCreator.getOrCreateCanvas(offscreenCanvas);
    const context = runtime.offscreenCanvasCreator.getOrCreateContext(
      offscreenCanvas,
      {
        willReadFrequently: true,
      },
    ) as CanvasRenderingContext2D;
    canvas.width = width;
    canvas.height = height;

    (
      (renderingPluginContext as any).defaultStyleRendererFactory as Record<
        Shape,
        StyleRenderer
      >
    )[Shape.IMAGE].render(
      context,
      { ...displayObject.parsedStyle, x: 0, y: 0 },
      displayObject,
      undefined,
      undefined,
      undefined,
    );

    const imagedata = context.getImageData(
      position.x - x,
      position.y - y,
      1,
      1,
    ).data;
    return imagedata.every((component) => component !== 0);
  }

  return true;
}
