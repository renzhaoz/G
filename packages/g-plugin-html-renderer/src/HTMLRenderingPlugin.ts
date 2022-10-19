import type {
  DisplayObject,
  FederatedEvent,
  HTML,
  ICamera,
  MutationEvent,
  RenderingPlugin,
  RenderingPluginContext,
} from '@antv/g-lite';
import { RenderReason } from '@antv/g-lite';
import { CSSRGB, ElementEvent, isPattern, Shape } from '@antv/g-lite';
import { isString } from '@antv/util';
import type { mat4 } from 'gl-matrix';

const HTML_PREFIX = 'g-html-';
const CANVAS_CAMERA_ID = 'g_canvas_camera';

export class HTMLRenderingPlugin implements RenderingPlugin {
  static tag = 'HTMLRendering';

  private context: RenderingPluginContext;

  /**
   * wrapper for camera
   */
  private $camera: HTMLDivElement;

  private joinTransformMatrix(matrix: mat4) {
    return `matrix(${[matrix[0], matrix[1], matrix[4], matrix[5], matrix[12], matrix[13]].join(
      ',',
    )})`;
  }

  apply(context: RenderingPluginContext) {
    const { camera, renderingContext, renderingService } = context;
    this.context = context;

    const setTransform = (object: DisplayObject, $el: HTMLElement) => {
      $el.style.transform = this.joinTransformMatrix(object.getWorldTransform());
    };

    const handleMounted = (e: FederatedEvent) => {
      const object = e.target as DisplayObject;
      if (object.nodeName === Shape.HTML) {
        // create DOM element
        const $el = this.getOrCreateEl(object);
        this.$camera.appendChild($el);

        // apply documentElement's style
        const { attributes } = object.ownerDocument.documentElement;
        Object.keys(attributes).forEach((name) => {
          $el.style[name] = attributes[name];
        });

        Object.keys(object.attributes).forEach((name) => {
          this.updateAttribute(name, object as HTML);
        });

        setTransform(object, $el);
      }
    };

    const handleUnmounted = (e: FederatedEvent) => {
      const object = e.target as DisplayObject;
      if (object.nodeName === Shape.HTML && this.$camera) {
        const existedId = this.getId(object);
        const $existedElement: HTMLElement | null = this.$camera.querySelector('#' + existedId);
        if ($existedElement) {
          this.$camera.removeChild($existedElement);
        }
      }
    };

    const handleAttributeChanged = (e: MutationEvent) => {
      const object = e.target as HTML;
      if (object.nodeName === Shape.HTML) {
        const { attrName } = e;
        this.updateAttribute(attrName, object);
      }
    };

    const handleBoundsChanged = (e: MutationEvent) => {
      const object = e.target as HTML;
      if (object.nodeName === Shape.HTML) {
        const $el = this.getOrCreateEl(object);
        setTransform(object, $el);
      }
    };

    renderingService.hooks.init.tapPromise(HTMLRenderingPlugin.tag, async () => {
      // append camera
      this.$camera = this.createCamera(camera);

      renderingContext.root.addEventListener(ElementEvent.MOUNTED, handleMounted);
      renderingContext.root.addEventListener(ElementEvent.UNMOUNTED, handleUnmounted);
      renderingContext.root.addEventListener(ElementEvent.ATTR_MODIFIED, handleAttributeChanged);
      renderingContext.root.addEventListener(ElementEvent.BOUNDS_CHANGED, handleBoundsChanged);
    });

    renderingService.hooks.endFrame.tap(HTMLRenderingPlugin.tag, () => {
      if (this.$camera && renderingContext.renderReasons.has(RenderReason.CAMERA_CHANGED)) {
        this.$camera.style.transform = this.joinTransformMatrix(camera.getOrthoMatrix());
      }
    });

    renderingService.hooks.destroy.tap(HTMLRenderingPlugin.tag, () => {
      // remove camera
      if (this.$camera) {
        this.$camera.remove();
      }

      renderingContext.root.removeEventListener(ElementEvent.MOUNTED, handleMounted);
      renderingContext.root.removeEventListener(ElementEvent.UNMOUNTED, handleUnmounted);
      renderingContext.root.removeEventListener(ElementEvent.ATTR_MODIFIED, handleAttributeChanged);
      renderingContext.root.removeEventListener(ElementEvent.BOUNDS_CHANGED, handleBoundsChanged);
    });
  }

  private getId(object: DisplayObject) {
    return object.id || HTML_PREFIX + object.entity;
  }

  private createCamera(camera: ICamera) {
    const { document: doc } = this.context.config;
    const $canvas = this.context.contextService.getDomElement() as unknown as HTMLElement;
    const $container = $canvas.parentNode;
    if ($container) {
      const cameraId = CANVAS_CAMERA_ID;
      let $existedCamera = $container.querySelector<HTMLDivElement>('#' + cameraId);
      if (!$existedCamera) {
        const $camera = (doc || document).createElement('div');
        $existedCamera = $camera;
        $camera.id = cameraId;
        // use absolute position
        $camera.style.position = 'absolute';
        // @see https://github.com/antvis/G/issues/1150
        $camera.style.left = `${$canvas.offsetLeft || 0}px`;
        $camera.style.top = `${$canvas.offsetTop || 0}px`;
        $camera.style.transform = this.joinTransformMatrix(camera.getOrthoMatrix());

        $container.appendChild($camera);
      }

      return $existedCamera;
    }
    return null;
  }

  private getOrCreateEl(object: DisplayObject) {
    const { document: doc } = this.context.config;
    const existedId = this.getId(object);

    let $existedElement: HTMLElement | null = this.$camera.querySelector('#' + existedId);
    if (!$existedElement) {
      $existedElement = (doc || document).createElement('div');
      object.parsedStyle.$el = $existedElement;
      $existedElement.id = existedId;
      if (object.name) {
        $existedElement.setAttribute('name', object.name);
      }
      if (object.className) {
        $existedElement.className = object.className;
      }

      // use absolute position
      $existedElement.style.position = 'absolute';
      // @see https://github.com/antvis/G/issues/1150
      $existedElement.style.left = `0px`;
      $existedElement.style.top = `0px`;
      $existedElement.style['will-change'] = 'transform';
      $existedElement.style.transform = this.joinTransformMatrix(object.getWorldTransform());
    }

    return $existedElement;
  }

  private updateAttribute(name: string, object: HTML) {
    const $el = this.getOrCreateEl(object);
    switch (name) {
      case 'innerHTML':
        const { innerHTML } = object.parsedStyle;
        if (isString(innerHTML)) {
          $el.innerHTML = innerHTML;
        } else {
          $el.innerHTML = '';
          $el.appendChild(innerHTML);
        }
        break;
      case 'transformOrigin':
        const { transformOrigin } = object.parsedStyle;
        $el.style['transform-origin'] = `${transformOrigin[0].value} ${transformOrigin[1].value}`;
        break;
      case 'width':
        const width = object.computedStyleMap().get('width');
        $el.style.width = width.toString();
        break;
      case 'height':
        const height = object.computedStyleMap().get('height');
        $el.style.height = height.toString();
        break;
      case 'zIndex':
        const { zIndex } = object.parsedStyle;
        $el.style['z-index'] = `${zIndex}`;
        break;
      case 'visibility':
        const { visibility } = object.parsedStyle;
        $el.style.visibility = visibility;
        break;
      case 'pointerEvents':
        const { pointerEvents } = object.parsedStyle;
        $el.style.pointerEvents = pointerEvents;
        break;
      case 'opacity':
        const { opacity } = object.parsedStyle;
        $el.style.opacity = `${opacity}`;
        break;
      case 'fill':
        const { fill } = object.parsedStyle;
        let color = '';
        if (fill instanceof CSSRGB) {
          if (fill.isNone) {
            color = 'transparent';
          } else {
            color = object.getAttribute('fill') as string;
          }
        } else if (Array.isArray(fill)) {
          color = object.getAttribute('fill') as string;
        } else if (isPattern(fill)) {
          // TODO: pattern, use background?
        }
        $el.style.background = color;
        break;
      case 'stroke':
        const { stroke } = object.parsedStyle;
        let borderColor = '';
        if (stroke instanceof CSSRGB) {
          if (stroke.isNone) {
            borderColor = 'transparent';
          } else {
            borderColor = object.getAttribute('stroke') as string;
          }
        } else if (Array.isArray(stroke)) {
          borderColor = object.getAttribute('stroke') as string;
        } else if (isPattern(stroke)) {
          // TODO: pattern, use background?
        }

        $el.style['border-color'] = borderColor;
        $el.style['border-style'] = 'solid';
        break;
      case 'lineWidth':
        const { lineWidth } = object.parsedStyle;
        $el.style['border-width'] = `${lineWidth || 0}px`;
        break;
      case 'lineDash':
        $el.style['border-style'] = 'dashed';
        break;
      case 'filter':
        const { filter } = object.style;
        $el.style.filter = filter;
        break;
    }
  }
}
