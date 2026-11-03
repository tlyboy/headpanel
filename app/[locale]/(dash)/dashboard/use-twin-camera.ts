'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { RootState } from '@react-three/fiber'
import { Vector2, type InstancedMesh } from 'three'
import {
  CAMERA_DIR,
  CAMERA_RIGHT,
  CAMERA_UP,
  axisU,
  axisV,
  fitZoom,
  LABEL_ZOOM,
  PLATFORM_TOP,
  SCENE_HEIGHT,
  type TwinLayout,
  type ViewSize,
} from './twin-layout'

const MAX_ZOOM = 90
const WHEEL_SPEED = 0.0015
/** A press that travels further than this is a drag, not a click. */
const TAP_TRAVEL_PX = 5
const BUTTON_FACTOR = 1.35
export const CAMERA_DISTANCE = 1000

// Below these zooms the text would be unreadable, so hiding it is also what keeps huge networks fast.
const DEVICE_LABEL_MIN_ZOOM = 20
const ZONE_TITLE_MIN_ZOOM = 4

interface CameraState {
  u: number
  v: number
  zoom: number
}

/** Extra room around the view so labels near the edge are ready before they scroll in. */
const CULL_MARGIN_PX = 80

/**
 * Panning and zooming write straight to the three.js camera and to the labels' styles. They never touch
 * React state, and zones outside the view are removed from rendering, so a drag only pays for what is visible.
 * `labelLayer` and `titleLayer` hold one child per zone, in layout order, after any fixed children.
 */
export function useTwinCamera(
  layout: TwinLayout | null,
  view: ViewSize | null,
  labelLayerRef: RefObject<HTMLDivElement | null>,
  titleLayerRef: RefObject<HTMLDivElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  pickMeshRef: RefObject<InstancedMesh | null>,
  onTap: (instanceId: number | null) => void,
) {
  const three = useRef<RootState | null>(null)
  const camera = useRef<CameraState>({ u: 0, v: 0, zoom: 1 })
  const moved = useRef(false)
  const drag = useRef<{ x: number; y: number; travel: number } | null>(null)

  const apply = useCallback(() => {
    const { u, v, zoom } = camera.current
    const [labelLayer, titleLayer] = [labelLayerRef.current, titleLayerRef.current]
    if (view && layout && labelLayer && titleLayer) {
      const [originX, originY] = [view.width / 2 - zoom * u, view.height / 2 + zoom * v]
      labelLayer.style.transform = `translate(${originX}px, ${originY}px) scale(${zoom / LABEL_ZOOM})`
      titleLayer.dataset.detail = zoom >= DEVICE_LABEL_MIN_ZOOM ? 'on' : 'off'
      const showDevices = zoom >= DEVICE_LABEL_MIN_ZOOM
      const showTitles = zoom >= ZONE_TITLE_MIN_ZOOM
      const zoneLabels = labelLayer.querySelectorAll<HTMLElement>(':scope > [data-zone]')
      const zoneTitles = titleLayer.querySelectorAll<HTMLElement>(':scope > [data-zone]')
      layout.sites.forEach((placed, i) => {
        const [halfW, halfD] = [placed.width / 2, placed.depth / 2]
        const left = originX + zoom * axisU(placed.x - halfW, 0, 0)
        const right = originX + zoom * axisU(placed.x + halfW, 0, 0)
        const top = originY - zoom * axisV(0, SCENE_HEIGHT, placed.z - halfD)
        const bottom = originY - zoom * axisV(0, 0, placed.z + halfD)
        const visible =
          right > -CULL_MARGIN_PX &&
          left < view.width + CULL_MARGIN_PX &&
          bottom > -CULL_MARGIN_PX &&
          top < view.height + CULL_MARGIN_PX
        const zoneLabel = zoneLabels[i]
        const zoneTitle = zoneTitles[i]
        if (zoneLabel) {
          const display = visible && showDevices ? '' : 'none'
          if (zoneLabel.style.display !== display) zoneLabel.style.display = display
        }
        if (zoneTitle) {
          const display = visible && showTitles ? '' : 'none'
          if (zoneTitle.style.display !== display) zoneTitle.style.display = display
          if (display === '') {
            const y = originY - zoom * axisV(0, PLATFORM_TOP, placed.z - halfD)
            zoneTitle.style.transform = `translate(${left}px, ${y}px) translateY(-100%)`
            zoneTitle.style.maxWidth = `${right - left}px`
          }
        }
      })
    }
    const state = three.current
    if (!state) return
    state.camera.position.set(
      CAMERA_RIGHT[0] * u + CAMERA_UP[0] * v + CAMERA_DIR[0] * CAMERA_DISTANCE,
      CAMERA_RIGHT[1] * u + CAMERA_UP[1] * v + CAMERA_DIR[1] * CAMERA_DISTANCE,
      CAMERA_RIGHT[2] * u + CAMERA_UP[2] * v + CAMERA_DIR[2] * CAMERA_DISTANCE,
    )
    state.camera.lookAt(
      CAMERA_RIGHT[0] * u + CAMERA_UP[0] * v,
      CAMERA_RIGHT[1] * u + CAMERA_UP[1] * v,
      CAMERA_RIGHT[2] * u + CAMERA_UP[2] * v,
    )
    state.camera.zoom = zoom
    state.camera.updateProjectionMatrix()
    state.invalidate()
  }, [view, layout, labelLayerRef, titleLayerRef])

  const fit = useCallback(() => {
    if (!layout || !view) return
    moved.current = false
    camera.current = {
      u: (layout.minU + layout.maxU) / 2,
      v: (layout.minV + layout.maxV) / 2,
      zoom: fitZoom(layout, view),
    }
    apply()
  }, [layout, view, apply])

  const clamp = useCallback(() => {
    if (!layout) return
    const c = camera.current
    c.u = Math.min(layout.maxU, Math.max(layout.minU, c.u))
    c.v = Math.min(layout.maxV, Math.max(layout.minV, c.v))
  }, [layout])

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      if (!layout || !view) return
      const c = camera.current
      const minZoom = Math.min(fitZoom(layout, view), MAX_ZOOM) * 0.8
      const next = Math.min(MAX_ZOOM, Math.max(minZoom, c.zoom * factor))
      const [dx, dy] = [px - view.width / 2, py - view.height / 2]
      c.u += dx / c.zoom - dx / next
      c.v -= dy / c.zoom - dy / next
      c.zoom = next
      moved.current = true
      clamp()
      apply()
    },
    [layout, view, clamp, apply],
  )

  // Follow new layouts and sizes until the user has moved the view, then leave their view alone.
  useLayoutEffect(() => {
    if (!moved.current) fit()
    else {
      clamp()
      apply()
    }
  }, [fit, clamp, apply])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * WHEEL_SPEED), e.clientX - rect.left, e.clientY - rect.top)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [containerRef, zoomAt])

  const attach = useCallback(
    (state: RootState) => {
      three.current = state
      apply()
    },
    [apply],
  )

  // Pointer capture sends the release to the container, so three's own click events never fire
  const pick = (x: number, y: number, rect: DOMRect) => {
    const state = three.current
    const mesh = pickMeshRef.current
    if (!state || !mesh) return null
    const pointer = new Vector2((x / rect.width) * 2 - 1, 1 - (y / rect.height) * 2)
    state.raycaster.setFromCamera(pointer, state.camera)
    return state.raycaster.intersectObject(mesh)[0]?.instanceId ?? null
  }

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      drag.current = { x: e.clientX, y: e.clientY, travel: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.style.cursor = 'grabbing'
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const start = drag.current
      if (!start) return
      const c = camera.current
      c.u -= (e.clientX - start.x) / c.zoom
      c.v += (e.clientY - start.y) / c.zoom
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        travel: start.travel + Math.hypot(e.clientX - start.x, e.clientY - start.y),
      }
      moved.current = true
      clamp()
      apply()
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const press = drag.current
      drag.current = null
      if (press && press.travel < TAP_TRAVEL_PX) {
        const rect = e.currentTarget.getBoundingClientRect()
        onTap(pick(e.clientX - rect.left, e.clientY - rect.top, rect))
      }
      e.currentTarget.style.cursor = ''
    },
  }

  const zoomButton = (direction: 1 | -1) => {
    if (view) zoomAt(BUTTON_FACTOR ** direction, view.width / 2, view.height / 2)
  }

  return { attach, handlers, fit, zoomButton, isDragging: () => drag.current !== null }
}
