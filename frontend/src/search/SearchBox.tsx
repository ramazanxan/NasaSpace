import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Place } from '../api/types'
import { useApp } from '../store/useApp'
import { fmt } from '../ui/format'
import { goToPlace, PLACE_KIND_LABEL } from './goToPlace'
import './search.css'

const DEBOUNCE_MS = 250
/** How many places to suggest on focus with an empty query. */
const EMPTY_LIMIT = 5

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function SearchBox() {
  const regions = useApp((s) => s.regions)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Place[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  /** Query text the current `items` belong to; differs from `query` while a search is pending. */
  const [resultsFor, setResultsFor] = useState<string | null>(null)
  /** Enter pressed before fresh results arrived: open the first one when they land. */
  const pendingEnter = useRef(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const listId = `${id}-list`
  const optionId = (i: number) => `${id}-opt-${i}`

  // Debounced fetch; stale requests are aborted and their results ignored.
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    const text = query.trim()
    const timer = window.setTimeout(
      () => {
        setStatus('loading')
        api.places(text, ctrl.signal).then(
          (list) => {
            if (ctrl.signal.aborted) return
            if (pendingEnter.current) {
              pendingEnter.current = false
              if (text && list[0]) {
                goToPlace(list[0])
                setQuery('')
                setOpen(false)
                setActive(-1)
                return
              }
            }
            setItems(text ? list : list.slice(0, EMPTY_LIMIT))
            setResultsFor(text)
            setStatus('ready')
            setError(null)
            setActive(-1)
          },
          (e: unknown) => {
            if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return
            pendingEnter.current = false
            setItems([])
            setResultsFor(text)
            setStatus('error')
            setError(e instanceof ApiError ? e.message : 'Поиск не сработал. Попробуйте ещё раз')
          },
        )
      },
      text ? DEBOUNCE_MS : 0,
    )
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, open])

  // Keep the highlighted option in view.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id])

  const regionName = (rid: string) => regions.find((r) => r.id === rid)?.name ?? ''

  function pick(place: Place) {
    pendingEnter.current = false
    goToPlace(place)
    setQuery('')
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else if (items.length) setActive((i) => (i + 1) % items.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) setOpen(true)
        else if (items.length) setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
        break
      case 'Enter': {
        if (!open) return
        const text = query.trim()
        // An option the user highlighted is always fair to open, even mid-search.
        const highlighted = items[active]
        if (highlighted) {
          e.preventDefault()
          pick(highlighted)
        } else if (text && resultsFor !== text) {
          e.preventDefault()
          pendingEnter.current = true
        } else if (text && items[0]) {
          e.preventDefault()
          pick(items[0])
        }
        break
      }
      case 'Escape':
        if (open) {
          e.preventDefault()
          setOpen(false)
          setActive(-1)
        } else if (query) {
          e.preventDefault()
          setQuery('')
        }
        break
    }
  }

  const empty = status === 'ready' && items.length === 0 && query.trim() !== '' && resultsFor === query.trim()
  const searching = status === 'loading' && items.length === 0 && query.trim() !== ''
  const showList = open && (items.length > 0 || empty || searching || status === 'error')

  return (
    <div className="search" role="search">
      <div className="search__field">
        <span className="search__icon" aria-hidden>
          {status === 'loading' ? (
            <LoaderCircle size={16} strokeWidth={1.5} className="search__spin" />
          ) : (
            <Search size={16} strokeWidth={1.5} />
          )}
        </span>
        <input
          ref={inputRef}
          className="search__input"
          type="text"
          role="combobox"
          aria-label="Поиск мест"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          placeholder="Кратер, гора, место посадки"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            pendingEnter.current = false
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            pendingEnter.current = false
            setOpen(false)
            setActive(-1)
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            aria-label="Очистить"
            title="Очистить"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="search__popover" hidden={!showList}>
        <ul
          ref={listRef}
          id={listId}
          className="search__list"
          role="listbox"
          aria-label="Места"
          aria-busy={status === 'loading'}
        >
          {items.map((p, i) => (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="search__option"
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => pick(p)}
            >
              <span className="search__name">{p.name}</span>
              <span className="search__meta">
                {PLACE_KIND_LABEL[p.kind]}
                {regionName(p.regionId) && <> · {regionName(p.regionId)}</>}
              </span>
              <span className="search__height">
                {fmt.height(p.height)}
                <span className="search__unit"> м</span>
              </span>
            </li>
          ))}
        </ul>
        {empty && <p className="search__note">Ничего не нашлось. Попробуйте «Гейл» или «дельта»</p>}
        {status === 'error' && error && (
          <p className="search__note search__note--error" role="alert">
            {error}
          </p>
        )}
        {searching && <p className="search__note">Ищем…</p>}
      </div>
      <span className="sr-only" aria-live="polite">
        {status === 'ready' && open ? (items.length ? `Найдено: ${items.length}` : 'Ничего не нашлось') : ''}
      </span>
    </div>
  )
}
