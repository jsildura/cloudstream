import { describe, it, expect, vi } from 'vitest';
import React, { memo, useRef } from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HoverPreviewProvider, useHoverPreview } from './HoverPreviewContext';

describe('HoverPreviewContext - Re-render stability', () => {
  it('maintains referential equality of context value across state changes', () => {
    let capturedValues = [];

    const TestConsumer = () => {
      const value = useHoverPreview();
      capturedValues.push(value);
      return <div data-testid="consumer">Consumer</div>;
    };

    const { rerender } = render(
      <MemoryRouter>
        <HoverPreviewProvider>
          <TestConsumer />
        </HoverPreviewProvider>
      </MemoryRouter>
    );

    // Initial render
    expect(capturedValues).toHaveLength(1);
    const initialValue = capturedValues[0];

    // Force parent provider re-render with dummy child update
    rerender(
      <MemoryRouter>
        <HoverPreviewProvider>
          <TestConsumer />
        </HoverPreviewProvider>
      </MemoryRouter>
    );

    // The context value must remain strictly identical by reference
    expect(capturedValues[1]).toBe(initialValue);
  });

  it('prevents React.memo wrapped consumers from re-rendering when preview triggers', () => {
    let renderCount = 0;

    const MemoizedRow = memo(() => {
      const { getPreviewProps } = useHoverPreview();
      renderCount++;
      return <div data-testid="row">Row rendered {renderCount}</div>;
    });

    const TriggerComponent = () => {
      const { openPreview } = useHoverPreview();
      return (
        <button
          data-testid="trigger"
          onClick={(e) => {
            openPreview(e.currentTarget, { id: 123, title: 'Test Movie' }, 'movie');
          }}
        >
          Hover Trigger
        </button>
      );
    };

    const { getByTestId, rerender } = render(
      <MemoryRouter>
        <HoverPreviewProvider>
          <MemoizedRow />
          <TriggerComponent />
        </HoverPreviewProvider>
      </MemoryRouter>
    );

    expect(renderCount).toBe(1);

    // Rerender parent
    rerender(
      <MemoryRouter>
        <HoverPreviewProvider>
          <MemoizedRow />
          <TriggerComponent />
        </HoverPreviewProvider>
      </MemoryRouter>
    );

    // Memoized row must NOT have re-rendered
    expect(renderCount).toBe(1);
  });

  it('provides safe inert no-op functions when used outside provider', () => {
    let outsideValue = null;

    const StandaloneComponent = () => {
      outsideValue = useHoverPreview();
      return <div>Standalone</div>;
    };

    render(<StandaloneComponent />);

    expect(outsideValue).toBeDefined();
    expect(typeof outsideValue.openPreview).toBe('function');
    expect(typeof outsideValue.closePreview).toBe('function');
    expect(typeof outsideValue.keepPreview).toBe('function');
    expect(typeof outsideValue.closeNow).toBe('function');
    expect(typeof outsideValue.getPreviewProps).toBe('function');

    // Executing no-ops should not throw
    expect(() => outsideValue.openPreview()).not.toThrow();
    expect(() => outsideValue.closePreview()).not.toThrow();
    expect(() => outsideValue.keepPreview()).not.toThrow();
    expect(() => outsideValue.closeNow()).not.toThrow();
    expect(outsideValue.getPreviewProps()).toEqual({});
  });
});
