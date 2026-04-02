import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

/**
 * Reusable Modal component for alerts, confirmations, and custom content.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - title: string
 *  - children: ReactNode (custom body)
 *  - type: 'info' | 'success' | 'warning' | 'error' (optional icon/color)
 *  - confirmText: string (shows confirm button)
 *  - cancelText: string (shows cancel button, default 'Cancel')
 *  - onConfirm: () => void
 *  - hideClose: boolean (hide X button)
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  type,
  theme = 'neutral',
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  hideClose = false,
  confirmDisabled = false,
  hideCancel = false
}) => {
  if (!isOpen) return null;

  const iconMap = {
    info:    <Info className="h-5 w-5 text-white" />,
    success: <CheckCircle className="h-5 w-5 text-white" />,
    warning: <AlertTriangle className="h-5 w-5 text-white" />,
    error:   <AlertTriangle className="h-5 w-5 text-white" />,
  };

  const themeMap = {
    neutral: {
      borderClass: 'border-gray-100',
      headerBorderClass: 'border-gray-100',
      footerBorderClass: 'border-gray-100',
      headerBg: 'linear-gradient(135deg,#f8fafc,#f5f3ff)',
      footerBg: 'linear-gradient(90deg,#f8faff,#f5f3ff)',
      iconBg: 'linear-gradient(135deg,#3b82f6,#6366f1)',
      confirmBg: 'linear-gradient(135deg,#3b82f6,#6366f1)',
      closeClass: 'text-gray-400 hover:text-gray-600 hover:bg-white/80'
    },
    inventory: {
      borderClass: 'border-sky-100',
      headerBorderClass: 'border-sky-100',
      footerBorderClass: 'border-sky-100',
      headerBg: 'linear-gradient(135deg,#e0f2fe,#cffafe)',
      footerBg: 'linear-gradient(90deg,#f0f9ff,#ecfeff)',
      iconBg: 'linear-gradient(135deg,#0ea5e9,#0891b2)',
      confirmBg: 'linear-gradient(135deg,#0ea5e9,#0284c7)',
      closeClass: 'text-sky-400 hover:text-sky-700 hover:bg-white/80'
    },
    purchases: {
      borderClass: 'border-indigo-100',
      headerBorderClass: 'border-indigo-100',
      footerBorderClass: 'border-indigo-100',
      headerBg: 'linear-gradient(135deg,#eff6ff,#eef2ff)',
      footerBg: 'linear-gradient(90deg,#f8faff,#f5f3ff)',
      iconBg: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      confirmBg: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      closeClass: 'text-indigo-300 hover:text-indigo-700 hover:bg-white/80'
    },
    sales: {
      borderClass: 'border-emerald-100',
      headerBorderClass: 'border-emerald-100',
      footerBorderClass: 'border-emerald-100',
      headerBg: 'linear-gradient(135deg,#ecfdf5,#d1fae5)',
      footerBg: 'linear-gradient(90deg,#f0fdf4,#dcfce7)',
      iconBg: 'linear-gradient(135deg,#10b981,#059669)',
      confirmBg: 'linear-gradient(135deg,#10b981,#059669)',
      closeClass: 'text-emerald-400 hover:text-emerald-700 hover:bg-white/80'
    }
  };

  const activeTheme = themeMap[theme] || themeMap.neutral;
  const typeAccentMap = {
    info: 'linear-gradient(135deg,#3b82f6,#6366f1)',
    success: 'linear-gradient(135deg,#10b981,#059669)',
    warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
    error: 'linear-gradient(135deg,#ef4444,#dc2626)'
  };
  const icon = type ? iconMap[type] : iconMap.info;
  const neutralAccent = typeAccentMap[type] || typeAccentMap.info;
  const iconBackground = theme === 'neutral' ? neutralAccent : activeTheme.iconBg;
  const confirmBackground = theme === 'neutral' ? neutralAccent : activeTheme.confirmBg;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
         style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}
         onClick={!hideClose ? onClose : undefined}>

      {/* Modal card */}
      <div className={`relative bg-white rounded-2xl text-left shadow-2xl w-full max-w-lg animate-scale-in border flex flex-col ${activeTheme.borderClass}`}
           style={{maxHeight:'85vh'}}
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div
          className={`px-6 pt-5 pb-3 border-b flex-shrink-0 ${activeTheme.headerBorderClass}`}
          style={{ background: activeTheme.headerBg }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
                style={{background: iconBackground}}
              >
                {icon}
              </div>
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-150 ${activeTheme.closeClass}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm text-gray-600 leading-relaxed" style={{scrollbarWidth:'thin'}}>
          {children}
        </div>

        {/* Footer buttons */}
        {(confirmText || !hideClose) && (
          <div
            className={`px-6 py-4 flex justify-end gap-2.5 border-t flex-shrink-0 ${activeTheme.footerBorderClass}`}
            style={{background: activeTheme.footerBg}}
          >
            {onConfirm && !hideCancel && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all duration-150 focus:outline-none"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => { if (onConfirm) onConfirm(); onClose(); }}
              disabled={confirmDisabled}
              className="px-4 py-2 text-sm font-semibold text-white rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              style={{background: confirmBackground}}
            >
              {confirmText || 'OK'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

export default Modal;
