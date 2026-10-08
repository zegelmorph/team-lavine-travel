import { Droplets } from 'lucide-react'
import { formatDay } from '@/lib/dates'
import { describeWeather, formatTemp, useTempUnit } from '@/lib/weather'
import type { WeatherDay } from '@/lib/types'
import { cn } from '@/lib/utils'

/** One tile per day; "typical" days (beyond the forecast window) are muted and labeled. */
export function WeatherStrip({ days, hint }: { days: WeatherDay[]; hint?: string | null }) {
  const unit = useTempUnit()
  if (days.length === 0) return hint ? <p className="mt-3 text-xs text-slate-400">{hint}</p> : null
  const anyTypical = days.some((d) => d.source === 'typical')

  return (
    <div className="mt-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const { icon: Icon, label } = describeWeather(d.weather_code)
          return (
            <div
              key={d.date}
              title={`${label}${d.source === 'typical' ? ' (typical for this time of year)' : ''}`}
              className={cn(
                'flex w-[4.5rem] shrink-0 flex-col items-center rounded-xl border px-1.5 py-2 text-center',
                d.source === 'typical' ? 'border-dashed border-slate-200 bg-slate-50/60' : 'border-slate-200/80 bg-white',
              )}
            >
              <span className="text-[11px] font-medium text-slate-500">{formatDay(d.date, 'EEE d')}</span>
              <Icon className={cn('my-1 h-5 w-5', d.source === 'typical' ? 'text-slate-400' : 'text-brand-600')} />
              <span className="num text-xs font-semibold text-slate-800">{formatTemp(d.temp_max_c, unit)}</span>
              <span className="num text-[11px] text-slate-400">{formatTemp(d.temp_min_c, unit)}</span>
              {d.precip_prob != null && d.precip_prob >= 20 && (
                <span className="num mt-0.5 flex items-center gap-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                  <Droplets className="h-2.5 w-2.5" />
                  {d.precip_prob}%
                </span>
              )}
            </div>
          )
        })}
      </div>
      {anyTypical && (
        <p className="mt-1 text-[11px] text-slate-400">
          Dashed days are typical weather from recent years; the forecast fills in about two weeks out.
        </p>
      )}
    </div>
  )
}
