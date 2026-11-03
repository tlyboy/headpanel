'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Matrix4, type InstancedMesh } from 'three'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { osLabel } from '@/components/os-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isServing, type TwinNetwork } from './twin'
import { getThemeColors, subscribeTheme, type TwinColors } from './twin-colors'
import {
  buildInstances,
  gatewayTop,
  type BoxInstance,
  type HitTarget,
  type TwinInstances,
} from './twin-instances'
import {
  HUB_RADIUS,
  LABEL_OFFSET_Z,
  LABEL_WIDTH_PX,
  labelPosition,
  layoutTwin,
  PLATFORM_TOP,
  type TwinLayout,
  type ViewSize,
} from './twin-layout'
import { CAMERA_DISTANCE, useTwinCamera } from './use-twin-camera'

/** A shadow map stretched over a huge scene looks bad and costs a second pass of every box. */
const SHADOW_DEVICE_LIMIT = 300
const HOVER_PLATE_SIZE = 1.5

function useViewSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewSize | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setView({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, view] as const
}

function BoxInstances({
  boxes,
  castShadow,
  receiveShadow,
  visible = true,
  onPointerMove,
  onPointerOut,
}: {
  boxes: BoxInstance[]
  castShadow?: boolean
  receiveShadow?: boolean
  visible?: boolean
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: () => void
}) {
  const mesh = useRef<InstancedMesh>(null)
  const invalidate = useThree((s) => s.invalidate)

  useLayoutEffect(() => {
    const instanced = mesh.current
    if (!instanced) return
    const matrix = new Matrix4()
    boxes.forEach((box, i) => {
      matrix.makeScale(...box.size)
      matrix.setPosition(...box.position)
      instanced.setMatrixAt(i, matrix)
      instanced.setColorAt(i, box.color)
    })
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.computeBoundingSphere()
    invalidate()
  }, [boxes, invalidate])

  return (
    <instancedMesh
      key={boxes.length}
      ref={mesh}
      args={[undefined, undefined, boxes.length]}
      visible={visible}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    >
      <boxGeometry />
      <meshStandardMaterial />
    </instancedMesh>
  )
}

function HubLinks({ layout, colors }: { layout: TwinLayout; colors: TwinColors }) {
  const up: [number, number, number][] = []
  const down: [number, number, number][] = []
  for (const { site, x, z, nodes } of layout.sites) {
    const target = isServing(site) ? up : down
    for (const placed of nodes) {
      if (!placed.isGateway) continue
      target.push([0, 1.2, layout.hubZ], [x + placed.x, gatewayTop(placed), z + placed.z])
    }
  }
  return (
    <>
      {up.length > 0 && <Line segments points={up} color={colors.primary} lineWidth={2} />}
      {down.length > 0 && (
        <Line
          segments
          points={down}
          color={colors.destructive}
          lineWidth={2}
          dashed
          dashSize={0.35}
          gapSize={0.25}
        />
      )}
    </>
  )
}

function SceneContent({
  layout,
  instances,
  colors,
  shadows,
  hovered,
  onHover,
  onLeave,
}: {
  layout: TwinLayout
  instances: TwinInstances
  colors: TwinColors
  shadows: boolean
  hovered: HitTarget | null
  onHover: (e: ThreeEvent<PointerEvent>) => void
  onLeave: () => void
}) {
  useEffect(() => () => instances.outlines.dispose(), [instances])
  return (
    <>
      <ambientLight intensity={shadows ? 1.7 : 2.2} />
      <directionalLight
        key={Math.round(layout.radius)}
        position={[-layout.radius * 0.5, layout.radius * 1.5, layout.radius * 0.8]}
        intensity={shadows ? 1.6 : 1.1}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-layout.radius * 1.3}
        shadow-camera-right={layout.radius * 1.3}
        shadow-camera-top={layout.radius * 1.3}
        shadow-camera-bottom={-layout.radius * 1.3}
        shadow-camera-far={layout.radius * 4}
      />
      {layout.hasHub && (
        <>
          <mesh position={[0, 0.6, layout.hubZ]} castShadow={shadows}>
            <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, 1.2, 48]} />
            <meshStandardMaterial color={colors.primary} />
          </mesh>
          <HubLinks layout={layout} colors={colors} />
        </>
      )}
      <BoxInstances boxes={instances.solids} castShadow={shadows} receiveShadow={shadows} />
      <lineSegments geometry={instances.outlines}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <BoxInstances
        boxes={instances.hitBoxes}
        visible={false}
        onPointerMove={onHover}
        onPointerOut={onLeave}
      />
      {hovered && (
        <mesh position={[hovered.x, PLATFORM_TOP + 0.01, hovered.z]}>
          <boxGeometry args={[HOVER_PLATE_SIZE, 0.02, HOVER_PLATE_SIZE]} />
          <meshBasicMaterial color={colors.primary} transparent opacity={0.45} />
        </mesh>
      )}
    </>
  )
}

function HubLabel({ version }: { version: string }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-xs whitespace-nowrap text-primary-foreground">
      <div className="font-medium">Headscale</div>
      <div className="font-mono text-[10px] opacity-80">{version}</div>
    </div>
  )
}

function DeviceLabels({ layout }: { layout: TwinLayout }) {
  return layout.sites.map(({ site, x, z, nodes }) => (
    <div key={site.key} data-zone>
      {nodes.map((n) => (
        <div
          key={n.node.id}
          className={cn(
            'absolute -translate-x-1/2 text-center text-[11px] leading-tight',
            !n.node.online && 'text-muted-foreground',
          )}
          style={{
            ...labelPosition(x + n.x, PLATFORM_TOP, z + n.z + LABEL_OFFSET_Z),
            width: LABEL_WIDTH_PX,
          }}
        >
          <div className="truncate font-medium">{n.node.note ?? n.node.name}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {n.node.lanIp ?? n.node.ip}
          </div>
        </div>
      ))}
    </div>
  ))
}

function ZoneTitles({ layout }: { layout: TwinLayout }) {
  const t = useTranslations('dashboard')
  return layout.sites.map(({ site }) => {
    const online = site.nodes.filter((n) => n.online).length
    const down = site.gateways.filter((g) => !g.serving)
    const subnet = site.cidrs.join(', ')
    const detail = down.length
      ? `${[...new Set(down.map((g) => g.name))].join(', ')} · ${t('twinDown')}`
      : [
          site.location ? subnet : site.gateways[0]?.name,
          t('twinOnline', { online, total: site.nodes.length }),
        ]
          .filter(Boolean)
          .join(' · ')
    return (
      <div key={site.key} data-zone className="absolute top-0 left-0 pb-1 text-xs leading-tight">
        <div className="w-fit max-w-full truncate rounded-sm font-medium group-data-[detail=off]/titles:bg-card/85 group-data-[detail=off]/titles:px-1">
          {site.location ?? (subnet || t('twinOther'))}
        </div>
        <div
          className={cn(
            'truncate group-data-[detail=off]/titles:hidden',
            down.length ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {detail}
        </div>
      </div>
    )
  })
}

export default function TwinScene({
  network,
  version,
  fitKey,
}: {
  network: TwinNetwork
  version: string
  /** The view refits when this changes, because the filtered scene is a different shape. */
  fitKey: string | null
}) {
  const t = useTranslations('dashboard')
  const format = useFormatter()
  const colors = useSyncExternalStore(subscribeTheme, getThemeColors, getThemeColors)
  const [containerRef, view] = useViewSize()
  const labelLayerRef = useRef<HTMLDivElement>(null)
  const titleLayerRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => (view ? layoutTwin(network.sites, view) : null), [network, view])
  const instances = useMemo(
    () => (layout ? buildInstances(layout, colors) : null),
    [layout, colors],
  )
  const camera = useTwinCamera(layout, view, labelLayerRef, titleLayerRef, containerRef)
  const { fit } = camera
  const lastFitKey = useRef(fitKey)
  useLayoutEffect(() => {
    if (lastFitKey.current === fitKey) return
    lastFitKey.current = fitKey
    fit()
  }, [fitKey, fit])
  const [hover, setHover] = useState<{ target: HitTarget; x: number; y: number } | null>(null)
  const shadows = (instances?.hitTargets.length ?? 0) <= SHADOW_DEVICE_LIMIT

  const node = hover?.target.placed.node

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab touch-none overflow-hidden select-none"
      onPointerLeave={() => setHover(null)}
      {...camera.handlers}
    >
      {layout && instances && (
        <>
          <Canvas
            orthographic
            flat
            shadows
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ near: 1, far: CAMERA_DISTANCE * 3 }}
            onCreated={camera.attach}
          >
            <SceneContent
              layout={layout}
              instances={instances}
              colors={colors}
              shadows={shadows}
              hovered={hover?.target ?? null}
              onHover={(e) => {
                if (camera.isDragging() || e.instanceId === undefined) return
                e.stopPropagation()
                setHover({
                  target: instances.hitTargets[e.instanceId],
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }}
              onLeave={() => setHover(null)}
            />
          </Canvas>
          <div
            ref={labelLayerRef}
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
          >
            {layout.hasHub && (
              <div className="absolute" style={labelPosition(0, 1.2, layout.hubZ)}>
                <HubLabel version={version} />
              </div>
            )}
            <DeviceLabels layout={layout} />
          </div>
          <div
            ref={titleLayerRef}
            className="group/titles pointer-events-none absolute inset-0 overflow-hidden"
          >
            <ZoneTitles layout={layout} />
          </div>
          <div
            className="absolute right-2 bottom-2 flex flex-col gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('twinZoomIn')}
              onClick={() => camera.zoomButton(1)}
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('twinZoomOut')}
              onClick={() => camera.zoomButton(-1)}
            >
              <Minus />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label={t('twinFit')} onClick={camera.fit}>
              <Maximize />
            </Button>
          </div>
        </>
      )}

      {hover && node && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: hover.x, top: hover.y - 12 }}
        >
          <div className="font-medium">{node.name}</div>
          {node.note && <div>{node.note}</div>}
          {node.location && <div className="text-muted-foreground">{node.location}</div>}
          {node.os && (
            <div className="text-muted-foreground">
              {[osLabel(node.os), node.deviceModel].filter(Boolean).join(' · ')}
            </div>
          )}
          {node.ip && <div className="font-mono text-muted-foreground">{node.ip}</div>}
          {node.lanIp && (
            <div className="font-mono text-muted-foreground">
              {t('twinLanIp', { ip: node.lanIp })}
            </div>
          )}
          {node.tags.length > 0 && (
            <div className="text-muted-foreground">{node.tags.join(', ')}</div>
          )}
          <div className={node.online ? 'text-success' : 'text-muted-foreground'}>
            {node.online
              ? t('twinLegendOnline')
              : t('twinLastSeen', {
                  time: format.dateTime(new Date(node.lastSeen), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }),
                })}
          </div>
        </div>
      )}
    </div>
  )
}
