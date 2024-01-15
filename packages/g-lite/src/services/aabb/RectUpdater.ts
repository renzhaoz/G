import { isString } from '@antv/util';
import type {
  Group,
  Image,
  ParsedImageStyleProps,
  Rect,
} from '../../display-objects';
import type { GeometryAABBUpdater } from './interfaces';
export class RectUpdater implements GeometryAABBUpdater<ParsedImageStyleProps> {
  update(parsedStyle: ParsedImageStyleProps, object: Image | Rect | Group) {
    const { x, y, img, width = 0, height = 0 } = parsedStyle;

    let contentWidth = width;
    let contentHeight = height;

    // resize with HTMLImageElement's size
    if (img && !isString(img)) {
      if (!contentWidth) {
        contentWidth = img.width;
        parsedStyle.width = contentWidth;
      }
      if (!contentHeight) {
        contentHeight = img.height;
        parsedStyle.height = contentHeight;
      }
    }

    return {
      cx: x + contentWidth / 2,
      cy: y + contentHeight / 2,
      hwidth: contentWidth / 2,
      hheight: contentHeight / 2,
    };
  }
}
