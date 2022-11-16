import type { DataURLOptions } from '@antv/g-lite';
import { runtime, Shape, AbstractRendererPlugin } from '@antv/g-lite';
import 'regenerator-runtime/runtime';
import { Renderable3D } from './components/Renderable3D';
import { LightPool } from './LightPool';
import { Mesh } from './Mesh';
import { MeshUpdater } from './MeshUpdater';
import { PickingIdGenerator } from './PickingIdGenerator';
import { PickingPlugin } from './PickingPlugin';
import type { Texture, TextureDescriptor } from './platform';
import { RenderHelper } from './render/RenderHelper';
import {
  Batch,
  BatchManager,
  CircleRenderer,
  ImageRenderer,
  LineRenderer,
  MeshRenderer,
  PathRenderer,
  TextRenderer,
} from './renderer';
import { RenderGraphPlugin } from './RenderGraphPlugin';
import { TexturePool } from './TexturePool';

export * from './geometries';
export * from './interfaces';
export * from './lights';
export * from './materials';
export * from './meshes';
export * from './passes';
export * from './platform';
export * from './render';
export * from './shader/compiler';
export * from './utils';
export { Renderable3D, Batch, TexturePool, RenderGraphPlugin, Mesh };

export class Plugin extends AbstractRendererPlugin {
  name = 'device-renderer';

  init(): void {
    runtime.geometryUpdaterFactory[Shape.MESH] = new MeshUpdater();

    const renderHelper = new RenderHelper();
    const lightPool = new LightPool();
    const texturePool = new TexturePool(this.context);
    const pickingIdGenerator = new PickingIdGenerator();

    const circleRenderer = new CircleRenderer();
    const pathRenderer = new PathRenderer();
    const rendererFactory: Record<Shape, Batch> = {
      [Shape.CIRCLE]: circleRenderer,
      [Shape.ELLIPSE]: circleRenderer,
      [Shape.POLYLINE]: pathRenderer,
      [Shape.PATH]: pathRenderer,
      [Shape.POLYGON]: pathRenderer,
      [Shape.RECT]: pathRenderer,
      [Shape.IMAGE]: new ImageRenderer(),
      [Shape.LINE]: new LineRenderer(),
      [Shape.TEXT]: new TextRenderer(),
      [Shape.MESH]: new MeshRenderer(),
      [Shape.GROUP]: undefined,
      [Shape.HTML]: undefined,
    };

    const batchManager = new BatchManager(
      renderHelper,
      rendererFactory,
      texturePool,
      lightPool,
    );

    const renderGraphPlugin = new RenderGraphPlugin(
      renderHelper,
      lightPool,
      texturePool,
      batchManager,
    );
    this.addRenderingPlugin(renderGraphPlugin);
    this.addRenderingPlugin(
      new PickingPlugin(
        renderHelper,
        renderGraphPlugin,
        pickingIdGenerator,
        batchManager,
      ),
    );
  }
  destroy(): void {
    delete runtime.geometryUpdaterFactory[Shape.MESH];
  }

  private getRenderGraphPlugin() {
    return this.plugins[0];
  }

  getDevice() {
    return this.getRenderGraphPlugin().getDevice();
  }

  loadTexture(
    src: string | TexImageSource,
    descriptor?: TextureDescriptor,
    successCallback?: (t: Texture) => void,
  ) {
    return this.getRenderGraphPlugin().loadTexture(
      src,
      descriptor,
      successCallback,
    );
  }

  toDataURL(options: Partial<DataURLOptions>) {
    return this.getRenderGraphPlugin().toDataURL(options);
  }
}
