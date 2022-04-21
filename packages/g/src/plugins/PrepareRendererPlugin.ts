import { inject, singleton } from 'mana-syringe';
import type { DisplayObject } from '..';
import { StyleValueRegistry } from '../css';
import type { Element, FederatedEvent } from '../dom';
import { ElementEvent } from '../dom';
import {
  RenderingContext,
  RenderReason,
  RenderingPluginContribution,
  dirtifyToRoot,
} from '../services';
import type { RenderingService, RenderingPlugin } from '../services/RenderingService';

@singleton({ contrib: RenderingPluginContribution })
export class PrepareRendererPlugin implements RenderingPlugin {
  static tag = 'PrepareRendererPlugin';

  @inject(RenderingContext)
  private renderingContext: RenderingContext;

  @inject(StyleValueRegistry)
  private styleValueRegistry: StyleValueRegistry;

  apply(renderingService: RenderingService) {
    const handleAttributeChanged = () => {
      this.renderingContext.renderReasons.add(RenderReason.DISPLAY_OBJECT_CHANGED);
    };

    const handleBoundsChanged = () => {
      renderingService.dirtify();
    };

    const handleMounted = (e: FederatedEvent) => {
      const object = e.target as DisplayObject;
      // recalc style values
      this.styleValueRegistry.recalc(object);
      dirtifyToRoot(object);
      renderingService.dirtify();
    };

    const handleUnmounted = (e: FederatedEvent) => {
      dirtifyToRoot(e.target as Element);
      renderingService.dirtify();
    };

    renderingService.hooks.init.tap(PrepareRendererPlugin.tag, () => {
      this.renderingContext.root.addEventListener(ElementEvent.MOUNTED, handleMounted);
      this.renderingContext.root.addEventListener(ElementEvent.UNMOUNTED, handleUnmounted);
      this.renderingContext.root.addEventListener(
        ElementEvent.ATTR_MODIFIED,
        handleAttributeChanged,
      );
      this.renderingContext.root.addEventListener(ElementEvent.BOUNDS_CHANGED, handleBoundsChanged);
    });

    renderingService.hooks.destroy.tap(PrepareRendererPlugin.tag, () => {
      this.renderingContext.root.removeEventListener(ElementEvent.MOUNTED, handleMounted);
      this.renderingContext.root.removeEventListener(ElementEvent.UNMOUNTED, handleUnmounted);
      this.renderingContext.root.removeEventListener(
        ElementEvent.ATTR_MODIFIED,
        handleAttributeChanged,
      );
      this.renderingContext.root.removeEventListener(
        ElementEvent.BOUNDS_CHANGED,
        handleBoundsChanged,
      );
    });
  }
}
