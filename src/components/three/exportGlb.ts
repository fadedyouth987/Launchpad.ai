import type { Object3D } from 'three';

/** Exports an object to a binary glTF (.glb) file and downloads it. Runs entirely in the browser. */
export async function downloadGlb(object: Object3D, filename: string): Promise<void> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const result = await new GLTFExporter().parseAsync(object, { binary: true });
  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
