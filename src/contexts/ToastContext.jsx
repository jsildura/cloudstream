import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, options = {}) => {
        const id = Date.now() + Math.random();
        const toast = {
            id,
            message,
            type: options.type || 'info', // info, success, error, playing
            duration: options.duration || 4000,
            icon: options.icon || null,
        };

        setToasts(prev => [...prev, toast]);

        // Auto-remove after duration
        if (toast.duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, toast.duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    // Convenience methods
    const showSuccess = useCallback((message, options = {}) => {
        return addToast(message, { ...options, type: 'success' });
    }, [addToast]);

    const showError = useCallback((message, options = {}) => {
        return addToast(message, { ...options, type: 'error' });
    }, [addToast]);

    const showNowPlaying = useCallback((title, options = {}) => {
        return addToast(`Now Playing: ${title}`, { ...options, type: 'playing', duration: 5000 });
    }, [addToast]);

    const showServerChanged = useCallback((serverName, options = {}) => {
        return addToast(`Server changed to ${serverName}`, { ...options, type: 'info', duration: 3000 });
    }, [addToast]);

    return (
        <ToastContext.Provider value={{
            toasts,
            addToast,
            removeToast,
            showSuccess,
            showError,
            showNowPlaying,
            showServerChanged
        }}>
            {children}
        </ToastContext.Provider>
    );
};

export default ToastContext;
