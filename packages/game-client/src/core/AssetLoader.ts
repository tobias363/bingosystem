import { Assets } from "pixi.js";

/**
 * Loads game assets (spritesheets, audio manifests) via PixiJS Assets.
 * Each game registers its own asset bundles before loading.
 */
export class AssetLoader {
  private loaded = new Set<string>();

  async loadBundle(bundleName: string, manifest: Record<string, string>): Promise<void> {
    if (this.loaded.has(bundleName)) return;

    Assets.addBundle(bundleName, manifest);
    await Assets.loadBundle(bundleName);
    this.loaded.add(bundleName);
  }

  isLoaded(bundleName: string): boolean {
    return this.loaded.has(bundleName);
  }
}
