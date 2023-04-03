import { isNil, isObject, isUndefined } from '@antv/util';
import type { mat3, vec2 } from 'gl-matrix';
import { mat4, quat, vec3 } from 'gl-matrix';
import type { PropertyParseOptions } from '../css';
import { noneColor } from '../css';
import type {
  DisplayObjectConfig,
  IAnimation,
  IChildNode,
  ICSSStyleDeclaration,
  IElement,
} from '../dom';
import { Element, ElementEvent, MutationEvent } from '../dom';
import { Rectangle } from '../shapes';
import type { BaseStyleProps, ParsedBaseStyleProps } from '../types';
import { Shape } from '../types';
import {
  kebabize,
  createVec3,
  decompose,
  formatAttributeName,
  fromRotationTranslationScale,
  getEuler,
  rad2deg,
} from '../utils';
import type { CustomElement } from './CustomElement';
import { runtime } from '../global-runtime';

export function isDisplayObject(value: any): value is DisplayObject {
  return !!(value as DisplayObject)?.nodeName;
}

type ConstructorTypeOf<T> = new (...args: any[]) => T;

const mutationEvent: MutationEvent = new MutationEvent(
  ElementEvent.ATTR_MODIFIED,
  null,
  null,
  null,
  null,
  MutationEvent.MODIFICATION,
  null,
  null,
);

const DEFAULT_STYLE_PROPS = {
  anchor: '',
  opacity: '',
  fillOpacity: '',
  strokeOpacity: '',
  fill: '',
  stroke: '',
  transform: '',
  transformOrigin: '',
  visibility: '',
  pointerEvents: '',
  lineWidth: '',
  lineCap: '',
  lineJoin: '',
  increasedLineWidthForHitTesting: '',
  fontSize: '',
  fontFamily: '',
  fontStyle: '',
  fontWeight: '',
  fontVariant: '',
  textAlign: '',
  textBaseline: '',
  textTransform: '',
  zIndex: '',
  filter: '',
  shadowType: '',
};

const DEFAULT_PARSED_STYLE_PROPS = {
  anchor: [0, 0],
  fill: noneColor,
  stroke: noneColor,
  transform: [],
  zIndex: 0,
  filter: [],
  shadowType: 'outer',
  miterLimit: 10,
};

const DEFAULT_PARSED_STYLE_PROPS_CSS_DISABLED = {
  ...DEFAULT_PARSED_STYLE_PROPS,
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  visibility: 'visible',
  pointerEvents: 'auto',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  increasedLineWidthForHitTesting: 0,
  fillRule: 'nonzero',
  // TODO: transformOrigin
};

const INHERITABLE_BASE_STYLE_PROPS = [
  'opacity',
  'fillOpacity',
  'strokeOpacity',
  'transformOrigin',
  'visibility',
  'pointerEvents',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'increasedLineWidthForHitTesting',
];

const INHERITABLE_STYLE_PROPS = [
  ...INHERITABLE_BASE_STYLE_PROPS,
  'fontSize',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'textAlign',
  'textBaseline',
  'textTransform',
];

const DATASET_PREFIX = 'data-';

/**
 * prototype chains: DisplayObject -> Element -> Node -> EventTarget
 *
 * mixins: Animatable, Transformable, Visible
 * @see https://github.com/tannerntannern/ts-mixer/blob/master/README.md#mixing-generic-classes
 *
 * Provide abilities in scene graph, such as:
 * * transform `translate/rotate/scale`
 * * add/remove child
 * * visibility and z-index
 *
 * Those abilities are implemented with those components: `Transform/Sortable/Visible`.
 *
 * Emit following events:
 * * init
 * * destroy
 * * attributeChanged
 */
export class DisplayObject<
  StyleProps extends BaseStyleProps = any,
  ParsedStyleProps extends ParsedBaseStyleProps = any,
> extends Element<StyleProps, ParsedStyleProps> {
  /**
   * contains style props in constructor's params, eg. fill, stroke...
   */
  config: DisplayObjectConfig<StyleProps>;

  isCustomElement = false;

  isMutationObserved = false;

  /**
   * push to active animations after calling `animate()`
   */
  private activeAnimations: IAnimation[] = [];

  /**
   * Use data-* attribute.
   * @see https://developer.mozilla.org/en-US/docs/Learn/HTML/Howto/Use_data_attributes
   * @example
   * group.dataset.prop1 = 1;
   * group.getAttribute('data-prop1'); // 1
   */
  dataset: any;

  constructor(config: DisplayObjectConfig<StyleProps>) {
    super();

    // assign name, id to config
    // eg. group.get('name')
    this.config = config;

    // compatible with G 3.0
    this.config.interactive = this.config.capture ?? this.config.interactive;

    // init scene graph node
    this.id = this.config.id || '';
    this.name = this.config.name || '';
    if (this.config.className || this.config.class) {
      this.className = this.config.className || this.config.class;
    }
    this.nodeName = this.config.type || Shape.GROUP;

    // compatible with G 3.0
    this.config.style =
      this.config.style || this.config.attrs || ({} as StyleProps);
    Object.assign(this.config.style, this.config.attrs);
    // this.config.style = {
    //   // ...DEFAULT_STYLE_PROPS,
    //   ...this.config.style,
    //   ...this.config.attrs,
    // };
    if (this.config.visible != null) {
      this.config.style.visibility =
        this.config.visible === false ? 'hidden' : 'visible';
    }
    if (this.config.interactive != null) {
      this.config.style.pointerEvents =
        this.config.interactive === false ? 'none' : 'auto';
    }

    // merge parsed value
    Object.assign(
      this.parsedStyle,
      runtime.enableCSSParsing
        ? DEFAULT_PARSED_STYLE_PROPS
        : DEFAULT_PARSED_STYLE_PROPS_CSS_DISABLED,
      this.config.initialParsedStyle,
    );

    if (runtime.enableCSSParsing) {
      Object.assign(this.attributes, DEFAULT_STYLE_PROPS);
    }

    // start to process attributes
    this.initAttributes(this.config.style);
    const Proxy: ProxyConstructor = runtime.globalThis.Proxy
      ? runtime.globalThis.Proxy
      : function () {};
    this.dataset = new Proxy<any>(
      {},
      {
        get: (target, name: string) => {
          const formattedName = `${DATASET_PREFIX}${kebabize(name)}`;
          if (target[formattedName] !== undefined) {
            return target[formattedName];
          }
          return this.getAttribute(formattedName as keyof StyleProps);
        },
        set: (_, prop, value) => {
          this.setAttribute(
            `${DATASET_PREFIX}${kebabize(prop as string)}` as keyof StyleProps,
            value,
          );
          return true;
        },
      },
    );

    this.style = new Proxy<StyleProps & ICSSStyleDeclaration<StyleProps>>(
      // @ts-ignore
      {
        // ...this.attributes,
        setProperty: <Key extends keyof StyleProps>(
          propertyName: Key,
          value: StyleProps[Key],
          // priority?: string,
        ) => {
          this.setAttribute(propertyName, value);
        },
        getPropertyValue: (propertyName: keyof StyleProps) => {
          return this.getAttribute(propertyName);
        },
        removeProperty: (propertyName: keyof StyleProps) => {
          this.removeAttribute(propertyName);
        },
        item: () => {
          return '';
        },
      },
      {
        get: (target, name: string) => {
          if (target[name] !== undefined) {
            // if (name in target) {
            return target[name];
          }
          return this.getAttribute(name as keyof StyleProps);
        },
        set: (_, prop, value) => {
          this.setAttribute(prop as keyof StyleProps, value);
          return true;
        },
      },
    );
  }

  destroy() {
    super.destroy();

    // stop all active animations
    this.getAnimations().forEach((animation) => {
      animation.cancel();
    });

    // FIXME
    // this.renderable = null;
    // this.cullable = null;
    // this.transformable = null;
    // this.rBushNode = null;
    // this.geometry = null;
    // this.sortable = null;
  }

  cloneNode(
    deep?: boolean,
    customCloneFunc?: (name: string, attribute: any) => any,
  ): this {
    const clonedStyle = { ...this.attributes };
    for (const attributeName in clonedStyle) {
      const attribute = clonedStyle[attributeName];

      // @see https://github.com/antvis/G/issues/1095
      if (
        isDisplayObject(attribute) &&
        // share the same clipPath if possible
        attributeName !== 'clipPath' &&
        attributeName !== 'offsetPath' &&
        attributeName !== 'textPath'
      ) {
        clonedStyle[attributeName] = attribute.cloneNode(deep);
      }
      // TODO: clone other type
      if (customCloneFunc) {
        clonedStyle[attributeName] = customCloneFunc(attributeName, attribute);
      }
    }

    const cloned = new (this.constructor as ConstructorTypeOf<DisplayObject>)({
      // copy id & name
      // @see https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode#notes
      id: this.id,
      name: this.name,
      className: this.name,
      interactive: this.interactive,
      style: clonedStyle,
    });

    // apply transform
    cloned.setLocalTransform(this.getLocalTransform());

    if (deep) {
      this.children.forEach((child) => {
        // skip marker
        if (!child.style.isMarker) {
          const clonedChild = child.cloneNode(deep);
          cloned.appendChild(clonedChild);
        }
      });
    }

    return cloned as this;
  }

  private initAttributes(attributes: StyleProps = {} as StyleProps) {
    const renderable = this.renderable;

    const options = {
      forceUpdateGeometry: true,
      // usedAttributes:
      //   // only Group / Text should account for text relative props
      //   this.tagName === Shape.GROUP || this.tagName === Shape.TEXT
      //     ? INHERITABLE_STYLE_PROPS
      //     : INHERITABLE_BASE_STYLE_PROPS,
    };

    if (runtime.enableCSSParsing) {
      // @ts-ignore
      options.usedAttributes = INHERITABLE_STYLE_PROPS;
    }

    // account for FCP, process properties as less as possible
    runtime.styleValueRegistry.processProperties(this, attributes, options);

    // redraw at next frame
    renderable.dirty = true;
  }

  setAttribute<Key extends keyof StyleProps>(
    name: Key,
    value: StyleProps[Key],
    force = false,
  ) {
    const attributeName = formatAttributeName(name as string) as Key;
    // ignore undefined value
    if (isUndefined(value)) {
      return;
    }

    if (force || value !== this.attributes[attributeName]) {
      this.internalSetAttribute(attributeName, value);
      super.setAttribute(attributeName, value);
    }
  }

  /**
   * called when attributes get changed or initialized
   */
  internalSetAttribute<Key extends keyof StyleProps>(
    name: Key,
    value: StyleProps[Key],
    parseOptions: Partial<PropertyParseOptions> = {},
  ) {
    const renderable = this.renderable;

    const oldValue = this.attributes[name];
    const oldParsedValue = this.parsedStyle[name as string];

    runtime.styleValueRegistry.processProperties(
      this,
      {
        [name]: value,
      },
      parseOptions,
    );

    // redraw at next frame
    renderable.dirty = true;

    const newParsedValue = this.parsedStyle[name as string];
    if (this.isConnected) {
      mutationEvent.relatedNode = this as IElement;
      mutationEvent.prevValue = oldValue;
      mutationEvent.newValue = value;
      mutationEvent.attrName = name as string;
      mutationEvent.prevParsedValue = oldParsedValue;
      mutationEvent.newParsedValue = newParsedValue;
      if (this.isMutationObserved) {
        this.dispatchEvent(mutationEvent);
      } else {
        mutationEvent.target = this;
        this.ownerDocument.defaultView.dispatchEvent(mutationEvent, true);
      }
    }

    if (
      ((this.isCustomElement && this.isConnected) || !this.isCustomElement) &&
      (this as unknown as CustomElement<any>).attributeChangedCallback
    ) {
      (this as unknown as CustomElement<any>).attributeChangedCallback(
        name as Key,
        oldValue,
        value,
        oldParsedValue,
        newParsedValue,
      );
    }
  }

  // #region transformable
  /**
   * returns different values than getBoundingClientRect(), as the latter returns value relative to the viewport
   * @see https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getBBox
   *
   * FIXME: It is worth noting that getBBox responds to original untransformed values of a drawn object.
   * @see https://www.w3.org/Graphics/SVG/IG/resources/svgprimer.html#getBBox
   */
  getBBox(): DOMRect {
    const aabb = this.getBounds();
    const [left, top] = aabb.getMin();
    const [right, bottom] = aabb.getMax();
    return new Rectangle(left, top, right - left, bottom - top);
  }

  setOrigin(position: vec3 | vec2 | number, y = 0, z = 0) {
    runtime.sceneGraphService.setOrigin(this, createVec3(position, y, z));
    return this;
  }

  getOrigin(): vec3 {
    return runtime.sceneGraphService.getOrigin(this);
  }

  /**
   * set position in world space
   */
  setPosition(position: vec3 | vec2 | number, y = 0, z = 0) {
    runtime.sceneGraphService.setPosition(this, createVec3(position, y, z));
    return this;
  }

  /**
   * set position in local space
   */
  setLocalPosition(position: vec3 | vec2 | number, y = 0, z = 0) {
    runtime.sceneGraphService.setLocalPosition(
      this,
      createVec3(position, y, z),
    );
    return this;
  }

  /**
   * translate in world space
   */
  translate(position: vec3 | vec2 | number, y = 0, z = 0) {
    runtime.sceneGraphService.translate(this, createVec3(position, y, z));
    return this;
  }

  /**
   * translate in local space
   */
  translateLocal(position: vec3 | vec2 | number, y = 0, z = 0) {
    runtime.sceneGraphService.translateLocal(this, createVec3(position, y, z));
    return this;
  }

  getPosition(): vec3 {
    return runtime.sceneGraphService.getPosition(this);
  }

  getLocalPosition(): vec3 {
    return runtime.sceneGraphService.getLocalPosition(this);
  }

  /**
   * compatible with G 3.0
   *
   * scaling in local space
   * scale(10) = scale(10, 10, 10)
   *
   * we can't set scale in world space
   */
  scale(scaling: vec3 | vec2 | number, y?: number, z?: number) {
    return this.scaleLocal(scaling, y, z);
  }
  scaleLocal(scaling: vec3 | vec2 | number, y?: number, z?: number) {
    if (typeof scaling === 'number') {
      y = y || scaling;
      z = z || scaling;
      scaling = createVec3(scaling, y, z);
    }
    runtime.sceneGraphService.scaleLocal(this, scaling);
    return this;
  }

  /**
   * set scaling in local space
   */
  setLocalScale(scaling: vec3 | vec2 | number, y?: number, z?: number) {
    if (typeof scaling === 'number') {
      y = y || scaling;
      z = z || scaling;
      scaling = createVec3(scaling, y, z);
    }

    runtime.sceneGraphService.setLocalScale(this, scaling);
    return this;
  }

  /**
   * get scaling in local space
   */
  getLocalScale(): vec3 {
    return runtime.sceneGraphService.getLocalScale(this);
  }

  /**
   * get scaling in world space
   */
  getScale(): vec3 {
    return runtime.sceneGraphService.getScale(this);
  }

  /**
   * only return degrees of Z axis in world space
   */
  getEulerAngles() {
    const [, , ez] = getEuler(
      vec3.create(),
      runtime.sceneGraphService.getWorldTransform(this),
    );
    return rad2deg(ez);
  }

  /**
   * only return degrees of Z axis in local space
   */
  getLocalEulerAngles() {
    const [, , ez] = getEuler(
      vec3.create(),
      runtime.sceneGraphService.getLocalRotation(this),
    );
    return rad2deg(ez);
  }

  /**
   * set euler angles(degrees) in world space
   */
  setEulerAngles(z: number) {
    runtime.sceneGraphService.setEulerAngles(this, 0, 0, z);
    return this;
  }

  /**
   * set euler angles(degrees) in local space
   */
  setLocalEulerAngles(z: number) {
    runtime.sceneGraphService.setLocalEulerAngles(this, 0, 0, z);
    return this;
  }

  rotateLocal(x: number, y?: number, z?: number) {
    if (isNil(y) && isNil(z)) {
      runtime.sceneGraphService.rotateLocal(this, 0, 0, x);
    } else {
      runtime.sceneGraphService.rotateLocal(this, x, y, z);
    }

    return this;
  }

  rotate(x: number, y?: number, z?: number) {
    if (isNil(y) && isNil(z)) {
      runtime.sceneGraphService.rotate(this, 0, 0, x);
    } else {
      runtime.sceneGraphService.rotate(this, x, y, z);
    }

    return this;
  }

  setRotation(rotation: quat | number, y?: number, z?: number, w?: number) {
    runtime.sceneGraphService.setRotation(this, rotation, y, z, w);
    return this;
  }

  setLocalRotation(
    rotation: quat | number,
    y?: number,
    z?: number,
    w?: number,
  ) {
    runtime.sceneGraphService.setLocalRotation(this, rotation, y, z, w);
    return this;
  }

  setLocalSkew(skew: vec2 | number, y?: number) {
    runtime.sceneGraphService.setLocalSkew(this, skew, y);
    return this;
  }

  getRotation(): quat {
    return runtime.sceneGraphService.getRotation(this);
  }

  getLocalRotation(): quat {
    return runtime.sceneGraphService.getLocalRotation(this);
  }

  getLocalSkew(): vec2 {
    return runtime.sceneGraphService.getLocalSkew(this);
  }

  getLocalTransform(): mat4 {
    return runtime.sceneGraphService.getLocalTransform(this);
  }

  getWorldTransform(): mat4 {
    return runtime.sceneGraphService.getWorldTransform(this);
  }

  setLocalTransform(transform: mat4) {
    runtime.sceneGraphService.setLocalTransform(this, transform);
    return this;
  }

  resetLocalTransform(): void {
    runtime.sceneGraphService.resetLocalTransform(this);
  }
  // #endregion transformable

  // #region animatable
  /**
   * returns an array of all Animation objects affecting this element
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations
   */
  getAnimations(): IAnimation[] {
    return this.activeAnimations;
  }
  /**
   * create an animation with WAAPI
   * @see https://developer.mozilla.org/zh-CN/docs/Web/API/Element/animate
   */
  animate(
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions | undefined,
  ): IAnimation | null {
    const timeline = this.ownerDocument?.timeline;

    if (timeline) {
      return timeline.play(this as IElement, keyframes, options);
    }
    return null;
  }
  // #endregion animatable

  // #region visible
  /**
   * shortcut for Used value of `visibility`
   */
  isVisible() {
    return this.parsedStyle?.visibility === 'visible';
  }

  get interactive() {
    return this.isInteractive();
  }
  set interactive(b: boolean) {
    this.style.pointerEvents = b ? 'auto' : 'none';
  }

  isInteractive() {
    return this.parsedStyle?.pointerEvents !== 'none';
  }

  isCulled() {
    return !!(this.cullable && this.cullable.enable && !this.cullable.visible);
  }

  /**
   * bring to front in current group
   */
  toFront() {
    if (this.parentNode) {
      this.style.zIndex =
        Math.max(
          ...this.parentNode.children.map((child) =>
            Number(child.style.zIndex),
          ),
        ) + 1;
    }
    return this;
  }

  /**
   * send to back in current group
   */
  toBack() {
    if (this.parentNode) {
      this.style.zIndex =
        Math.min(
          ...this.parentNode.children.map((child) =>
            Number(child.style.zIndex),
          ),
        ) - 1;
    }
    return this;
  }
  // #endregion visible

  // #region deprecated

  /**
   * compatible with G 3.0
   * @alias object.config
   * @deprecated
   */
  getConfig() {
    return this.config;
  }

  /**
   * @alias style
   * @example
   * circle.style.r = 10;
   * const r = circle.style;
   * @deprecated
   */
  attr(): StyleProps;
  attr(name: Partial<StyleProps>): DisplayObject<StyleProps>;
  attr<Key extends keyof StyleProps>(name: Key): StyleProps[Key];
  attr<Key extends keyof StyleProps>(
    name: Key,
    value: StyleProps[Key],
  ): DisplayObject<StyleProps>;
  attr(...args: any): any {
    const [name, value] = args;
    if (!name) {
      return this.attributes;
    }
    if (isObject(name)) {
      Object.keys(name).forEach((key) => {
        this.setAttribute(
          key as keyof StyleProps,
          (name as unknown as StyleProps)[key as keyof StyleProps],
        );
      });
      return this;
    }
    if (args.length === 2) {
      this.setAttribute(name, value);
      return this;
    }
    return this.attributes[name as keyof StyleProps];
  }

  /**
   * return 3x3 matrix in world space
   * @deprecated
   */
  getMatrix(transformMat4?: mat4): mat3 {
    const transform = transformMat4 || this.getWorldTransform();
    const [tx, ty] = mat4.getTranslation(vec3.create(), transform);
    const [sx, sy] = mat4.getScaling(vec3.create(), transform);
    const rotation = mat4.getRotation(quat.create(), transform);
    const [eux, , euz] = getEuler(vec3.create(), rotation);
    // gimbal lock at 90 degrees
    return fromRotationTranslationScale(eux || euz, tx, ty, sx, sy);
  }

  /**
   * return 3x3 matrix in local space
   * @deprecated
   */
  getLocalMatrix(): mat3 {
    return this.getMatrix(this.getLocalTransform());
  }

  /**
   * set 3x3 matrix in world space
   * @deprecated
   */
  setMatrix(mat: mat3) {
    const [tx, ty, scalingX, scalingY, angle] = decompose(mat);
    this.setEulerAngles(angle)
      .setPosition(tx, ty)
      .setLocalScale(scalingX, scalingY);
  }

  /**
   * set 3x3 matrix in local space
   * @deprecated
   */
  setLocalMatrix(mat: mat3) {
    const [tx, ty, scalingX, scalingY, angle] = decompose(mat);
    this.setLocalEulerAngles(angle)
      .setLocalPosition(tx, ty)
      .setLocalScale(scalingX, scalingY);
  }

  /**
   * Use `visibility: visible` instead.
   * @deprecated
   */
  show() {
    if (runtime.enableCSSParsing) {
      this.style.visibility = 'visible';
    } else {
      this.forEach((object: DisplayObject) => {
        object.style.visibility = 'visible';
      });
    }
  }

  /**
   * Use `visibility: hidden` instead.
   * @deprecated
   */
  hide() {
    if (runtime.enableCSSParsing) {
      this.style.visibility = 'hidden';
    } else {
      this.forEach((object: DisplayObject) => {
        object.style.visibility = 'hidden';
      });
    }
  }

  /**
   * Use `childElementCount` instead.
   * @deprecated
   */
  getCount() {
    return this.childElementCount;
  }

  /**
   * Use `parentElement` instead.
   * @deprecated
   */
  getParent(): DisplayObject | null {
    return this.parentElement as DisplayObject;
  }

  /**
   * Use `children` instead.
   * @deprecated
   */
  getChildren(): DisplayObject[] {
    return this.children as DisplayObject[];
  }

  /**
   * Use `firstElementChild` instead.
   * @deprecated
   */
  getFirst(): DisplayObject | null {
    return this.firstElementChild as DisplayObject;
  }

  /**
   * Use `lastElementChild` instead.
   * @deprecated
   */
  getLast(): DisplayObject | null {
    return this.lastElementChild as DisplayObject;
  }

  /**
   * Use `this.children[index]` instead.
   * @deprecated
   */
  getChildByIndex(index: number): DisplayObject | null {
    return (this.children[index] as DisplayObject) || null;
  }

  /**
   * Use `appendChild` instead.
   * @deprecated
   */
  add<T extends IChildNode>(child: T, index?: number): T {
    return this.appendChild(child, index);
  }

  /**
   * Use `this.style.clipPath` instead.
   * @deprecated
   */
  setClip(clipPath: DisplayObject | null) {
    this.style.clipPath = clipPath;
  }

  /**
   * Use `this.style.clipPath` instead.
   * @deprecated
   */
  getClip = function () {
    return this.style.clipPath || null;
  };

  /**
   * @deprecated
   */
  set<
    StyleProps extends BaseStyleProps,
    Key extends keyof DisplayObjectConfig<StyleProps>,
  >(name: Key, value: DisplayObjectConfig<StyleProps>[Key]) {
    // @ts-ignore
    this.config[name] = value;
  }

  /**
   * @deprecated
   */
  get<StyleProps extends BaseStyleProps>(
    name: keyof DisplayObjectConfig<StyleProps>,
  ) {
    return this.config[name];
  }

  /**
   * Use `setPosition` instead.
   * @deprecated
   */
  moveTo(position: vec3 | vec2 | number, y = 0, z = 0) {
    (this as unknown as DisplayObject).setPosition(position, y, z);
    return this;
  }

  /**
   * Use `setPosition` instead.
   * @deprecated
   */
  move(position: vec3 | vec2 | number, y = 0, z = 0) {
    (this as unknown as DisplayObject).setPosition(position, y, z);
    return this;
  }

  /**
   * Use `this.style.zIndex` instead.
   * @deprecated
   */
  setZIndex(zIndex: number) {
    this.style.zIndex = zIndex;
    return this;
  }

  // #endregion deprecated
}
