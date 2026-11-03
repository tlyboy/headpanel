'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { Color } from 'three'
import { useFormatter, useTranslations } from 'next-intl'
import type { TwinNetwork, TwinNode } from './twin'
import { DEVICE_MODELS, modelHeight } from './twin-models'
import { getThemeColors, subscribeTheme, type TwinColors } from './twin-colors'
import {
  CAMERA_DIR,
  fitZoom,
  HUB_RADIUS,
  layoutTwin,
  PLATFORM_HEIGHT,
  projectToView,
  type PlacedSite,
  type TwinLayout,
  type ViewSize,
} from './twin-layout'

const LABEL_CLASS =
  'pointer-events-none absolute z-10 -translate-x-1/2 translate-y-2 rounded-md border bg-popover/90 px-2 py-1 text-center text-xs whitespace-nowrap text-popover-foreground shadow-sm'

const CAMERA_DISTANCE = 80
const FRAME_MARGIN_PX = 56

const GATEWAY_SCALE = 1.25
const GATEWAY_PLATE_SIZE = 1.35
const GATEWAY_PLATE_HEIGHT = 0.06
const ACCENT_SHADE = 0.45
const HIT_BOX_SIZE = 0.95

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
  node: TwinNode
  x: number
  y: number
}

function CameraRig({ layout }: { layout: TwinLayout }) {
  const get = useThree((s) => s.get)
  const size = useThree((s) => s.size)

  useLayoutEffect(() => {
    const { camera, invalidate } = get()
    const [cx, cy, cz] = layout.center
    camera.position.set(
      cx + CAMERA_DIR[0] * CAMERA_DISTANCE,
      cy + CAMERA_DIR[1] * CAMERA_DISTANCE,
      cz + CAMERA_DIR[2] * CAMERA_DISTANCE,
    )
    camera.lookAt(cx, cy, cz)
    camera.zoom = fitZoom(layout, size, FRAME_MARGIN_PX)
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, size, layout])

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
  const baseY = PLATFORM_HEIGHT / 2 + (isGateway ? GATEWAY_PLATE_HEIGHT : 0)
  return (
    <group position={[x, 0, z]}>
      {isGateway && (
        <mesh position={[0, PLATFORM_HEIGHT / 2 + GATEWAY_PLATE_HEIGHT / 2, 0]} receiveShadow>
          <boxGeometry args={[GATEWAY_PLATE_SIZE, GATEWAY_PLATE_HEIGHT, GATEWAY_PLATE_SIZE]} />
          <meshStandardMaterial color={colors.primary} />
        </mesh>
      )}
      <group position={[0, baseY, 0]} rotation={[0, Math.PI / 4, 0]} scale={scale}>
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
  hoveredId,
  onHover,
  onLeave,
}: {
  placed: PlacedSite
  colors: TwinColors
  hoveredId: string | null
  onHover: (node: TwinNode, e: ThreeEvent<PointerEvent>) => void
  onLeave: () => void
}) {
  const { site, x, z, size, nodes } = placed
  const edge = site.serving ? colors.border : colors.destructive
  const gateway = nodes.find((n) => n.node.id === site.gatewayId)

  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow>
        <boxGeometry args={[size, PLATFORM_HEIGHT, size]} />
        <meshStandardMaterial color={colors.muted} />
        <Edges color={edge} lineWidth={site.serving ? 1 : 2} />
      </mesh>
      {gateway &&
        nodes
          .filter((n) => n !== gateway && n.node.online)
          .map((n) => (
            <Line
              key={n.node.id}
              points={[
                [gateway.x, PLATFORM_HEIGHT / 2 + 0.01, gateway.z],
                [n.x, PLATFORM_HEIGHT / 2 + 0.01, n.z],
              ]}
              color={colors['muted-foreground']}
              lineWidth={1}
              transparent
              opacity={0.45}
            />
          ))}
      {nodes.map((n) => (
        <Device
          key={n.node.id}
          node={n.node}
          x={n.x}
          z={n.z}
          isGateway={n.node.id === site.gatewayId}
          colors={colors}
          hovered={hoveredId === `${site.key}/${n.node.id}`}
          onHover={(e) => onHover(n.node, e)}
          onLeave={onLeave}
        />
      ))}
    </group>
  )
}

function HubLinks({ layout, colors }: { layout: TwinLayout; colors: TwinColors }) {
  return layout.sites.map(({ site, x, z, size, nodes }) => {
    const gateway = nodes.find((n) => n.node.id === site.gatewayId)
    const toEdge = 1 - size / 2 / Math.max(Math.abs(x), Math.abs(z))
    const end: [number, number, number] = gateway
      ? [
          x + gateway.x,
          PLATFORM_HEIGHT / 2 +
            GATEWAY_PLATE_HEIGHT +
            modelHeight(gateway.node.kind) * GATEWAY_SCALE,
          z + gateway.z,
        ]
      : [x * toEdge, PLATFORM_HEIGHT / 2, z * toEdge]
    const color = !site.serving
      ? colors.destructive
      : gateway
        ? colors.primary
        : colors['muted-foreground']
    return (
      <Line
        key={site.key}
        points={[[0, 1.2, 0], end]}
        color={color}
        lineWidth={gateway ? 2 : 1}
        dashed={!site.serving}
        dashSize={0.35}
        gapSize={0.25}
      />
    )
  })
}

export default function TwinScene({ network, version }: { network: TwinNetwork; version: string }) {
  const t = useTranslations('dashboard')
  const kinds = useTranslations('deviceKinds')
  const format = useFormatter()
  const colors = useSyncExternalStore(subscribeTheme, getThemeColors, getThemeColors)
  const layout = useMemo(() => layoutTwin(network.sites), [network])
  const [containerRef, view] = useViewSize()
  const zoom = view ? fitZoom(layout, view, FRAME_MARGIN_PX) : 1
  const [hovered, setHovered] = useState<(Hovered & { key: string }) | null>(null)

  return (
    <div ref={containerRef} className="absolute inset-0" onPointerLeave={() => setHovered(null)}>
      <Canvas
        orthographic
        flat
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ near: 1, far: CAMERA_DISTANCE * 2 + layout.radius * 2 }}
      >
        <CameraRig layout={layout} />
        <ambientLight intensity={1.7} />
        <directionalLight
          position={[-layout.radius * 0.5, layout.radius * 1.5, layout.radius * 0.8]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-layout.radius}
          shadow-camera-right={layout.radius}
          shadow-camera-top={layout.radius}
          shadow-camera-bottom={-layout.radius}
          shadow-camera-far={layout.radius * 4}
        />

        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[HUB_RADIUS, HUB_RADIUS, 1.2, 48]} />
          <meshStandardMaterial color={colors.primary} />
        </mesh>

        <HubLinks layout={layout} colors={colors} />

        {layout.sites.map((placed) => (
          <Platform
            key={placed.site.key}
            placed={placed}
            colors={colors}
            hoveredId={hovered?.key ?? null}
            onHover={(node, e) => {
              e.stopPropagation()
              setHovered({
                key: `${placed.site.key}/${node.id}`,
                node,
                x: e.nativeEvent.offsetX,
                y: e.nativeEvent.offsetY,
              })
            }}
            onLeave={() => setHovered(null)}
          />
        ))}
      </Canvas>

      {view && (
        <div
          className={LABEL_CLASS}
          style={projectToView(layout, view, zoom, [HUB_RADIUS * 0.7, 0, HUB_RADIUS * 0.7])}
        >
          <span className="font-medium">Headscale</span>{' '}
          <span className="font-mono text-muted-foreground">{version}</span>
        </div>
      )}
      {view &&
        layout.sites.map(({ site, x, z, size }) => {
          const online = site.nodes.filter((n) => n.online).length
          const count = t('twinOnline', { online, total: site.nodes.length })
          const gateway = site.gatewayName ? t('twinGateway', { name: site.gatewayName }) : null
          return (
            <div
              key={site.key}
              className={LABEL_CLASS}
              style={projectToView(layout, view, zoom, [x + size / 2, 0, z + size / 2])}
            >
              <div className="font-mono font-medium">{site.cidr ?? t('twinOther')}</div>
              <div className={site.serving ? 'text-muted-foreground' : 'text-destructive'}>
                {site.serving
                  ? [gateway, count].filter(Boolean).join(' · ')
                  : `${site.gatewayName ?? t('twinNoGateway')} · ${t('twinDown')}`}
              </div>
            </div>
          )
        })}

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: hovered.x, top: hovered.y - 12 }}
        >
          <div className="font-medium">{hovered.node.name}</div>
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
