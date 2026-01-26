import React from 'react';
import { Check } from 'lucide-react';
import { AUDIO_QUALITIES } from '../../contexts/MusicPlayerContext';
import './QualitySelector.css';

/**
 * Quality options with labels
 */
const QUALITY_OPTIONS = [
    {
        value: AUDIO_QUALITIES.HI_RES_LOSSLESS,
        label: 'Hi-Res',
        description: 'Up to 24-bit/192kHz FLAC',
        badge: 'Max'
    },
    {
        value: AUDIO_QUALITIES.LOSSLESS,
        label: 'Lossless',
        description: '16-bit/44.1kHz FLAC (CD Quality)',
        badge: 'CD'
    },
    {
        value: AUDIO_QUALITIES.HIGH,
        label: 'High',
        description: '320kbps AAC',
        badge: null
    },
    {
        value: AUDIO_QUALITIES.LOW,
        label: 'Normal',
        description: '96kbps AAC',
        badge: null
    }
];

/**
 * QualitySelector - Audio quality selection component
 * 
 * Ported from tidal-ui QualitySelector.svelte
 * Features:
 * - Quality options with descriptions
 * - Visual selection indicator
 * - Badge for premium qualities
 */
const QualitySelector = ({
    value,
    onChange,
    title = 'Audio Quality',
    compact = false
}) => {
    if (compact) {
        return (
            <div className="quality-selector quality-selector--compact">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="quality-selector__select"
                >
                    {QUALITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="quality-selector">
            {title && <h4 className="quality-selector__title">{title}</h4>}
            <div className="quality-selector__options">
                {QUALITY_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        className={`quality-selector__option ${value === option.value ? 'is-selected' : ''
                            }`}
                        onClick={() => onChange(option.value)}
                    >
                        <div className="quality-selector__option-header">
                            <span className="quality-selector__option-label">
                                {option.label}
                            </span>
                            {option.badge && (
                                <span className="quality-selector__option-badge">
                                    {option.badge}
                                </span>
                            )}
                        </div>
                        <span className="quality-selector__option-desc">
                            {option.description}
                        </span>
                        {value === option.value && (
                            <span className="quality-selector__check">
                                <Check size={16} />
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QualitySelector;
