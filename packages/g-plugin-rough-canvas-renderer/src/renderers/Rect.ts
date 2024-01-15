import type { CanvasRenderer } from '@antv/g-canvas';
import type { DisplayObject, ParsedRectStyleProps } from '@antv/g-lite';
import { generateRoughOptions } from '../util';

export class RectRenderer implements CanvasRenderer.StyleRenderer {
  render(
    context: CanvasRenderingContext2D,
    parsedStyle: ParsedRectStyleProps,
    object: DisplayObject<any, any>,
  ) {
    const { x, y, width, height } = parsedStyle as ParsedRectStyleProps;
    // @see https://github.com/rough-stuff/rough/wiki#rectangle-x-y-width-height--options
    // @ts-ignore
    context.roughCanvas.rectangle(
      x,
      y,
      width,
      height,
      generateRoughOptions(object),
    );
  }
}
