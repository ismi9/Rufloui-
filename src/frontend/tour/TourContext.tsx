import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { driver, type Driver, type Config } from 'driver.js'
import { buildTourSteps, type TourStep } from './tourSteps'
import './tourStyles.css'

const STORAGE_KEY = 'rufloui_tour_v1'
const NAV_DELAY = 600

interface TourContextType {
  startTour: () => void
  isTourActive: boolean
  hasCompletedTour: boolean
}

const TourContext = createContext<TourContextType | undefined>(undefined)

const fallback: TourContextType = {
  startTour: () => {},
  isTourActive: false,
  hasCompletedTour: true,
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const [isTourActive, setIsTourActive] = useState(false)
  const [hasCompletedTour] = useState(() => localStorage.getItem(STORAGE_KEY) !== null)
  const driverRef = useRef<Driver | null>(null)
  const stepsRef = useRef<TourStep[]>([])
  const activeIndexRef = useRef(0)
  const autoStartedRef = useRef(false)

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  }, [])

  const destroyDriver = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy()
      driverRef.current = null
    }
    setIsTourActive(false)
  }, [])

  const navigateAndRun = useCallback((route: string, cb: () => void) => {
    if (window.location.pathname === route) {
      cb()
    } else {
      navigate(route)
      setTimeout(cb, NAV_DELAY)
    }
  }, [navigate])

  const startTour = useCallback(() => {
    const steps = buildTourSteps()
    stepsRef.current = steps
    activeIndexRef.current = 0

    const totalSteps = steps.length

    const driverConfig: Config = {
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.7,
      stagePadding: 8,
      stageRadius: 8,
      popoverOffset: 12,
      showButtons: ['next', 'previous', 'close'],
      progressText: '{{current}} / {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Previous',
      doneBtnText: 'Finish',

      steps: steps.map(({ route: _route, ...rest }) => rest),

      onNextClick: () => {
        const nextIndex = activeIndexRef.current + 1
        if (nextIndex >= totalSteps) {
          markCompleted()
          destroyDriver()
          return
        }

        const nextStep = steps[nextIndex]
        if (nextStep.route) {
          navigateAndRun(nextStep.route, () => {
            activeIndexRef.current = nextIndex
            driverRef.current?.moveTo(nextIndex)
          })
        } else {
          activeIndexRef.current = nextIndex
          driverRef.current?.moveNext()
        }
      },

      onPrevClick: () => {
        const prevIndex = activeIndexRef.current - 1
        if (prevIndex < 0) return

        const prevStep = steps[prevIndex]
        if (prevStep.route) {
          navigateAndRun(prevStep.route, () => {
            activeIndexRef.current = prevIndex
            driverRef.current?.moveTo(prevIndex)
          })
        } else {
          activeIndexRef.current = prevIndex
          driverRef.current?.movePrevious()
        }
      },

      onDestroyStarted: () => {
        markCompleted()
        destroyDriver()
      },
    }

    const firstRouteStep = steps.find(s => s.route)
    const startRoute = firstRouteStep?.route || '/'

    navigateAndRun(startRoute, () => {
      const d = driver(driverConfig)
      driverRef.current = d
      setIsTourActive(true)
      d.drive()
    })
  }, [navigateAndRun, markCompleted, destroyDriver])

  // Auto-start for new users
  useEffect(() => {
    if (!autoStartedRef.current && localStorage.getItem(STORAGE_KEY) === null) {
      autoStartedRef.current = true
      const timer = setTimeout(startTour, 1500)
      return () => clearTimeout(timer)
    }
  }, [startTour])

  useEffect(() => {
    return () => { driverRef.current?.destroy() }
  }, [])

  const value = useMemo(() => ({
    startTour,
    isTourActive,
    hasCompletedTour,
  }), [startTour, isTourActive, hasCompletedTour])

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  return context ?? fallback
}
