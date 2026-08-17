import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/LegalPages.css';

const DataPolicy = () => {
    return (
        <div className="legal-page">
            <div className="legal-container">
                <header className="legal-header">
                    <h1 className="legal-title">Privacy Policy</h1>
                    <p className="legal-subtitle">Last updated: August 2026</p>
                </header>

                <div className="legal-card">
                    <section className="legal-section">
                        <h2 className="legal-section-title">At a Glance</h2>
                        <p>
                            StreamFlix offers free streaming with optional Google sign-in. You can browse, search, and watch anonymously without an account. When you choose to sign in with Google, we use Firebase Authentication to sync your watchlist and settings across devices.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Information We Collect</h2>
                        <p><strong>1. Optional Google Account Information:</strong></p>
                        <p>If you choose to sign in with Google, Firebase Authentication securely stores:</p>
                        <ul>
                            <li>Your Google user ID (UID)</li>
                            <li>Your Google display name and email address</li>
                            <li>Your public Google avatar URL (if provided)</li>
                        </ul>
                        <p><strong>2. Anonymous &amp; Device Information:</strong></p>
                        <p>
                            If you browse without signing in, a temporary anonymous Firebase session is created to enable public community chat and aggregate watch counts without identifying you personally.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">What Gets Saved On Your Device</h2>
                        <p>To optimize your streaming experience, the app saves local preferences directly in your browser:</p>
                        <ul>
                            <li><strong>Your watchlist &amp; continue watching</strong> — stored locally or synced when signed in</li>
                            <li><strong>Playback preferences</strong> — server selection and audio preferences</li>
                            <li><strong>Local session tokens</strong> — authentication and chat nickname claims</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Account Deletion &amp; Data Rights</h2>
                        <p>
                            <strong>Account &amp; Profile Deletion:</strong> You can request full deletion of your Google account record and cloud-stored profile data at any time by contacting us through our <Link to="/contact">Contact Page</Link>. Our team will delete your account data using authorized administrative procedures.
                        </p>
                        <p>
                            <strong>Signing Out:</strong> Signing out of your Google account switches your current device back to a clean anonymous session and clears local credentials. Signing out does not delete cloud-stored watchlist or profile data.
                        </p>
                        <p>
                            <strong>Anonymous Data:</strong> You can purge all locally stored anonymous data, cookies, and cached settings at any time using your browser's "Clear Site Data" or privacy controls.
                        </p>
                        <p>
                            <strong>Community Chat:</strong> Public chat messages are publicly broadcast in real-time and may be retained under moderation records.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">About the Ads</h2>
                        <p>
                            We show ads to keep StreamFlix free. Third-party advertising partners may use cookies to remember preferences or show non-personalized or relevant ads.
                        </p>
                        <p>
                            Want to manage personalized ad preferences? Visit{' '}
                            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Your Choices</h2>
                        <p>You have full control over your privacy:</p>
                        <ul>
                            <li>Browse completely anonymously without creating or linking an account</li>
                            <li>Clear your browser cookies and site data anytime</li>
                            <li>Request account and profile data deletion via our Contact page</li>
                            <li>Use private/incognito mode for temporary sessions</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Questions &amp; Requests</h2>
                        <p>
                            If you have questions about your data or wish to submit a data deletion request, please reach out via our{' '}
                            <Link to="/contact">Contact Page</Link>.
                        </p>
                    </section>
                </div>

                <nav className="legal-nav">
                    <Link to="/terms" className="legal-nav-link">Terms of Service</Link>
                    <Link to="/contact" className="legal-nav-link">Contact Us</Link>
                </nav>
            </div>
        </div>
    );
};

export default DataPolicy;
