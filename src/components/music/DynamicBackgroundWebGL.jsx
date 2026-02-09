import React, { useRef, useEffect, useCallback } from 'react';
import { useMusicPreferences } from '../../contexts/MusicPreferencesContext';
import { extractPaletteFromImage, getMostVibrantColor } from '../../lib/music/colorExtraction';
import {
    vertexShaderSource,
    updateStateShaderSource,
    colorRenderShaderSource,
    blurFragmentShaderSource,
    createShader,
    createProgram,
    createTexture,
    createFramebuffer
} from '../../lib/music/webglShaders';
import './DynamicBackgroundWebGL.css';

/**
 * DynamicBackgroundWebGL - WebGL-powered animated gradient background
 * 
 * Ported from tidal-ui/src/lib/components/DynamicBackgroundWebGL.svelte
 * Features:
 * - Fluid color gradient animation using WebGL shaders
 * - Color palette extraction from album art
 * - Smooth transitions between songs
 * - Performance-aware (disabled in low mode)
 */

// Constants
const DISPLAY_CANVAS_SIZE = 128;
const MASTER_PALETTE_SIZE = 40;
const DISPLAY_GRID_WIDTH = 8;
const DISPLAY_GRID_HEIGHT = 5;
const STRETCHED_GRID_WIDTH = 32;
const STRETCHED_GRID_HEIGHT = 18;
const BLUR_DOWNSAMPLE_FACTOR = 6;
const SONG_PALETTE_TRANSITION_SPEED = 0.015;
const SCROLL_SPEED = 0.008;

const DynamicBackgroundWebGL = ({ coverUrl, className = '', style = {} }) => {
    const canvasRef = useRef(null);
    const glRef = useRef(null);
    const animationFrameIdRef = useRef(null);

    // Shader programs
    const updateStateProgramRef = useRef(null);
    const colorRenderProgramRef = useRef(null);
    const blurProgramRef = useRef(null);

    // Textures
    const paletteTextureRef = useRef(null);
    const cellStateTextureRef = useRef(null);
    const cellStateTexture2Ref = useRef(null);
    const colorRenderTextureRef = useRef(null);
    const blurTexture1Ref = useRef(null);
    const blurTexture2Ref = useRef(null);

    // Framebuffers
    const stateFramebuffer1Ref = useRef(null);
    const stateFramebuffer2Ref = useRef(null);
    const colorRenderFramebufferRef = useRef(null);
    const blurFramebuffer1Ref = useRef(null);
    const blurFramebuffer2Ref = useRef(null);

    // Animation state
    const previousPaletteRef = useRef([]);
    const targetPaletteRef = useRef([]);
    const songPaletteTransitionProgressRef = useRef(1.0);
    const scrollOffsetRef = useRef(0.0);
    const lastFrameTimeRef = useRef(performance.now());
    const currentStateTextureRef = useRef(0);
    const currentCoverUrlRef = useRef(null); // Track changing url string
    const isVisibleRef = useRef(true);
    const isCleanedUpRef = useRef(false);

    // Get state from contexts
    const { performanceMode } = useMusicPreferences();
    const isLightweight = performanceMode === 'low';

    // Initialize cell states with random values
    const initializeCellStates = useCallback(() => {
        const gl = glRef.current;
        if (!gl || !cellStateTextureRef.current) return;

        const stateData = new Uint8Array(DISPLAY_GRID_WIDTH * DISPLAY_GRID_HEIGHT * 4);

        for (let i = 0; i < MASTER_PALETTE_SIZE; i++) {
            const idx = i * 4;
            const sourceIdx = Math.floor(Math.random() * MASTER_PALETTE_SIZE);
            const targetIdx = Math.floor(Math.random() * MASTER_PALETTE_SIZE);
            const progress = Math.random();
            const speed = (Math.random() * 0.5 + 0.5) * 0.48;

            stateData[idx] = Math.round((sourceIdx / 39) * 255);
            stateData[idx + 1] = Math.round((targetIdx / 39) * 255);
            stateData[idx + 2] = Math.round(progress * 255);
            stateData[idx + 3] = Math.round((speed / 10.0) * 255);
        }

        gl.bindTexture(gl.TEXTURE_2D, cellStateTextureRef.current);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            DISPLAY_GRID_WIDTH,
            DISPLAY_GRID_HEIGHT,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            stateData
        );
    }, []);

    // Update palette texture with current and target colors
    const updatePaletteTexture = useCallback(() => {
        const gl = glRef.current;
        if (!gl || !paletteTextureRef.current) return;

        const textureData = new Uint8Array(DISPLAY_GRID_WIDTH * DISPLAY_GRID_HEIGHT * 2 * 4);

        // Write previous palette to rows 0-4
        for (let i = 0; i < MASTER_PALETTE_SIZE; i++) {
            const color = previousPaletteRef.current[i] || { r: 0, g: 0, b: 0, a: 255 };
            const idx = i * 4;
            textureData[idx] = color.r;
            textureData[idx + 1] = color.g;
            textureData[idx + 2] = color.b;
            textureData[idx + 3] = color.a;
        }

        // Write target palette to rows 5-9
        for (let i = 0; i < MASTER_PALETTE_SIZE; i++) {
            const color = targetPaletteRef.current[i] || { r: 0, g: 0, b: 0, a: 255 };
            const idx = (MASTER_PALETTE_SIZE + i) * 4;
            textureData[idx] = color.r;
            textureData[idx + 1] = color.g;
            textureData[idx + 2] = color.b;
            textureData[idx + 3] = color.a;
        }

        gl.bindTexture(gl.TEXTURE_2D, paletteTextureRef.current);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            DISPLAY_GRID_WIDTH,
            DISPLAY_GRID_HEIGHT * 2,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            textureData
        );
    }, []);

    // Set up vertex attributes for a program
    const setupAttributes = useCallback((program) => {
        const gl = glRef.current;
        if (!gl) return;

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

        const positions = new Float32Array([
            -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0
        ]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const texCoords = new Float32Array([
            0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0
        ]);
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    }, []);

    // Update cell states pass
    const updateCellStates = useCallback((deltaTime, currentTime) => {
        const gl = glRef.current;
        const program = updateStateProgramRef.current;
        if (!gl || !program) return;

        gl.useProgram(program);

        const sourceTexture = currentStateTextureRef.current === 0
            ? cellStateTextureRef.current
            : cellStateTexture2Ref.current;
        const targetFramebuffer = currentStateTextureRef.current === 0
            ? stateFramebuffer2Ref.current
            : stateFramebuffer1Ref.current;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_currentStateTexture'), 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_deltaTime'), deltaTime);
        gl.uniform1f(gl.getUniformLocation(program, 'u_time'), currentTime);

        setupAttributes(program);

        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
        gl.viewport(0, 0, DISPLAY_GRID_WIDTH, DISPLAY_GRID_HEIGHT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        currentStateTextureRef.current = 1 - currentStateTextureRef.current;
    }, [setupAttributes]);

    // Render colors pass
    const renderColors = useCallback(() => {
        const gl = glRef.current;
        const program = colorRenderProgramRef.current;
        if (!gl || !program) return;

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, paletteTextureRef.current);
        gl.uniform1i(gl.getUniformLocation(program, 'u_paletteTexture'), 0);

        const currentTexture = currentStateTextureRef.current === 0
            ? cellStateTextureRef.current
            : cellStateTexture2Ref.current;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, currentTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'u_cellStateTexture'), 1);

        gl.uniform1f(
            gl.getUniformLocation(program, 'u_songPaletteTransitionProgress'),
            songPaletteTransitionProgressRef.current
        );
        gl.uniform1f(gl.getUniformLocation(program, 'u_scrollOffset'), scrollOffsetRef.current);

        setupAttributes(program);

        gl.bindFramebuffer(gl.FRAMEBUFFER, colorRenderFramebufferRef.current);
        gl.viewport(0, 0, STRETCHED_GRID_WIDTH, STRETCHED_GRID_HEIGHT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [setupAttributes]);

    // Horizontal blur pass
    const renderHorizontalBlur = useCallback(() => {
        const gl = glRef.current;
        const program = blurProgramRef.current;
        if (!gl || !program) return;

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, colorRenderTextureRef.current);
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

        const blurWidth = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);
        const blurHeight = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);

        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), blurWidth, blurHeight);
        gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 1.0, 0.0);

        setupAttributes(program);

        gl.bindFramebuffer(gl.FRAMEBUFFER, blurFramebuffer1Ref.current);
        gl.viewport(0, 0, blurWidth, blurHeight);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [setupAttributes]);

    // Vertical blur pass (final output)
    const renderVerticalBlur = useCallback(() => {
        const gl = glRef.current;
        const program = blurProgramRef.current;
        if (!gl || !program) return;

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blurTexture1Ref.current);
        gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

        const blurWidth = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);
        const blurHeight = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);

        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), blurWidth, blurHeight);
        gl.uniform2f(gl.getUniformLocation(program, 'u_direction'), 0.0, 1.0);

        setupAttributes(program);

        // Render to canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, DISPLAY_CANVAS_SIZE, DISPLAY_CANVAS_SIZE);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [setupAttributes]);

    // Main animation loop
    const animate = useCallback((currentTime) => {
        const gl = glRef.current;
        // Skip if cleaned up, not visible, or in lightweight mode
        if (!gl || isCleanedUpRef.current || !isVisibleRef.current || isLightweight) {
            if (!isCleanedUpRef.current) {
                animationFrameIdRef.current = requestAnimationFrame(animate);
            }
            return;
        }

        const deltaTime = Math.min((currentTime - lastFrameTimeRef.current) / 1000, 0.1);
        lastFrameTimeRef.current = currentTime;

        // Update animation state
        if (songPaletteTransitionProgressRef.current < 1.0) {
            songPaletteTransitionProgressRef.current = Math.min(
                1.0,
                songPaletteTransitionProgressRef.current + SONG_PALETTE_TRANSITION_SPEED
            );
        }

        scrollOffsetRef.current += SCROLL_SPEED * deltaTime;
        if (scrollOffsetRef.current >= 1.0) scrollOffsetRef.current -= 1.0;

        // Render pipeline
        updateCellStates(deltaTime, currentTime);
        renderColors();
        renderHorizontalBlur();
        renderVerticalBlur();

        animationFrameIdRef.current = requestAnimationFrame(animate);

    }, [updateCellStates, renderColors, renderHorizontalBlur, renderVerticalBlur]);

    // Update from track (extract colors from album art)
    const updateFromTrack = useCallback(async (coverUrl) => {
        // Skip if component is being/has been cleaned up
        if (isCleanedUpRef.current) return;

        try {
            const palette = await extractPaletteFromImage(
                coverUrl,
                DISPLAY_GRID_WIDTH,
                DISPLAY_GRID_HEIGHT,
                STRETCHED_GRID_WIDTH,
                STRETCHED_GRID_HEIGHT
            );

            // Check again after async operation
            if (isCleanedUpRef.current) return;

            // Shift current target to previous
            previousPaletteRef.current = targetPaletteRef.current.length > 0
                ? targetPaletteRef.current
                : palette;
            targetPaletteRef.current = palette;

            // Update palette texture
            updatePaletteTexture();

            // Reset transition
            songPaletteTransitionProgressRef.current = 0.0;

            // Set vibrant color CSS variable
            const vibrantColor = getMostVibrantColor(palette);
            document.documentElement.style.setProperty(
                '--dynamic-bg-vibrant',
                `rgb(${vibrantColor.r}, ${vibrantColor.g}, ${vibrantColor.b})`
            );
            document.documentElement.style.setProperty(
                '--bloom-accent',
                `rgba(${vibrantColor.r}, ${vibrantColor.g}, ${vibrantColor.b}, 0.7)`
            );
        } catch (error) {
            console.error('Failed to update background from track:', error);
        }
    }, [updatePaletteTexture]);

    // Initialize WebGL
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = DISPLAY_CANVAS_SIZE;
        canvas.height = DISPLAY_CANVAS_SIZE;

        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false
        });

        if (!gl) {
            console.error('WebGL not supported');
            return;
        }

        glRef.current = gl;

        // Create shaders
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        if (!vertexShader) return;

        const updateStateFragShader = createShader(gl, gl.FRAGMENT_SHADER, updateStateShaderSource);
        if (updateStateFragShader) {
            updateStateProgramRef.current = createProgram(gl, vertexShader, updateStateFragShader);
        }

        const colorRenderFragShader = createShader(gl, gl.FRAGMENT_SHADER, colorRenderShaderSource);
        if (colorRenderFragShader) {
            colorRenderProgramRef.current = createProgram(gl, vertexShader, colorRenderFragShader);
        }

        const blurFragShader = createShader(gl, gl.FRAGMENT_SHADER, blurFragmentShaderSource);
        if (blurFragShader) {
            blurProgramRef.current = createProgram(gl, vertexShader, blurFragShader);
        }

        // Create textures
        const blurWidth = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);
        const blurHeight = Math.round(DISPLAY_CANVAS_SIZE / BLUR_DOWNSAMPLE_FACTOR);

        paletteTextureRef.current = createTexture(gl, DISPLAY_GRID_WIDTH, DISPLAY_GRID_HEIGHT * 2);
        cellStateTextureRef.current = createTexture(gl, DISPLAY_GRID_WIDTH, DISPLAY_GRID_HEIGHT);
        cellStateTexture2Ref.current = createTexture(gl, DISPLAY_GRID_WIDTH, DISPLAY_GRID_HEIGHT);
        colorRenderTextureRef.current = createTexture(gl, STRETCHED_GRID_WIDTH, STRETCHED_GRID_HEIGHT, null, gl.LINEAR);
        blurTexture1Ref.current = createTexture(gl, blurWidth, blurHeight, null, gl.LINEAR);
        blurTexture2Ref.current = createTexture(gl, blurWidth, blurHeight, null, gl.LINEAR);

        // Create framebuffers
        stateFramebuffer1Ref.current = createFramebuffer(gl, cellStateTextureRef.current);
        stateFramebuffer2Ref.current = createFramebuffer(gl, cellStateTexture2Ref.current);
        colorRenderFramebufferRef.current = createFramebuffer(gl, colorRenderTextureRef.current);
        blurFramebuffer1Ref.current = createFramebuffer(gl, blurTexture1Ref.current);
        blurFramebuffer2Ref.current = createFramebuffer(gl, blurTexture2Ref.current);

        // Initialize cell states
        initializeCellStates();

        // Start animation
        lastFrameTimeRef.current = performance.now();
        animationFrameIdRef.current = requestAnimationFrame(animate);

        return () => {
            // Mark as cleaned up first to prevent animation loop from using deleted resources
            isCleanedUpRef.current = true;

            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            // Cleanup WebGL resources
            if (gl) {
                if (paletteTextureRef.current) gl.deleteTexture(paletteTextureRef.current);
                if (cellStateTextureRef.current) gl.deleteTexture(cellStateTextureRef.current);
                if (cellStateTexture2Ref.current) gl.deleteTexture(cellStateTexture2Ref.current);
                if (colorRenderTextureRef.current) gl.deleteTexture(colorRenderTextureRef.current);
                if (blurTexture1Ref.current) gl.deleteTexture(blurTexture1Ref.current);
                if (blurTexture2Ref.current) gl.deleteTexture(blurTexture2Ref.current);

                // Clear refs to prevent accidental reuse
                paletteTextureRef.current = null;
                cellStateTextureRef.current = null;
                cellStateTexture2Ref.current = null;
                colorRenderTextureRef.current = null;
                blurTexture1Ref.current = null;
                blurTexture2Ref.current = null;
            }
        };
    }, [initializeCellStates, animate]);

    // React to track (cover) changes
    useEffect(() => {
        if (!coverUrl || coverUrl === currentCoverUrlRef.current) return;

        currentCoverUrlRef.current = coverUrl;
        updateFromTrack(coverUrl);
    }, [coverUrl, updateFromTrack]);

    return (
        <div className={`dynamic-background-container ${className}`} style={style}>
            <canvas ref={canvasRef} className="dynamic-background-canvas" />
        </div>
    );
};

export default React.memo(DynamicBackgroundWebGL);
