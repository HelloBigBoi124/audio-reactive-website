import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const musics = [
  { title: 'Corrupted', author: 'Danimal Cannon & Zef', time: '6:16', img: '/src/assets/corrupted-danimalcannon-zef.jpg', src: '/music/corrupted-danimalcannon-zef.mp3' },
  { title: 'Chronos', author: 'Danimal Cannon & Zef', time: '4:29', img: '' },
  { title: 'Milky Ways', author: 'Bossfight', time: '3:07', img: '' },
  { title: 'Logic Gatekeeper', author: 'Danimal Cannon & Zef', time: '4:58', img: '' },
  { title: 'Long Live the New Fresh', author: 'Danimal Cannon', time: '4:26', img: '' },
  { title: 'New Game', author: 'Nitro Fun', time: '4:19', img: '' },
  { title: 'The Art of War', author: 'Chipzel', time: '3:11', img: '' },
  { title: 'Termination Shock', author: 'Sabrepulse', time: '4:20', img: '' },
  { title: 'Sevcon', author: 'Big Giant Circles', time: '4:39', img: '' },
  { title: 'Cascade', author: 'Kubbi', time: '4:19', img: '' },
  { title: 'Barracuda', author: 'Noisestorm', time: '4:22', img: '' },
  { title: 'Dubwoofer Substep', author: 'Omnitica', time: '4:44', img: '' },
  { title: 'Core', author: 'Zef', time: '4:34', img: '/src/assets/core-zef.jpg', src: '/music/core-zef.mp3' },
  { title: 'Final Boss', author: 'Nitro Fun', time: '5:16', img: '/src/assets/finalboss-nitrofun.jpg', src: '/music/finalboss-nitrofun.mp3' }
]

// ===== Tela de aviso =====
const WARNING_MIN_READ_MS = 4000  // tempo mínimo antes de liberar o "continuar"
const WARNING_TEXT_FADE_MS = 400  // primeiro o texto some...
const WARNING_FADE_MS = 1200      // ...depois a tela preta some (fade da opacidade)

// ===== Entrada da lista =====
const REVEAL_START_MS = 800   // quando começa a aparecer, contado do clique (a tela preta já está clareando)
const REVEAL_STEP_MS = 140    // intervalo entre uma música e a próxima
const ITEM_SFX = '/audio/appear.mp3'
const ITEM_SFX_VOLUME = 0.4

// ===== Player =====
const DEFAULT_VOLUME = 1      // volume inicial do slider (0 a 1)

// ===== Detecção de batida =====
const BEAT_STD = 1.0          // desvios padrão acima da média da janela
const BEAT_RATIO = 1.15       // mínimo acima da média (protege músicas muito constantes)
const BEAT_RISE = 1.05        // a energia precisa estar subindo (ignora o lado descendente)
const BEAT_MIN_ENERGY = 0.04  // piso absoluto (ignora silêncio)
const BEAT_COOLDOWN = 180     // ms entre batidas
const HISTORY = 60            // ~1s de histórico a 60fps

// ===== Tremida do cubo =====
const SHAKE_ROT = 8           // graus
const SHAKE_MOVE = 10         // px
const SHAKE_DECAY_MS = 130    // quanto tempo a tremida leva pra acalmar

// ===== Fundo =====
const BG_GAIN = 1.5        // ganho do brilho: batidas fortes chegam na cor final
const BG_DECAY_MS = 250    // quanto tempo o brilho "segura" depois da batida
const BG_ATTACK_MS = 45    // quão rápido o fundo clareia (suba pra 80 = mais suave)
const BG_RELEASE_MS = 120  // suavização da volta

// size = tamanho | radius = distância até o centro da tela | angle = posição inicial na órbita
// orbit = segundos por volta ao redor da tela | spin = segundos por volta no próprio eixo
const SQUARES = [
  { size: '50vmin', radius: '45vmin', angle: 0,   orbit: 40, spin: 60, reverse: false, grow: 0.30 },
  { size: '90vmin', radius: '65vmin', angle: 72,  orbit: 70, spin: 90, reverse: true,  grow: 0.20 },
  { size: '30vmin', radius: '35vmin', angle: 144, orbit: 30, spin: 50, reverse: false, grow: 0.40 },
  { size: '70vmin', radius: '55vmin', angle: 216, orbit: 55, spin: 75, reverse: true,  grow: 0.25 },
  { size: '20vmin', radius: '25vmin', angle: 288, orbit: 25, spin: 40, reverse: false, grow: 0.45 },
]

// ===== Subida na batida (px que sobe na batida mais forte) =====
const LIFT = { cubo: 15, titulo: 15, autor: 15, barra: 15, botoes: 15 }
const LIFT_ATTACK_MS = 40    // quão rápido sobe na batida
const LIFT_RELEASE_MS = 10   // quão devagar desce quando não tem batida

// faz um elemento subir com a batida (lê a variável --lift que o painel recebe a cada frame)
const liftStyle = (px) => ({ transform: `translateY(calc(var(--lift, 0) * -${px}px))` })

// ===== Fade da música =====
const MAX_VOL = 0.8
const FADE_OUT_MS = 300
const FADE_IN_MS = 500

let fadeId = 0
function fade(audio, to, ms) {
  return new Promise((resolve) => {
    const id = ++fadeId
    const from = audio.volume
    const t0 = performance.now()

    const step = (now) => {
      if (id !== fadeId) return resolve(false) // outro fade começou, cancela este
      const p = Math.min((now - t0) / ms, 1)
      audio.volume = from + (to - from) * p
      if (p < 1) requestAnimationFrame(step)
      else resolve(true)
    }
    requestAnimationFrame(step)
  })
}

function playItemSfx(volume = 1) {
  if (!ITEM_SFX) return // enquanto o caminho estiver vazio, não toca nada
  const sfx = new Audio(ITEM_SFX)
  sfx.volume = ITEM_SFX_VOLUME * volume
  sfx.play().catch(() => {})
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

// level: 0 = mudo, 1 = baixo, 2 = alto
function IconVolume({ level }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {level === 0 && <path d="M17 9l5 6M22 9l-5 6" />}
      {level >= 1 && <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />}
      {level >= 2 && <path d="M18.5 7a7 7 0 0 1 0 10" />}
    </svg>
  )
}

function createBeatDetector() {
  const hist = new Float32Array(HISTORY)
  let idx = 0, filled = 0, prev = 0, lastBeat = 0

  // devolve 0 (sem batida) ou a força da batida (0.4 a 1)
  return (energy, now) => {
    let sum = 0
    for (let i = 0; i < filled; i++) sum += hist[i]
    const mean = filled ? sum / filled : 0

    let v = 0
    for (let i = 0; i < filled; i++) v += (hist[i] - mean) ** 2
    const std = filled ? Math.sqrt(v / filled) : 0

    const threshold = Math.max(mean * BEAT_RATIO, mean + BEAT_STD * std)

    let strength = 0
    if (
      filled > 20 &&                       // espera o histórico encher um pouco
      energy > threshold &&
      energy > prev * BEAT_RISE &&
      energy > BEAT_MIN_ENERGY &&
      now - lastBeat > BEAT_COOLDOWN
    ) {
      lastBeat = now
      strength = Math.min(1, Math.max(0.4, (energy / mean - 1) / 0.5))
    }

    hist[idx] = energy
    idx = (idx + 1) % HISTORY
    filled = Math.min(filled + 1, HISTORY)
    prev = energy

    return strength
  }
}

function useBass(audioRef, onEnergy, gainRef, volumeRef) {
  const ctxRef = useRef(null)
  const cbRef = useRef(onEnergy)

  useEffect(() => {
    cbRef.current = onEnergy
  }, [onEnergy])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    let raf

    const start = () => {
      if (ctxRef.current) {
        ctxRef.current.resume()
        return
      }
      const ctx = new AudioContext()
      const source = ctx.createMediaElementSource(audio)

      // volume do usuário: fica DEPOIS do ponto de análise, então mudo/volume baixo
      // não atrapalham as animações
      const userGain = ctx.createGain()
      userGain.gain.value = volumeRef.current
      gainRef.current = userGain
      source.connect(userGain)
      userGain.connect(ctx.destination)

      // ramo só de análise: deixa passar apenas o grave
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 150
      lowpass.Q.value = 0.7

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(lowpass)
      lowpass.connect(analyser)

      const buf = new Float32Array(analyser.fftSize)
      ctxRef.current = ctx

      const loop = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        cbRef.current(Math.sqrt(sum / buf.length)) // energia RMS do grave
        raf = requestAnimationFrame(loop)
      }
      loop()
    }

    audio.addEventListener('play', start)
    return () => {
      audio.removeEventListener('play', start)
      cancelAnimationFrame(raf)
    }
  }, [audioRef, gainRef, volumeRef])
}

function TelaAviso({ onEnter }) {
  const [podeContinuar, setPodeContinuar] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const [fim, setFim] = useState(false)

  // libera o "continuar" depois de um tempo mínimo de leitura
  useEffect(() => {
    const t = setTimeout(() => setPodeContinuar(true), WARNING_MIN_READ_MS)
    return () => clearTimeout(t)
  }, [])

  // qualquer tecla ou clique continua
  useEffect(() => {
    const continuar = (e) => {
      if (e.type === 'keydown') {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      }
      if (!podeContinuar || saindo) return
      setSaindo(true)
      onEnter()
    }
    window.addEventListener('keydown', continuar)
    window.addEventListener('click', continuar)
    return () => {
      window.removeEventListener('keydown', continuar)
      window.removeEventListener('click', continuar)
    }
  }, [podeContinuar, saindo, onEnter])

  if (fim) return null

  return (
    <div
      className={`fixed inset-0 z-50 bg-black text-white flex items-center justify-center px-6 ${saindo ? 'pointer-events-none' : ''}`}
      style={{
        opacity: saindo ? 0 : 1,
        transition: `opacity ${WARNING_FADE_MS}ms ease-in-out ${saindo ? WARNING_TEXT_FADE_MS : 0}ms`,
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && saindo) setFim(true)
      }}
    >
      <div
        className="max-w-2xl flex flex-col items-center gap-6 text-center select-none"
        style={{ opacity: saindo ? 0 : 1, transition: `opacity ${WARNING_TEXT_FADE_MS}ms ease-out` }}
      >
        <h1 className="text-white text-3xl md:text-4xl font-bold tracking-wider">
          WARNING
        </h1>

        <p className="text-lg text-gray-100">
          This website contains <strong>flashing lights</strong> and intense visual effects synchronized with sound.
          These may trigger seizures in people with <strong>photosensitive epilepsy</strong>.
        </p>

        <p
          className="text-gray-400 mt-4"
          style={{ opacity: podeContinuar ? 1 : 0, transition: 'opacity 600ms' }}
        >
          <span className="animate-pulse">Press any key or click to continue</span>
        </p>
      </div>
    </div>
  )
}

function App() {
  const [musicHovering, setMusicHovering] = useState(0)
  const [stage, setStage] = useState('aviso') // 'aviso' -> 'entrando' -> 'pronto'
  const [revealed, setRevealed] = useState(0) // quantas músicas já apareceram
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [volDragging, setVolDragging] = useState(false)

  const itemRefs = useRef([])
  const indexRef = useRef(0)
  const stageRef = useRef('aviso')
  const audioRef = useRef(null)
  const panelRef = useRef(null)
  const cuboRef = useRef(null)
  const bgRef = useRef(null)
  const squareRefs = useRef([])
  const tituloRef = useRef(null)
  const autorRef = useRef(null)
  const beatRef = useRef(createBeatDetector())
  const shakeRef = useRef({ punch: 0, env: 0, glow: 0, lift: 0, last: 0 })
  const runRef = useRef(0)
  const autoplayRef = useRef(false) // só vira true quando o usuário troca de música

  // player
  const gainRef = useRef(null)
  const volumeRef = useRef(DEFAULT_VOLUME)
  const lastVolumeRef = useRef(DEFAULT_VOLUME)
  const trackRef = useRef(null)
  const fillRef = useRef(null)
  const knobRef = useRef(null)
  const curTimeRef = useRef(null)
  const durTimeRef = useRef(null)
  const draggingRef = useRef(false)
  const dragRatioRef = useRef(0)
  const volTrackRef = useRef(null)
  const draggingVolRef = useRef(false)

  const hasTrack = !!musics[musicHovering].src

  const hoverMusic = () => {
    const audio = new Audio('/audio/hover.mp3')
    audio.volume = 0.3 * volumeRef.current
    audio.play().catch(() => {})
  }

  // ===== Aviso -> entrada da lista =====
  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  const handleEnter = useCallback(() => setStage('entrando'), [])

  // faz as músicas aparecerem uma por uma, com o efeito sonoro de cada uma
  useEffect(() => {
    if (stage !== 'entrando') return

    const timers = musics.map((_, i) =>
      setTimeout(() => {
        setRevealed(i + 1)
        playItemSfx(volumeRef.current)
      }, REVEAL_START_MS + i * REVEAL_STEP_MS)
    )
    timers.push(
      setTimeout(() => setStage('pronto'), REVEAL_START_MS + musics.length * REVEAL_STEP_MS + 300)
    )

    return () => timers.forEach(clearTimeout)
  }, [stage])

  // ===== Volume =====
  const applyVolume = useCallback((v) => {
    const vol = clamp01(v)
    volumeRef.current = vol
    if (vol > 0) lastVolumeRef.current = vol
    setVolume(vol)
    const g = gainRef.current
    if (g) g.gain.setTargetAtTime(vol, g.context.currentTime, 0.015)
  }, [])

  const toggleMute = () => {
    if (volumeRef.current > 0) applyVolume(0)
    else applyVolume(lastVolumeRef.current || DEFAULT_VOLUME)
  }

  const volFromPointer = (e) => {
    const rect = volTrackRef.current.getBoundingClientRect()
    return clamp01((e.clientX - rect.left) / rect.width)
  }

  const onVolDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingVolRef.current = true
    setVolDragging(true)
    applyVolume(volFromPointer(e))
  }

  const onVolMove = (e) => {
    if (draggingVolRef.current) applyVolume(volFromPointer(e))
  }

  const onVolEnd = () => {
    draggingVolRef.current = false
    setVolDragging(false)
  }

  // ===== Play / pausa =====
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const sync = () => setIsPlaying(!audio.paused)
    audio.addEventListener('play', sync)
    audio.addEventListener('pause', sync)
    audio.addEventListener('ended', sync)
    return () => {
      audio.removeEventListener('play', sync)
      audio.removeEventListener('pause', sync)
      audio.removeEventListener('ended', sync)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio || !hasTrack) return
    if (audio.paused) {
      audio.volume = MAX_VOL
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  // ===== Linha do tempo =====
  const paintProgress = useCallback((ratio, cur, dur) => {
    const pct = `${(clamp01(ratio) * 100).toFixed(2)}%`
    if (fillRef.current) fillRef.current.style.width = pct
    if (knobRef.current) knobRef.current.style.left = pct
    setText(curTimeRef.current, formatTime(cur))
    setText(durTimeRef.current, formatTime(dur))
  }, [])

  // atualiza a bolinha a cada frame (sem re-render do React)
  useEffect(() => {
    let raf
    const tick = () => {
      const audio = audioRef.current
      if (audio && !draggingRef.current) {
        const has = !!musics[indexRef.current].src
        const dur = has && Number.isFinite(audio.duration) ? audio.duration : 0
        const cur = has ? audio.currentTime : 0
        paintProgress(dur ? cur / dur : 0, cur, dur)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paintProgress])

  const seekRatio = (e) => {
    const rect = trackRef.current.getBoundingClientRect()
    return clamp01((e.clientX - rect.left) / rect.width)
  }

  const onSeekDown = (e) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || !musics[indexRef.current].src) return
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    const r = seekRatio(e)
    dragRatioRef.current = r
    paintProgress(r, r * audio.duration, audio.duration)
  }

  const onSeekMove = (e) => {
    if (!draggingRef.current) return
    const audio = audioRef.current
    const r = seekRatio(e)
    dragRatioRef.current = r
    paintProgress(r, r * audio.duration, audio.duration)
  }

  // o tempo da música só muda quando você solta (clicar = apertar e soltar)
  const onSeekEnd = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const audio = audioRef.current
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = dragRatioRef.current * audio.duration
    }
  }

  // ===== Grave -> animações (sem re-render do React) =====
  const handleBass = useCallback((energy) => {
    const el = cuboRef.current
    if (!el) return

    const s = shakeRef.current
    const now = performance.now()
    const dt = s.last ? now - s.last : 16
    s.last = now

    const strength = beatRef.current(energy, now)

    // ignora batidas durante o fade (o volume está subindo/descendo)
    const audio = audioRef.current
    const stable = audio && audio.volume >= MAX_VOL * 0.9
    if (strength > 0 && stable) {
      s.punch = Math.max(s.punch, strength)
      s.env = Math.max(s.env, strength)
    }

    s.punch *= Math.exp(-dt / SHAKE_DECAY_MS)
    s.env *= Math.exp(-dt / BG_DECAY_MS)
    const p = s.punch < 0.01 ? 0 : s.punch

    // subida suavizada: sobe rápido na batida, desce devagar sem batida
    const liftTau = s.env > s.lift ? LIFT_ATTACK_MS : LIFT_RELEASE_MS
    s.lift += (s.env - s.lift) * (1 - Math.exp(-dt / liftTau))
    const lift = s.lift < 0.005 ? 0 : s.lift

    // controles do player sobem pela variável --lift (ver liftStyle)
    if (panelRef.current) panelRef.current.style.setProperty('--lift', lift.toFixed(3))

    // cubo: tremida + subida
    const rot = Math.sin(now / 25) * SHAKE_ROT * p
    const x = (Math.random() - 0.5) * 2 * SHAKE_MOVE * p
    const y = (Math.random() - 0.5) * 2 * SHAKE_MOVE * p
    el.style.transform = `translate(${x}px, ${y - lift * LIFT.cubo}px) rotate(${rot}deg)`

    // título e autor: só subida
    if (tituloRef.current) {
      tituloRef.current.style.transform = lift
        ? `translateY(${(-lift * LIFT.titulo).toFixed(2)}px)`
        : ''
    }
    if (autorRef.current) {
      autorRef.current.style.transform = lift
        ? `translateY(${(-lift * LIFT.autor).toFixed(2)}px)`
        : ''
    }

    // brilho suavizado (0 a 1): alimenta o fundo e os quadrados
    const tau = s.env > s.glow ? BG_ATTACK_MS : BG_RELEASE_MS
    s.glow += (s.env - s.glow) * (1 - Math.exp(-dt / tau))
    const g = Math.min(1, s.glow * BG_GAIN)

    if (bgRef.current) {
      bgRef.current.style.opacity = g < 0.005 ? '0' : g.toFixed(3)
    }

    // quadrados gigantes crescem com a batida
    for (let i = 0; i < SQUARES.length; i++) {
      const sq = squareRefs.current[i]
      if (sq) sq.style.scale = (1 + g * SQUARES[i].grow).toFixed(3)
    }
  }, [])

  useBass(audioRef, handleBass, gainRef, volumeRef)

  // ===== Toca a música do item selecionado (mouse ou setas) e para nos outros =====
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const src = musics[musicHovering].src

    // seleção inicial: só carrega a música, pausada, até o usuário apertar play
    if (!autoplayRef.current) {
      if (src && !audio.src.endsWith(src)) audio.src = src
      audio.volume = MAX_VOL
      return
    }

    const id = ++runRef.current
    const stale = () => id !== runRef.current // o usuário já passou pra outro item

    const run = async () => {
      // 1. fade out do que estiver tocando
      if (!audio.paused) {
        const done = await fade(audio, 0, FADE_OUT_MS)
        if (!done || stale()) return
        audio.pause()
      }

      // 2. se o novo item não tem música, termina aqui
      if (!src) return

      // 3. troca e fade in
      if (!audio.src.endsWith(src)) audio.src = src
      audio.currentTime = 0
      audio.volume = 0
      try {
        await audio.play()
      } catch {
        return // navegador bloqueou antes da 1ª interação
      }
      if (stale()) return
      fade(audio, MAX_VOL, FADE_IN_MS)
    }

    run()
  }, [musicHovering])

  useEffect(() => {
    indexRef.current = musicHovering
  }, [musicHovering])

  // ===== Setas do teclado =====
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (stageRef.current !== 'pronto') return // ignora enquanto o aviso/entrada está rolando
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()

      const current = indexRef.current
      const next =
        e.key === 'ArrowDown'
          ? Math.min(current + 1, musics.length - 1)
          : Math.max(current - 1, 0)

      if (next !== current) {
        hoverMusic()
        autoplayRef.current = true
        setMusicHovering(next)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    itemRefs.current[musicHovering]?.scrollIntoView({ block: 'nearest' })
  }, [musicHovering])

  const volumeLevel = volume === 0 ? 0 : volume < 0.5 ? 1 : 2

  return (
    <>
      <TelaAviso onEnter={handleEnter} />

      <audio ref={audioRef} loop preload="auto" />

      <section className="relative w-screen h-screen bg-linear-to-bl from-blue-950 to-violet-950 !p-5">
        {/* degradê claro: a opacidade sobe nas batidas */}
        <div
          ref={bgRef}
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-linear-to-bl from-blue-900 to-violet-900 opacity-0 will-change-[opacity]"
        />

        {/* quadrados gigantes: orbitam o centro da tela, giram sozinhos e crescem com a batida */}
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          {SQUARES.map((q, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 w-0 h-0 animate-spin"
              style={{
                rotate: `${q.angle}deg`,
                animationDuration: `${q.orbit}s`,
                animationDirection: q.reverse ? 'reverse' : 'normal',
              }}
            >
              <div
                ref={(el) => (squareRefs.current[i] = el)}
                className="absolute bg-black/20 animate-spin will-change-transform"
                style={{
                  width: q.size,
                  height: q.size,
                  left: q.radius,
                  top: 0,
                  translate: '-50% -50%',
                  animationDuration: `${q.spin}s`,
                  animationDirection: q.reverse ? 'normal' : 'reverse',
                }}
              />
            </div>
          ))}
        </div>

        <div className="relative w-full h-full border-1 border-violet-300 bg-transparent shadow-2xl px-10 py-10 flex flex-row justify-evenly items-center">
          {/* coluna da lista */}
          <div className="w-full h-full flex flex-col items-center jusitfy-center">
            {musics.map((music, i) => {
              const shown = i < revealed
              return (
                <div
                  key={music.title}
                  ref={(el) => (itemRefs.current[i] = el)}
                  className={`w-[90%] h-[50px] m-1 select-none border-blue-200 border py-2 px-5 text-white shadow-xl flex flex-row justify-between items-center gap-4
                    ${i === musicHovering ? 'bg-linear-to-bl from-blue-900 to-violet-900' : 'bg-linear-to-bl from-blue-900/30 to-violet-900/30'}`}
                  style={{
                    opacity: shown ? 1 : 0,
                    transform: shown ? 'none' : 'translateX(-30px)',
                    transition: 'opacity 350ms ease-out, transform 350ms ease-out',
                    pointerEvents: shown ? 'auto' : 'none',
                  }}
                  onMouseEnter={() => {
                    if (i !== musicHovering) {
                      hoverMusic()
                      autoplayRef.current = true
                    }
                    setMusicHovering(i)
                  }}
                >
                  <h1 className="flex-1 min-w-0 truncate">{music.title}</h1>
                  <h1 className="flex-1 min-w-0 truncate text-left">{music.author}</h1>
                  <h1 className="w-16 shrink-0 text-right">{music.time}</h1>
                </div>
              )
            })}
          </div>

          {/* painel do cubo */}
          <div
            ref={panelRef}
            className="w-[70%] h-full border-violet-300 bg-linear-to-bl from-blue-900/30 to-violet-900/30 border flex flex-col px-5 items-center justify-center gap-2 select-none shadow-xl"
          >
            <div className="w-[400px] h-[320px] border border-transparent flex items-center justify-center">
              <div
                id="cubo"
                ref={cuboRef}
                className="w-[300px] h-[300px] border border-violet-300 will-change-transform overflow-hidden shadow-xl"
              >
                {musics[musicHovering].img && (
                  <img
                    className="w-full h-full object-cover"
                    src={musics[musicHovering].img}
                    alt={musics[musicHovering].title}
                  />
                )}
              </div>
            </div>

            <h1 ref={tituloRef} className="text-gray-300 text-3xl will-change-transform font-semibold">
              {musics[musicHovering].title}
            </h1>

            <h1 ref={autorRef} className="text-gray-400 text-2xl will-change-transform font-semibold">
              {musics[musicHovering].author}
            </h1>

            {/* linha do tempo: a área clicável fica parada e só o visual sobe com a batida */}
            <div
              className={`w-[80%] max-w-[520px] mt-2 pt-3 pb-4 cursor-pointer touch-none ${hasTrack ? '' : 'opacity-40 pointer-events-none'}`}
              onPointerDown={onSeekDown}
              onPointerMove={onSeekMove}
              onPointerUp={onSeekEnd}
              onPointerCancel={onSeekEnd}
            >
              <div style={liftStyle(LIFT.barra)} className="will-change-transform">
                <div className="h-4 flex items-center">
                  <div ref={trackRef} className="relative w-full h-1.5 rounded-full bg-white/20">
                    <div
                      ref={fillRef}
                      className="absolute left-0 top-0 h-full rounded-full bg-violet-300"
                      style={{ width: '0%' }}
                    />
                    <div
                      ref={knobRef}
                      className="absolute top-1/2 w-4 h-4 rounded-full bg-white shadow-lg"
                      style={{ left: '0%', translate: '-50% -50%' }}
                    />
                  </div>
                </div>
                <div className="flex justify-between mt-1 text-sm text-gray-400">
                  <span ref={curTimeRef}>0:00</span>
                  <span ref={durTimeRef}>0:00</span>
                </div>
              </div>
            </div>

            {/* botões */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!hasTrack}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="group pb-4 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <span
                  style={liftStyle(LIFT.botoes)}
                  className="will-change-transform flex items-center justify-center w-12 h-12 rounded-full border border-violet-300 bg-white/10 text-white transition-colors group-hover:bg-white/25"
                >
                  {isPlaying ? <IconPause /> : <IconPlay />}
                </span>
              </button>

              <div className="group/vol relative">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                  className="group pb-4 cursor-pointer"
                >
                  <span
                    style={liftStyle(LIFT.botoes)}
                    className="will-change-transform flex items-center justify-center w-12 h-12 rounded-full border border-violet-300 bg-white/10 text-white transition-colors group-hover:bg-white/25"
                  >
                    <IconVolume level={volumeLevel} />
                  </span>
                </button>

                {/* slider de volume: aparece ao passar o mouse (ou enquanto arrasta) */}
                <div
                  className={`absolute left-full top-0 transition-opacity duration-200 ${
                    volDragging
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none group-hover/vol:opacity-100 group-hover/vol:pointer-events-auto'
                  }`}
                >
                  <div
                    className="w-36 h-16 pb-4 px-3 flex items-center cursor-pointer touch-none"
                    onPointerDown={onVolDown}
                    onPointerMove={onVolMove}
                    onPointerUp={onVolEnd}
                    onPointerCancel={onVolEnd}
                  >
                    <div
                      ref={volTrackRef}
                      style={liftStyle(LIFT.botoes)}
                      className="will-change-transform relative w-full h-1.5 rounded-full bg-white/20"
                    >
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-violet-300"
                        style={{ width: `${volume * 100}%` }}
                      />
                      <div
                        className="absolute top-1/2 w-4 h-4 rounded-full bg-white shadow-lg"
                        style={{ left: `${volume * 100}%`, translate: '-50% -50%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default App