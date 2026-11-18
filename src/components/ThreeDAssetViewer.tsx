import React, { useEffect, useRef, useState } from 'react';
import { Box, Download, Layers, Palette, RefreshCw, RotateCw, Sun, Check } from 'lucide-react';
import {
  LIGHTING_OPTIONS,
  MATERIAL_OPTIONS,
  MODEL_PRESETS,
  type LightingPreset,
  type MaterialMode,
} from './three/presets';
import { applyLighting, buildModel, createStage, type Stage } from './three/scene';
import { downloadGlb } from './three/exportGlb';

/**
 * Interactive WebGL preview of sample 3D campaign assets (three.js). Drag or use the arrow keys to
 * rotate, scroll or +/- to zoom. "Download .glb" exports the current model as a real glTF file.
 */
export const ThreeDAssetViewer: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(MODEL_PRESETS[0].id);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('cyber');
  const [materialMode, setMaterialMode] = useState<MaterialMode>('pbr');
  const [fps, setFps] = useState(0);
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [webglError, setWebglError] = useState<string | null>(null);
  const controlsRef = useRef({ autoRotate, rotationSpeed: 0.008 });
  controlsRef.current.autoRotate = autoRotate;

  const selectedModel = MODEL_PRESETS.find((m) => m.id === selectedModelId) || MODEL_PRESETS[0];

  useEffect(() => {
    if (!mountRef.current) return;
    try {
      stageRef.current = createStage(mountRef.current, () => controlsRef.current, setFps);
    } catch (err) {
      setWebglError('3D preview is not available in this browser (WebGL could not start).');
      console.error('[3d] WebGL init failed', err);
    }
    return () => {
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.model.clear();
    stage.model.add(buildModel(selectedModel, materialMode, wireframe));
  }, [selectedModel, materialMode, wireframe]);

  useEffect(() => {
    if (stageRef.current) applyLighting(stageRef.current.lights, lightingPreset);
  }, [lightingPreset]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    const step = 0.15;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => stage.rotateBy(-step, 0),
      ArrowRight: () => stage.rotateBy(step, 0),
      ArrowUp: () => stage.rotateBy(0, -step),
      ArrowDown: () => stage.rotateBy(0, step),
      '+': () => stage.zoomBy(-0.4),
      '=': () => stage.zoomBy(-0.4),
      '-': () => stage.zoomBy(0.4),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  };

  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setExportState('busy');
    try {
      await downloadGlb(stage.model, `${selectedModel.id}.glb`);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 3000);
    } catch (err) {
      console.error('[3d] export failed', err);
      setExportState('error');
    }
  };

  const choice = (active: boolean) =>
    `rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
      active
        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
    }`;

  return (
    <section
      aria-labelledby="viewer-title"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-indigo-600 p-2.5 text-white" aria-hidden="true">
            <Box className="h-5 w-5" />
          </span>
          <div>
            <h2 id="viewer-title" className="text-base font-bold text-slate-900 dark:text-white">
              3D asset preview
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Drag or use the arrow keys to rotate. Scroll or press + / − to zoom.
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Model" className="flex flex-wrap gap-2">
          {MODEL_PRESETS.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={selectedModelId === m.id}
              onClick={() => setSelectedModelId(m.id)}
              className={choice(selectedModelId === m.id)}
            >
              {m.name.split(' - ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="relative border-b border-slate-200 bg-canvas dark:border-slate-800 lg:col-span-7 lg:border-b-0 lg:border-r">
          <div
            ref={mountRef}
            tabIndex={0}
            role="img"
            aria-label={`3D preview of ${selectedModel.name}. Use arrow keys to rotate and plus or minus to zoom.`}
            onKeyDown={onKeyDown}
            className="h-[420px] w-full cursor-grab focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-indigo-400 active:cursor-grabbing"
          />
          {webglError && (
            <p
              role="alert"
              className="absolute inset-x-4 top-4 rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-900"
            >
              {webglError}
            </p>
          )}
          <div className="absolute left-3 top-3 flex gap-2 text-xs font-semibold" aria-hidden="true">
            <span className="rounded-full bg-surface px-2.5 py-1 text-emerald-700 dark:text-emerald-300">
              {fps} FPS
            </span>
            <span className="rounded-full bg-surface px-2.5 py-1 text-ink">{selectedModel.polyCount}</span>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-2">
            <button
              aria-pressed={autoRotate}
              onClick={() => setAutoRotate(!autoRotate)}
              className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-white ring-1 ring-line-strong hover:bg-surface-muted aria-pressed:bg-indigo-600"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Auto-rotate {autoRotate ? 'on' : 'off'}
            </button>
            <button
              aria-pressed={wireframe}
              onClick={() => setWireframe(!wireframe)}
              className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-white ring-1 ring-line-strong hover:bg-surface-muted aria-pressed:bg-indigo-600"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Wireframe {wireframe ? 'on' : 'off'}
            </button>
          </div>
        </div>

        <div className="space-y-6 p-5 lg:col-span-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Sample asset · {selectedModel.influencerName}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{selectedModel.name}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{selectedModel.tagline}</p>
          </div>

          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
              <Palette className="h-4 w-4" aria-hidden="true" /> Material
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {MATERIAL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={materialMode === o.id}
                  onClick={() => setMaterialMode(o.id)}
                  className={choice(materialMode === o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
              <Sun className="h-4 w-4" aria-hidden="true" /> Lighting
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {LIGHTING_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  aria-pressed={lightingPreset === o.id}
                  onClick={() => setLightingPreset(o.id)}
                  className={choice(lightingPreset === o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
            <dt className="text-slate-600 dark:text-slate-400">Polygons (spec)</dt>
            <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{selectedModel.polyCount}</dd>
            <dt className="text-slate-600 dark:text-slate-400">Vertices (spec)</dt>
            <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{selectedModel.vertices}</dd>
            <dt className="text-slate-600 dark:text-slate-400">Textures (spec)</dt>
            <dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{selectedModel.textures}</dd>
          </dl>

          <div>
            <button
              onClick={handleExport}
              disabled={exportState === 'busy' || !!webglError}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {exportState === 'busy' ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : exportState === 'done' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {exportState === 'busy'
                ? 'Preparing .glb…'
                : exportState === 'done'
                  ? 'Downloaded'
                  : 'Download model (.glb)'}
            </button>
            <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {exportState === 'error'
                ? 'Export failed. Please try again.'
                : 'Exports the preview mesh shown above as a glTF binary file.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
