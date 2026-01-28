import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Settings, ChevronDown, Check } from 'lucide-react';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import './SettingsMenu.css';

/**
 * Quality options
 */
const QUALITY_OPTIONS = [
    {
        value: 'HI_RES_LOSSLESS',
        label: 'Hi-Res',
        description: '24-bit FLAC (DASH) up to 192 kHz',
        disabled: false
    },
    {
        value: 'LOSSLESS',
        label: 'CD Lossless',
        description: '16-bit / 44.1 kHz FLAC'
    },
    {
        value: 'HIGH',
        label: '320kbps AAC',
        description: 'High quality AAC streaming'
    },
    {
        value: 'LOW',
        label: '96kbps AAC',
        description: 'Data saver AAC streaming'
    }
];

/**
 * Performance mode options
 */
const PERFORMANCE_OPTIONS = [
    {
        value: 'medium',
        label: 'Balanced',
        description: 'Smooth animations with visual effects'
    },
    {
        value: 'low',
        label: 'Performance',
        description: 'Minimal effects for better performance'
    }
];

/**
 * SettingsButton - Button that triggers the settings modal
 */
const SettingsButton = () => {
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const {
        playbackQuality,
        setPlaybackQuality,
        convertAacToMp3,
        toggleConvertAacToMp3,
        performanceMode,
        setPerformanceMode
    } = useMusicPreferences();

    // Get quality label for display
    const getQualityLabel = () => {
        if (playbackQuality === 'HI_RES_LOSSLESS') return 'Hi-Res';
        if (playbackQuality === 'LOSSLESS') return 'CD';
        return QUALITY_OPTIONS.find(opt => opt.value === playbackQuality)?.label ?? 'Quality';
    };

    const handleQualitySelect = (value) => {
        setPlaybackQuality(value);
        setShowSettingsMenu(false);
    };



    return (
        <>
            <button
                type="button"
                className={`settings-menu-btn ${showSettingsMenu ? 'is-active' : ''}`}
                onClick={() => {
                    setShowSettingsMenu(true);
                }}
                aria-haspopup="true"
                aria-expanded={showSettingsMenu}
                aria-label="Settings"
            >
                <div className="settings-menu-label">
                    <Settings size={20} />
                    <span className="settings-menu-text">Settings</span>
                </div>
                <span className="settings-menu-quality">{getQualityLabel()}</span>
                <span className={`settings-menu-chevron ${showSettingsMenu ? 'is-open' : ''}`}>
                    <ChevronDown size={14} />
                </span>
            </button>

            {showSettingsMenu && ReactDOM.createPortal(
                <div className="music-settings-overlay" onClick={() => setShowSettingsMenu(false)}>
                    <div className="music-settings-menu" onClick={e => e.stopPropagation()}>
                        <div className="music-settings-menu__grid">
                            {/* Streaming & Downloads Section */}
                            <section className="music-settings-section">
                                <p className="music-settings-section__heading">Streaming & Downloads</p>
                                <div className="music-settings-options">
                                    {QUALITY_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handleQualitySelect(option.value)}
                                            className={`music-settings-option ${option.value === playbackQuality ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}`}
                                            aria-pressed={option.value === playbackQuality}
                                            disabled={option.disabled}
                                        >
                                            <div className="music-settings-option__content">
                                                <span className="music-settings-option__label">{option.label}</span>
                                                <span className="music-settings-option__description">{option.description}</span>
                                            </div>
                                            {option.value === playbackQuality && (
                                                <Check size={16} className="music-settings-option__check" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Conversions Section */}
                            <section className="music-settings-section">
                                <p className="music-settings-section__heading">Conversions</p>
                                <button
                                    type="button"
                                    onClick={toggleConvertAacToMp3}
                                    className={`music-settings-option ${convertAacToMp3 ? 'is-active' : ''}`}
                                    aria-pressed={convertAacToMp3}
                                >
                                    <span className="music-settings-option__content">
                                        <span className="music-settings-option__label">Convert AAC downloads to MP3</span>
                                        <span className="music-settings-option__description">Applies to 320kbps and 96kbps downloads.</span>
                                    </span>
                                    <span className={`music-settings-option__chip ${convertAacToMp3 ? 'is-active' : ''}`}>
                                        {convertAacToMp3 ? 'On' : 'Off'}
                                    </span>
                                </button>

                            </section>



                            {/* Performance Mode Section */}
                            <section className="music-settings-section">
                                <p className="music-settings-section__heading">Performance Mode</p>
                                <div className="music-settings-options music-settings-options--compact">
                                    {PERFORMANCE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setPerformanceMode(option.value)}
                                            className={`music-settings-option music-settings-option--compact ${option.value === performanceMode ? 'is-active' : ''}`}
                                            aria-pressed={option.value === performanceMode}
                                        >
                                            <div className="music-settings-option__content">
                                                <span className="music-settings-option__label">{option.label}</span>
                                            </div>
                                            {option.value === performanceMode && (
                                                <Check size={14} className="music-settings-option__check" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>


                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default SettingsButton;
