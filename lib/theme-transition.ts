import { flushSync } from 'react-dom'

// 切换主题时那圈从点击处扩散的圆。登录页的按钮和登录后侧栏菜单里的「切换主题」
// 共用这一份：两处都该有这个效果，而下面几个坑抄一遍就得踩一遍。
//
// 圆心/半径的百分比基准、z-index 的明暗分支，配 app/globals.css 里
// ::view-transition-old/new(root) 那几条规则使用。

/** 触发点的视口坐标 */
export interface ThemeOrigin {
  x: number
  y: number
}

/** 明暗对切。两个入口都只需要这一行，别的都在下面 */
export function toggleThemeWithTransition(
  event: React.MouseEvent<HTMLElement>,
  resolvedTheme: string | undefined,
  setTheme: (theme: string) => void,
) {
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  applyThemeWithTransition({
    origin: originFromEvent(event),
    next,
    apply: () => setTheme(next),
  })
}

// 键盘触发的 click（Radix 的菜单项按回车也是走 click）detail 为 0 且 clientX/Y
// 也是 0，直接用会让圆心落到视口左上角，所以退回到元素中心。
// currentTarget 在 handler 返回后会被 React 置空，必须同步读。
function originFromEvent(event: React.MouseEvent<HTMLElement>): ThemeOrigin {
  if (event.detail !== 0) return { x: event.clientX, y: event.clientY }
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function applyThemeWithTransition({
  origin,
  next,
  apply,
}: {
  /** 拿不到触发点（键盘选中）就传 null，圆心退回视口中央 */
  origin: ThemeOrigin | null
  /** 切换后实际生效的明暗。决定圆是扩散还是收缩，也决定动哪一层快照 */
  next: 'light' | 'dark'
  /** 真正写入主题的那一下，会被 flushSync 包住 */
  apply: () => void
}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduced || typeof document.startViewTransition !== 'function') {
    apply()
    return
  }

  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2

  // 圆心和半径一律用百分比，不用像素。::view-transition-old/new(root) 的内容是
  // devicePixelRatio 倍的快照，像素长度会按快照尺寸解析再缩回视口，dPR=2 时坐标
  // 被砍半、圆心朝左上偏且半径盖不满屏。百分比相对伪元素自身盒子解析，不受影响。
  const cx = (x / window.innerWidth) * 100
  const cy = (y / window.innerHeight) * 100
  // circle() 的百分比半径基准是 sqrt(w² + h²) / sqrt(2)
  const radiusRef =
    Math.hypot(window.innerWidth, window.innerHeight) / Math.SQRT2
  const endPct =
    (Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ) /
      radiusRef) *
    100

  const transition = document.startViewTransition(() => {
    // setTheme 只 setState，真正写 class 的 applyTheme 在 useEffect 里。不 flushSync
    // 的话回调返回时 DOM 还是旧主题，新旧快照一样，动画等于没跑；而 CSS 若用
    // .dark 切 z-index，class 滞后还会让被动画的那层排到下层被完全盖住。
    flushSync(apply)
  })

  void transition.ready
    .then(() => {
      const clipPath = [
        `circle(0% at ${cx}% ${cy}%)`,
        `circle(${endPct}% at ${cx}% ${cy}%)`,
      ]
      const animation = document.documentElement.animate(
        {
          clipPath: next === 'dark' ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
          pseudoElement:
            next === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
        },
      )
      // fill: 'forwards' 的动画结束后不会自己消失，会一直挂在 documentElement 上。
      // 每切一次多积一条，下一轮过渡的同名伪元素会被上一轮残留继续写 clip-path。
      void transition.finished.finally(() => animation.cancel())
    })
    // 过渡被打断（连点、路由切换）时 ready 会 reject 成 InvalidStateError。
    // 主题此时已经切好了，catch 挂在 then 之后才能盖住派生的那条链。
    .catch(() => {})
}
