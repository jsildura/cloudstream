import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./contexts/ToastContext";
import { AuthProvider } from "./contexts/AuthContext";
import { AdFreeProvider } from "./contexts/AdFreeContext";
import { ProfileProvider } from "./contexts/ProfileContext";
import { ProfileDataProvider } from "./contexts/ProfileDataContext";
import App from './App.jsx';
import './styles/globals.css';
import './styles/pages.css';
import './styles/components.css';

// Last-resort global error and unhandled promise rejection logging
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[StreamFlix] Unhandled Promise Rejection:', event.reason);
    });
    window.addEventListener('error', (event) => {
        console.error('[StreamFlix] Uncaught Global Error:', event.error || event.message);
    });
}

createRoot(document.getElementById('root')).render(
    <ErrorBoundary message="We're having trouble loading StreamFlix. Please refresh or try again.">
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <AdFreeProvider>
                        <ProfileProvider>
                            <ProfileDataProvider>
                                <App />
                            </ProfileDataProvider>
                        </ProfileProvider>
                    </AdFreeProvider>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    </ErrorBoundary>
);