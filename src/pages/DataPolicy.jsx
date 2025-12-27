import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/LegalPages.css';

const DataPolicy = () => {
    return (
        <div className="legal-page">
            <div className="legal-container">
                <header className="legal-header">
                    <h1 className="legal-title">Privacy Policy</h1>
                    <p className="legal-subtitle">Last updated: December 2024</p>
                </header>

                <div className="legal-card">
                    <section className="legal-section">
                        <h2 className="legal-section-title">At a Glance</h2>
                        <p>
                            We don't collect your personal information. The ads on our site may use cookies to show you relevant ads.
                            Your watchlist and preferences are saved only on your device we never see them.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">What We Don't Collect</h2>
                        <p>StreamFlix does not collect:</p>
                        <ul>
                            <li>Your name, email, or personal details</li>
                            <li>Your browsing history</li>
                            <li>Any data about what you watch</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">What Gets Saved On Your Device</h2>
                        <p>To make the site work better for you, we save some things directly on your device (not on our servers):</p>
                        <ul>
                            <li><strong>Your watchlist</strong> — movies and shows you add to "My List"</li>
                            <li><strong>Your preferences</strong> — like which server you last used</li>
                        </ul>
                        <p>This data stays on your device and we never see it.</p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">About the Ads</h2>
                        <p>
                            We show ads to keep StreamFlix free. These ads come from advertising companies like Adsterra, Google Adsense,etc.
                        </p>
                        <p>These ad companies may:</p>
                        <ul>
                            <li>Use cookies (small files) to remember your preferences</li>
                            <li>Show you ads based on websites you've visited before</li>
                        </ul>
                        <p>
                            Want to turn off personalized ads? Visit{' '}
                            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Your Choices</h2>
                        <p>You can:</p>
                        <ul>
                            <li>Clear your browser cookies anytime to reset ad preferences</li>
                            <li>Use your browser's private/incognito mode</li>
                            <li>Turn off personalized ads through Google's settings</li>
                        </ul>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Kids Under 13</h2>
                        <p>
                            StreamFlix is not meant for children under 13. If you're under 13, please use this site with a parent or guardian.
                        </p>
                    </section>

                    <section className="legal-section">
                        <h2 className="legal-section-title">Questions?</h2>
                        <p>
                            If anything here is unclear, feel free to reach out on our{' '}
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
