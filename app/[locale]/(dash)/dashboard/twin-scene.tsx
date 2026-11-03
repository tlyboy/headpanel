'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { Color } from 'three'
import { useFormatter, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { TwinNetwork, TwinNode } from './twin'
import { DEVICE_MODELS, modelHeight } from './twin-models'
import { getThemeColors, subscribeTheme, type TwinColors } from './twin-colors'
import {
  CAMERA_DIR,
  HUB_RADIUS,
  LABEL_OFFSET_Z,
  layoutTwin,
  PLATFORM_HEIGHT,
  projectToView,
  type PlacedSite,
  type TwinLayout,
  type ViewSize,
} from './twin-layout'

const CAMERA_DISTANCE = 80
const PLATFORM_TOP = PLATFORM_HEIGHT / 2

const GATEWAY_SCALE = 1.25
const GATEWAY_PLATE_SIZE = 1.1
const GATEWAY_PLATE_HEIGHT = 0.06
const ACCENT_SHADE = 0.45
const HIT_BOX_SIZE = 0.95
const LABEL_INSET_PX = 6

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

interface Hovered {
  key: string
  node: TwinNode
  x: number
  y: number
}

function CameraRig({ layout }: { layout: TwinLayout }) {
  const get = useThree((s) => s.get)

  useLayoutEffect(() => {
    const { camera, invalidate } = get()
    const [cx, cy, cz] = layout.center
    camera.position.set(
      cx + CAMERA_DIR[0] * CAMERA_DISTANCE,
      cy + CAMERA_DIR[1] * CAMERA_DISTANCE,
      cz + CAMERA_DIR[2] * CAMERA_DISTANCE,
    )
    camera.lookAt(cx, cy, cz)
    camera.zoom = layout.zoom
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, layout])

  return null
}

function Device({
  node,
  x,
  z,
  isGateway,
  colors,
  hovered,
  onHover,
  onLeave,
}: {
  node: TwinNode
  x: number
  z: number
  isGateway: boolean
  colors: TwinColors
  hovered: boolean
  onHover: (e: ThreeEvent<PointerEvent>) => void
  onLeave: () => void
}) {
  const body = node.online ? colors.success : colors['muted-foreground']
  const accent = new Color(body).multiplyScalar(ACCENT_SHADE).getStyle()
  const scale = isGateway ? GATEWAY_SCALE : 1
  const baseY = PLATFORM_TOP + (isGateway ? GATEWAY_PLATE_HEIGHT : 0)
  return (
    <group position={[x, 0, z]}>
      {isGateway && (
        <mesh position={[0, PLATFORM_TOP + GATEWAY_PLATE_HEIGHT / 2, 0]} receiveShadow>
          <boxGeometry args={[GATEWAY_PLATE_SIZE, GATEWAY_PLATE_HEIGHT, GATEWAY_PLATE_SIZE]} />
          <meshStandardMaterial color={colors.primary} />
        </mesh>
      )}
      <group position={[0, baseY, 0]} scale={scale}>
        {DEVICE_MODELS[node.kind].map((part, i) => {
          const color = part.tone === 'body' ? body : accent
          return (
            <mesh key={i} position={part.position} castShadow>
              <boxGeometry args={part.size} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={hovered ? 0.5 : 0}
              />
            </mesh>
          )
        })}
        {/* Thin models like phones would be hard to hit, so one box catches the pointer for all of them */}
        <mesh
          position={[0, HIT_BOX_SIZE / 2, 0]}
          visible={false}
          onPointerOver={onHover}
          onPointerMove={onHover}
          onPointerOut={onLeave}
        >
          <boxGeometry args={[HIT_BOX_SIZE, HIT_BOX_SIZE, HIT_BOX_SIZE]} />
        </mesh>
      </group>
    </group>
  )
}

function Platform({
  placed,
  colors,
  hoveredKey,
  onHover,
  onLeave,
}: {
  placed: PlacedSite
  colors: TwinColors
  hoveredKey: string | null
  onHover: (node: TwinNode, e: ThreeEvent<PointerEvent>) => void
  onLeave: () => void
}) {
  const { site, x, z, width, depth, nodes } = placed
  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow>
        <boxGeometry args={[width, PLATFORM_HEIGHT, depth]} />
        <meshStandardMaterial color={colors.muted} />
        <Edges
          color={site.serving ? colors.border : colors.destructive}
          lineWidth={site.serving ? 1 : 2}
        />
      </mesh>
      {nodes.map((n) => (
        <Device
          key={n.node.id}
          node={n.node}
          x={n.x}
          z={n.z}
          isGateway={n.node.id === site.gatewayId}
          colors={colors}
          hovered={hoveredKey === `${site.key}/${n.node.id}`}
          onHover={(e) => onHover(n.node, e)}
          onLeave={onLeave}
        />
      ))}
    </group>
  )
}

function HubLinks({ layout, colors }: { layout: TwinLayout; colors: TwinColors }) {
  return layout.sites.flatMap(({ site, x, z, nodes }) => {
    const gateway = nodes.find((n) => n.node.id === site.gatewayId)
    if (!gateway) return []
    return (
      <Line
        key={site.key}
        points={[
          [0, 1.2, layout.hubZ],
          [
            x + gateway.x,
            PLATFORM_TOP + GATEWAY_PLATE_HEIGHT + modelHeight(gateway.node.kind) * GATEWAY_SCALE,
            z + gateway.z,
          ],
        ]}
        color={site.serving ? colors.primary : colors.destructive}
        lineWidth={2}
        dashed={!site.serving}
        dashSize={0.35}
        gapSize={0.25}
      />
    )
  })
}

function Scene({
  network,
  layout,
  colors,
  hoveredKey,
  onHover,
  onLeave,
}: {
  network: TwinNetwork
  layout: TwinLayout
  colors: TwinColors
  hoveredKey: string | null
  onHover: (siteKey: string, node: TwinNode, e: ThreeEvent<PointerEvent>) => void
  onLeave: () => void
}) {
  const hasGateway = network.sites.some((s) => s.gatewayId)
  return (
    <>
      <CameraRig layout={layout} />
      <ambientLight intensity={1.7} />
      <directionalLight
        position={[-layout.radius * 0.5, layout.radius * 1.5, layout.radius * 0.8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-layout.radius * 1.3}
        shadow-camera-right={layout.radius * 1.3}
        shadow-camera-top={layout.radius * 1.3}
        shadow-camera-bottom={-layout.radius * 1.3}
        shadow-camera-far={layout.radius * 4}
      />
      {hasGateway && (
        <>
          <mesh position={[0, 0.6, layout.hubZ]} castShadow>
            <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, 1.2, 48]} />
            <meshStandardMaterial color={colors.primary} />
          </mesh>
          <HubLinks layout={layout} colors={colors} />
        </>
      )}
      {layout.sites.map((placed) => (
        <Platform
          key={placed.site.key}
          placed={placed}
          colors={colors}
          hoveredKey={hoveredKey}
          onHover={(node, e) => onHover(placed.site.key, node, e)}
          onLeave={onLeave}
        />
      ))}
    </>
  )
}

export default function TwinScene({ network, version }: { network: TwinNetwork; version: string }) {
  const t = useTranslations('dashboard')
  const kinds = useTranslations('deviceKinds')
  const format = useFormatter()
  const colors = useSyncExternalStore(subscribeTheme, getThemeColors, getThemeColors)
  const [containerRef, view] = useViewSize()
  const layout = useMemo(() => (view ? layoutTwin(network.sites, view) : null), [network, view])
  const [hovered, setHovered] = useState<Hovered | null>(null)

  return (
    <div ref={containerRef} className="absolute inset-0" onPointerLeave={() => setHovered(null)}>
      {layout && view && (
        <>
          <Canvas
            orthographic
            flat
            shadows
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ near: 1, far: CAMERA_DISTANCE * 2 + layout.radius * 2 }}
          >
            <Scene
              network={network}
              layout={layout}
              colors={colors}
              hoveredKey={hovered?.key ?? null}
              onHover={(siteKey, node, e) => {
                e.stopPropagation()
                setHovered({
                  key: `${siteKey}/${node.id}`,
                  node,
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }}
              onLeave={() => setHovered(null)}
            />
          </Canvas>

          {network.sites.some((s) => s.gatewayId) && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center text-xs whitespace-nowrap text-primary-foreground"
              style={projectToView(layout, view, [0, 1.2, layout.hubZ])}
            >
              <div className="font-medium">Headscale</div>
              <div className="font-mono text-[10px] opacity-80">{version}</div>
            </div>
          )}

          {layout.sites.map(({ site, x, z, width, depth, nodes }) => {
            const online = site.nodes.filter((n) => n.online).length
            const detail = site.serving
              ? [
                  site.gatewayName && t('twinGateway', { name: site.gatewayName }),
                  t('twinOnline', { online, total: site.nodes.length }),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : `${site.gatewayName ?? t('twinNoGateway')} · ${t('twinDown')}`
            return (
              <div key={site.key}>
                <div
                  className="pointer-events-none absolute -translate-y-full pb-1 text-xs leading-tight"
                  style={{
                    ...projectToView(layout, view, [x - width / 2, PLATFORM_TOP, z - depth / 2]),
                    maxWidth: width * layout.zoom,
                  }}
                >
                  <div className="truncate font-mono font-medium">
                    {site.cidr ?? t('twinOther')}
                  </div>
                  <div
                    className={cn(
                      'truncate',
                      site.serving ? 'text-muted-foreground' : 'text-destructive',
                    )}
                    title={detail}
                  >
                    {detail}
                  </div>
                </div>
                {nodes.map((n) => (
                  <div
                    key={n.node.id}
                    className={cn(
                      'pointer-events-none absolute -translate-x-1/2 text-center text-[11px] leading-tight',
                      !n.node.online && 'text-muted-foreground',
                    )}
                    style={{
                      ...projectToView(layout, view, [
                        x + n.x,
                        PLATFORM_TOP,
                        z + n.z + LABEL_OFFSET_Z,
                      ]),
                      width: layout.cellPx - LABEL_INSET_PX,
                    }}
                  >
                    <div className="truncate font-medium">{n.node.note ?? n.node.name}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {n.node.lanIp ?? n.node.ip}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: hovered.x, top: hovered.y - 12 }}
        >
          <div className="font-medium">{hovered.node.name}</div>
          {hovered.node.note && <div>{hovered.node.note}</div>}
          <div className="text-muted-foreground">{kinds(hovered.node.kind)}</div>
          {hovered.node.ip && (
            <div className="font-mono text-muted-foreground">{hovered.node.ip}</div>
          )}
          {hovered.node.lanIp && (
            <div className="font-mono text-muted-foreground">
              {t('twinLanIp', { ip: hovered.node.lanIp })}
            </div>
          )}
          {hovered.node.tags.length > 0 && (
            <div className="text-muted-foreground">{hovered.node.tags.join(', ')}</div>
          )}
          <div className={hovered.node.online ? 'text-success' : 'text-muted-foreground'}>
            {hovered.node.online
              ? t('twinLegendOnline')
              : t('twinLastSeen', {
                  time: format.dateTime(new Date(hovered.node.lastSeen), {
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
