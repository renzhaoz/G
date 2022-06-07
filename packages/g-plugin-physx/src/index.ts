import type { RendererPlugin, Syringe } from '@antv/g';
import { Module } from '@antv/g';
import { PhysXPlugin } from './PhysXPlugin';

const containerModule = Module((register) => {
  register(PhysXPlugin);
});

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PhysXPluginOptions {}

export class Plugin implements RendererPlugin {
  name = 'physx';
  constructor(private options: Partial<PhysXPluginOptions>) {}

  init(container: Syringe.Container): void {
    container.load(containerModule, true);
  }
  destroy(container: Syringe.Container): void {
    container.unload(containerModule);
  }
}
