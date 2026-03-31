import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect – a styled dropdown replacement for native <select>.
 *
 * Props:
 *  - options: [{ value, label }]       – items to display
 *  - value: string                     – currently selected value
 *  - onChange: (value) => void          – called when user picks an option
 *  - placeholder: string               – shown when nothing is selected
 *  - required: boolean                 – for form validation (hidden native input)
 *  - className: string                 – extra classes on the trigger button
 *  - disabled: boolean
 *  - dropUp: boolean                   – force dropdown to open upward
 */
const CustomSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  required = false,
  className = '',
  disabled = false,
  dropUp: forceDropUp = false,
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      const clickedTrigger = containerRef.current?.contains(e.target);
      const clickedMenu = listRef.current?.contains(e.target);

      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onEscape = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updateMenuPosition = () => {
      const trigger = containerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableAbove = rect.top - viewportPadding;
      const shouldDropUp =
        forceDropUp || (availableBelow < 220 && availableAbove > availableBelow);
      const availableSpace = shouldDropUp ? availableAbove : availableBelow;
      const maxHeight = Math.max(120, Math.min(240, availableSpace));

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        zIndex: 250,
        top: shouldDropUp ? 'auto' : rect.bottom + gap,
        bottom: shouldDropUp ? window.innerHeight - rect.top + gap : 'auto',
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, forceDropUp, options.length]);

  // Scroll selected item into view when opened
  useEffect(() => {
    if (open && listRef.current && value) {
      const active = listRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  }, [open, value]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden native input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          value={value || ''}
          required={required}
          onChange={() => {}}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`input-field flex items-center justify-between gap-2 text-left ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${open ? 'ring-2 ring-indigo-400 border-transparent' : ''} ${className}`}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-indigo-500' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {open &&
        menuStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-scale-in"
            style={menuStyle}
          >
            {options.map((opt) => {
              const isActive = String(opt.value) === String(value);
              return (
                <div
                  key={opt.value}
                  data-active={isActive}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors duration-100 ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />}
                </div>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">No options</div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default CustomSelect;
