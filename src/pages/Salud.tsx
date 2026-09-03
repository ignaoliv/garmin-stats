import Sleep from './Sleep'
import StepsCard from '../components/StepsCard'

/**
 * Sleep and daily movement on one page.
 *
 * They were two tabs, which meant a click to compare how you slept against how
 * much you moved — the two halves of the same question. What the device can and
 * cannot measure moved to the rail: it is reference, not a daily read.
 */
export default function Salud() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 pt-7 pb-2">
        <h1 className="title-page">Salud</h1>
        <p className="label-plain mt-2">Sueño, movimiento diario y recuperación</p>
      </div>

      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-6 page-in">
        <StepsCard windowDays={30} />
      </div>

      <Sleep />
    </div>
  )
}
