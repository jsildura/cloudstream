import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Helper component that throws on demand
const ProblemChild = ({ shouldThrow, message = 'Test explosion' }) => {
    if (shouldThrow) {
        throw new Error(message);
    }
    return <div>Normal Content</div>;
};

describe('ErrorBoundary', () => {
    // Suppress expected console.error during boundary catch tests
    const originalConsoleError = console.error;
    beforeEach(() => {
        console.error = vi.fn();
    });
    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('renders children when there is no error', () => {
        render(
            <ErrorBoundary>
                <div>Safe Child</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Safe Child')).toBeInTheDocument();
    });

    it('catches render error and renders default fallback UI', () => {
        render(
            <ErrorBoundary>
                <ProblemChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        expect(screen.queryByText('Normal Content')).not.toBeInTheDocument();
    });

    it('renders custom message if provided', () => {
        render(
            <ErrorBoundary message="Custom error description here">
                <ProblemChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Custom error description here')).toBeInTheDocument();
    });

    it('renders custom fallback element when provided', () => {
        render(
            <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom UI</div>}>
                <ProblemChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('supports fallback={null} for silent component isolation (e.g. GlobalChat)', () => {
        const { container } = render(
            <ErrorBoundary fallback={null}>
                <ProblemChild shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(container.innerHTML).toBe('');
    });

    it('resets error state when clicking Try Again', () => {
        const StatefulParent = () => {
            const [hasError, setHasError] = useState(true);
            return (
                <ErrorBoundary onRetry={() => setHasError(false)}>
                    <ProblemChild shouldThrow={hasError} />
                </ErrorBoundary>
            );
        };

        render(<StatefulParent />);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(screen.getByText('Normal Content')).toBeInTheDocument();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
});
