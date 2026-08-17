import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./contexts/ToastContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileProvider } from "./contexts/ProfileContext";
import { ProfileDataProvider } from "./contexts/ProfileDataContext";
import App from './App.jsx'
import './styles/globals.css'
import './styles/pages.css'
import './styles/components.css'

createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <ToastProvider>
            <AuthProvider>
                <ProfileProvider>
                    <ProfileDataProvider>
                        <App />
                    </ProfileDataProvider>
                </ProfileProvider>
            </AuthProvider>
        </ToastProvider>
    </BrowserRouter>
);