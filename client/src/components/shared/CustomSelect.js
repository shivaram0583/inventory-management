import React, { useState, useRef, useEffect } from 'react';
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
  const [dropUp, setDropUp] = useState(forceDropUp);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  // Determine direction (up/down) based on available space
  useEffect(() => {
    if (!open || forceDropUp) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 220);
  }, [open, forceDropUp]);

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
      {open && (
        <div
          ref={listRef}
          className={`absolute z-[200] left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-scale-in ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ maxHeight: '200px', overflowY: 'auto', scrollbarWidth: 'thin' }}
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
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
