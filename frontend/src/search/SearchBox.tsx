import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'
import { searchPlaces } from '../api/places'
import type { Place } from '../api/types'
import { goToPlace, PLACE_KIND_LABEL } from './goToPlace'
import './search.css'

export function SearchBox() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const listId = `${id}-list`
  const optionId = (i: number) => `${id}-opt-${i}`

  const text = query.trim()
  const items = useMemo(() => searchPlaces(text, 8), [text])
  const empty = text !== '' && items.length === 0
  const showList = open && (items.length > 0 || empty)

  // Keep the highlighted option in view.
  useEffect(() => {
    if (active < 0) return
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id])

  function pick(place: Place) {
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
        const target = items[active] ?? (text ? items[0] : undefined)
        if (target) {
          e.preventDefault()
          pick(target)
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

  return (
    <div className="search" role="search">
      <div className="search__field">
        <span className="search__icon" aria-hidden>
          <Search size={16} strokeWidth={1.5} />
        </span>
        <input
          ref={inputRef}
          className="search__input"
          type="text"
          role="combobox"
          aria-label="Search places"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          placeholder="Crater, volcano, landing site"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setActive(-1)
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            aria-label="Clear"
            title="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('')
              setActive(-1)
              inputRef.current?.focus()
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="search__popover" hidden={!showList}>
        <ul id={listId} className="search__list" role="listbox" aria-label="Places">
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
              <span className="search__meta">{PLACE_KIND_LABEL[p.kind]}</span>
            </li>
          ))}
        </ul>
        {empty && <p className="search__note">Nothing found. Try “Olympus” or “landing”</p>}
      </div>
      <span className="sr-only" aria-live="polite">
        {open ? (items.length ? `${items.length} found` : text ? 'Nothing found' : '') : ''}
      </span>
    </div>
  )
}
