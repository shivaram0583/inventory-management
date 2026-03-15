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
  hideClose = false
}) => {
  if (!isOpen) return null;

  const iconMap = {
    info: <Info className="h-6 w-6 text-blue-500" />,
    success: <CheckCircle className="h-6 w-6 text-green-500" />,
    warning: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
    error: <AlertTriangle className="h-6 w-6 text-red-500" />
  };

  const confirmColorMap = {
    info: 'bg-blue-600 hover:bg-blue-700',
    success: 'bg-green-600 hover:bg-green-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    error: 'bg-red-600 hover:bg-red-700'
  };

  const icon = type ? iconMap[type] : null;
  const confirmColor = type ? confirmColorMap[type] : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={!hideClose ? onClose : undefined} />

        <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-lg sm:w-full">
          <div className="bg-white px-6 pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {icon}
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              </div>
              {!hideClose && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="mt-4 text-sm text-gray-600">
              {children}
            </div>
          </div>

          {(confirmText || !hideClose) && (
            <div className="bg-gray-50 px-6 py-3 flex justify-end space-x-3">
              {onConfirm && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={() => {
                  if (onConfirm) {
                    onConfirm();
                  }
                  onClose();
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none ${confirmColor}`}
              >
                {confirmText || 'OK'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
