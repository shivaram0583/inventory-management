import React from 'react';
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
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  hideClose = false,
  confirmDisabled = false,
  hideCancel = false
}) => {
  if (!isOpen) return null;

  const iconBgMap = {
    info:    'linear-gradient(135deg,#3b82f6,#6366f1)',
    success: 'linear-gradient(135deg,#10b981,#059669)',
    warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
    error:   'linear-gradient(135deg,#ef4444,#dc2626)',
  };

  const iconMap = {
    info:    <Info className="h-5 w-5 text-white" />,
    success: <CheckCircle className="h-5 w-5 text-white" />,
    warning: <AlertTriangle className="h-5 w-5 text-white" />,
    error:   <AlertTriangle className="h-5 w-5 text-white" />,
  };

  const confirmGradientMap = {
    info:    'linear-gradient(135deg,#3b82f6,#6366f1)',
    success: 'linear-gradient(135deg,#10b981,#059669)',
    warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
    error:   'linear-gradient(135deg,#ef4444,#dc2626)',
  };

  const icon     = type ? iconMap[type]            : null;
  const iconBg   = type ? iconBgMap[type]          : iconBgMap.info;
  const confirmG = type ? confirmGradientMap[type] : confirmGradientMap.info;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
         style={{background:'rgba(15,23,42,0.55)',backdropFilter:'blur(4px)'}}
         onClick={!hideClose ? onClose : undefined}>

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl text-left shadow-2xl w-full max-w-lg animate-scale-in border border-gray-100 flex flex-col"
           style={{maxHeight:'85vh'}}
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-md flex-shrink-0"
                     style={{background: iconBg}}>
                  {icon}
                </div>
              )}
              <h3 className="text-base font-bold text-gray-900">{title}</h3>
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-150"
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
          <div className="px-6 py-4 flex justify-end gap-2.5 border-t border-gray-100 flex-shrink-0"
               style={{background:'linear-gradient(90deg,#f8faff,#f5f3ff)'}}>
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
              style={{background: confirmG}}
            >
              {confirmText || 'OK'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
